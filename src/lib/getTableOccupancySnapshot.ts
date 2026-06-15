import { supabase } from "@/integrations/supabase/client";
import type {
  RestaurantTable,
  TableCombination,
  Zone,
  ReservationStatus,
} from "@/lib/types";

const DEFAULT_SLOT_MIN = 120;

function minutesBetween(a: string, b: string) {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return Math.abs(ah * 60 + am - (bh * 60 + bm));
}

function fmtTime(t: string) {
  return (t ?? "").slice(0, 5);
}

export type TableOccupancyStatus =
  | "available"
  | "occupied"
  | "inactive"
  | "invalid_capacity";

export type CombinationOccupancyStatus =
  | "available"
  | "occupied"
  | "partially_occupied"
  | "inactive"
  | "invalid_capacity";

export interface OccupiedBySummary {
  reservationId: string;
  customerName: string;
  partySize: number;
  time: string; // HH:MM
  status: ReservationStatus;
}

export interface TableOccupancy {
  tableId: string;
  label: string;
  zoneId: string;
  zoneName: string | null;
  min_capacity: number;
  max_capacity: number;
  is_active: boolean;
  status: TableOccupancyStatus;
  occupiedByReservationId: string | null;
  occupiedBySummary: OccupiedBySummary | null;
  visual_x: number | null;
  visual_y: number | null;
  visual_width: number | null;
  visual_height: number | null;
  visual_shape: RestaurantTable["visual_shape"];
  visual_rotation: number;
}

export interface CombinationOccupancy {
  combinationId: string;
  name: string;
  zoneId: string | null;
  tableIds: string[];
  min_capacity: number;
  max_capacity: number;
  status: CombinationOccupancyStatus;
  blockedByReservations: OccupiedBySummary[];
}

export interface TableOccupancySnapshot {
  date: string;
  time: string;
  partySize: number | null;
  tables: TableOccupancy[];
  combinations: CombinationOccupancy[];
  debug: {
    totalTables: number;
    occupiedTableIds: string[];
    activeServiceWindow: boolean;
  };
}

/**
 * Returns a full occupancy snapshot for a given date/time. This is the
 * canonical source of truth for "which tables and combinations are
 * available/occupied right now" and is intended to back the Today map
 * and smart suggestions.
 *
 * Rules:
 * - `reservation_tables` is the primary source; falls back to
 *   `reservations.table_id` when no rows exist for a reservation.
 * - Cancelled / no_show reservations never block.
 * - pending, confirmed, modified always block when within the slot window.
 * - requires_human blocks only if there is an active service at `time`.
 * - `excludeReservationId` lets edit flows ignore their own assignment.
 */
export async function getTableOccupancySnapshot(opts: {
  restaurantId: string;
  date: string;
  time: string;
  partySize?: number;
  excludeReservationId?: string;
  slotMinutes?: number;
}): Promise<TableOccupancySnapshot> {
  const { restaurantId, date, excludeReservationId } = opts;
  const slotWindow = opts.slotMinutes ?? DEFAULT_SLOT_MIN;
  const time = fmtTime(opts.time);
  const partySize = opts.partySize ?? null;

  const empty: TableOccupancySnapshot = {
    date,
    time,
    partySize,
    tables: [],
    combinations: [],
    debug: {
      totalTables: 0,
      occupiedTableIds: [],
      activeServiceWindow: false,
    },
  };
  if (!restaurantId || !date || !time) return empty;

  const [
    { data: tablesData },
    { data: zonesData },
    { data: combosData },
    { data: comboTablesData },
    { data: reservationsData },
    { data: scheduleData },
  ] = await Promise.all([
    supabase.from("restaurant_tables").select("*").eq("restaurant_id", restaurantId),
    supabase.from("restaurant_zones").select("*").eq("restaurant_id", restaurantId),
    supabase.from("table_combinations").select("*").eq("restaurant_id", restaurantId),
    supabase.from("table_combination_tables").select("*"),
    supabase
      .from("reservations")
      .select(
        "id, customer_name, party_size, table_id, reservation_time, status",
      )
      .eq("restaurant_id", restaurantId)
      .eq("reservation_date", date)
      .not("status", "in", "(cancelled,no_show)"),
    supabase
      .from("restaurant_schedule")
      .select("day_of_week, is_open, opening_time, closing_time")
      .eq("restaurant_id", restaurantId),
  ]);

  const tables = (tablesData ?? []) as RestaurantTable[];
  const zones = (zonesData ?? []) as Zone[];
  const combos = (combosData ?? []) as TableCombination[];
  const comboTables = (comboTablesData ?? []) as Array<{
    combination_id: string;
    table_id: string;
  }>;
  const reservations = (reservationsData ?? []) as Array<{
    id: string;
    customer_name: string;
    party_size: number;
    table_id: string | null;
    reservation_time: string;
    status: ReservationStatus;
  }>;

  // Determine whether `time` falls inside an active service for this date.
  const dow = new Date(`${date}T00:00:00`).getDay();
  const [hh, mm] = time.split(":").map(Number);
  const tMin = hh * 60 + mm;
  const activeServiceWindow = ((scheduleData ?? []) as Array<{
    day_of_week: number;
    is_open: boolean;
    opening_time: string | null;
    closing_time: string | null;
  }>).some((row) => {
    if (row.day_of_week !== dow || !row.is_open) return false;
    if (!row.opening_time || !row.closing_time) return false;
    const [oh, om] = row.opening_time.split(":").map(Number);
    const [ch, cm] = row.closing_time.split(":").map(Number);
    return tMin >= oh * 60 + om && tMin <= ch * 60 + cm;
  });

  // Filter to reservations within the slot window and that block tables.
  const blocking = reservations.filter((r) => {
    if (excludeReservationId && r.id === excludeReservationId) return false;
    if (minutesBetween(time, String(r.reservation_time)) >= slotWindow) return false;
    if (r.status === "requires_human") return activeServiceWindow;
    // pending / confirmed / modified
    return true;
  });

  // Build occupancy map: tableId -> blocking reservation
  const occupiedBy = new Map<string, (typeof blocking)[number]>();
  if (blocking.length > 0) {
    const ids = blocking.map((r) => r.id);
    const { data: rtRows } = await supabase
      .from("reservation_tables")
      .select("reservation_id, table_id")
      .in("reservation_id", ids);
    const reservationsWithRows = new Set<string>();
    const byId = new Map(blocking.map((r) => [r.id, r] as const));
    for (const row of (rtRows ?? []) as Array<{
      reservation_id: string;
      table_id: string;
    }>) {
      reservationsWithRows.add(row.reservation_id);
      const r = byId.get(row.reservation_id);
      if (r && !occupiedBy.has(row.table_id)) occupiedBy.set(row.table_id, r);
    }
    for (const r of blocking) {
      if (r.table_id && !reservationsWithRows.has(r.id) && !occupiedBy.has(r.table_id)) {
        occupiedBy.set(r.table_id, r);
      }
    }
  }

  const zoneById = new Map(zones.map((z) => [z.id, z]));

  const toSummary = (r: (typeof blocking)[number]): OccupiedBySummary => ({
    reservationId: r.id,
    customerName: r.customer_name,
    partySize: r.party_size,
    time: fmtTime(String(r.reservation_time)),
    status: r.status,
  });

  const tableOccupancies: TableOccupancy[] = tables.map((t) => {
    const zone = zoneById.get(t.zone_id) ?? null;
    const blocker = occupiedBy.get(t.id) ?? null;
    let status: TableOccupancyStatus;
    if (!t.is_active) status = "inactive";
    else if (blocker) status = "occupied";
    else if (
      partySize != null &&
      (partySize < t.min_capacity || partySize > t.max_capacity)
    )
      status = "invalid_capacity";
    else status = "available";

    return {
      tableId: t.id,
      label: t.label,
      zoneId: t.zone_id,
      zoneName: zone?.name ?? null,
      min_capacity: t.min_capacity,
      max_capacity: t.max_capacity,
      is_active: t.is_active,
      status,
      occupiedByReservationId: blocker?.id ?? null,
      occupiedBySummary: blocker ? toSummary(blocker) : null,
      visual_x: t.visual_x,
      visual_y: t.visual_y,
      visual_width: t.visual_width,
      visual_height: t.visual_height,
      visual_shape: t.visual_shape,
      visual_rotation: t.visual_rotation,
    };
  });

  const tableById = new Map(tables.map((t) => [t.id, t]));
  const tablesByCombo = new Map<string, string[]>();
  for (const ct of comboTables) {
    const arr = tablesByCombo.get(ct.combination_id) ?? [];
    arr.push(ct.table_id);
    tablesByCombo.set(ct.combination_id, arr);
  }

  const combinationOccupancies: CombinationOccupancy[] = combos.map((c) => {
    const ids = tablesByCombo.get(c.id) ?? [];
    const members = ids
      .map((id) => tableById.get(id))
      .filter((t): t is RestaurantTable => !!t);
    const blockedSummaries: OccupiedBySummary[] = [];
    const seen = new Set<string>();
    for (const t of members) {
      const b = occupiedBy.get(t.id);
      if (b && !seen.has(b.id)) {
        seen.add(b.id);
        blockedSummaries.push(toSummary(b));
      }
    }
    const min = c.min_capacity ?? 1;
    const hasInactive = members.some((t) => !t.is_active) || !c.is_active;
    const blockedCount = members.filter((t) => occupiedBy.has(t.id)).length;

    let status: CombinationOccupancyStatus;
    if (hasInactive) status = "inactive";
    else if (blockedCount === members.length && members.length > 0) status = "occupied";
    else if (blockedCount > 0) status = "partially_occupied";
    else if (
      partySize != null &&
      (partySize < min || partySize > c.max_capacity)
    )
      status = "invalid_capacity";
    else status = "available";

    return {
      combinationId: c.id,
      name: c.name,
      zoneId: c.zone_id,
      tableIds: ids,
      min_capacity: min,
      max_capacity: c.max_capacity,
      status,
      blockedByReservations: blockedSummaries,
    };
  });

  return {
    date,
    time,
    partySize,
    tables: tableOccupancies,
    combinations: combinationOccupancies,
    debug: {
      totalTables: tables.length,
      occupiedTableIds: Array.from(occupiedBy.keys()),
      activeServiceWindow,
    },
  };
}