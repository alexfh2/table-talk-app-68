import { supabase } from "@/integrations/supabase/client";

export type AutoAssignResult =
  | { tableId: string; needsReview: false; tableLabel: string }
  | { tableId: null; needsReview: true; reason: "needs_human_review"; freeSeats: number }
  | { tableId: null; needsReview: false; reason: "no_capacity"; freeSeats: number };

const DEFAULT_SLOT_MIN = 120;

function minutesBetween(a: string, b: string) {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return Math.abs(ah * 60 + am - (bh * 60 + bm));
}

/**
 * Auto-assigns the smallest table that fits the party size and is not
 * occupied by another reservation overlapping the requested time window.
 *
 * If no single table fits but the sum of free table capacities is enough
 * to seat the party, returns needsReview=true so the caller can flag the
 * reservation for manual reassignment.
 */
export async function autoAssignTable(opts: {
  restaurantId: string;
  date: string;
  time: string; // HH:MM[:SS]
  partySize: number;
  ignoreReservationId?: string;
  slotMinutes?: number;
}): Promise<AutoAssignResult> {
  const { restaurantId, date, partySize } = opts;
  const time = opts.time.slice(0, 5);
  const window = opts.slotMinutes ?? DEFAULT_SLOT_MIN;

  const [{ data: tables }, { data: reservations }] = await Promise.all([
    supabase
      .from("restaurant_tables")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true),
    supabase
      .from("reservations")
      .select("id, table_id, reservation_time, status")
      .eq("restaurant_id", restaurantId)
      .eq("reservation_date", date)
      .not("status", "in", "(cancelled,no_show)"),
  ]);

  const activeTables = (tables ?? []) as Array<{
    id: string; label: string; min_capacity: number; max_capacity: number; sort_order: number | null;
  }>;

  const occupied = new Set<string>();
  for (const r of reservations ?? []) {
    if (!r.table_id) continue;
    if (opts.ignoreReservationId && r.id === opts.ignoreReservationId) continue;
    if (minutesBetween(time, String(r.reservation_time)) < window) occupied.add(r.table_id);
  }

  const free = activeTables.filter((t) => !occupied.has(t.id));

  // Smallest table that fits
  const candidates = free
    .filter((t) => t.max_capacity >= partySize)
    .sort((a, b) =>
      a.max_capacity !== b.max_capacity
        ? a.max_capacity - b.max_capacity
        : (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );

  if (candidates.length > 0) {
    const t = candidates[0];
    return { tableId: t.id, needsReview: false, tableLabel: t.label };
  }

  const freeSeats = free.reduce((s, t) => s + (t.max_capacity ?? 0), 0);
  if (freeSeats >= partySize) {
    return { tableId: null, needsReview: true, reason: "needs_human_review", freeSeats };
  }
  return { tableId: null, needsReview: false, reason: "no_capacity", freeSeats };
}