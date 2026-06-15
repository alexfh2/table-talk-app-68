import { supabase } from "@/integrations/supabase/client";
import type { RestaurantTable, TableCombination, Zone } from "@/lib/types";

const DEFAULT_SLOT_MIN = 120;

function minutesBetween(a: string, b: string) {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return Math.abs(ah * 60 + am - (bh * 60 + bm));
}

export interface AvailableCombination {
  combination: TableCombination;
  tables: RestaurantTable[];
  zone: Zone | null;
}

export interface AvailableTableOptions {
  individualTables: RestaurantTable[];
  combinations: AvailableCombination[];
  unavailableReason?:
    | "no_active_tables"
    | "no_capacity_fit"
    | "all_occupied"
    | "missing_inputs";
  debug: {
    activeTables: number;
    freeTables: number;
    occupiedTableIds: string[];
    candidatesIndividual: number;
    candidatesCombinations: number;
  };
}

/**
 * Returns the individual tables and table combinations that are available
 * for a given date/time/party size. Uses `reservation_tables` as the
 * primary source of table occupancy, falling back to `reservations.table_id`
 * for reservations that have no rows there yet.
 */
export async function getAvailableTableOptions(opts: {
  restaurantId: string;
  date: string;
  time: string; // HH:MM[:SS]
  partySize: number;
  excludeReservationId?: string;
  slotMinutes?: number;
}): Promise<AvailableTableOptions> {
  const { restaurantId, date, partySize, excludeReservationId } = opts;
  const slotWindow = opts.slotMinutes ?? DEFAULT_SLOT_MIN;
  const time = (opts.time ?? "").slice(0, 5);

  const emptyDebug = {
    activeTables: 0,
    freeTables: 0,
    occupiedTableIds: [] as string[],
    candidatesIndividual: 0,
    candidatesCombinations: 0,
  };

  if (!restaurantId || !date || !time || !partySize) {
    return {
      individualTables: [],
      combinations: [],
      unavailableReason: "missing_inputs",
      debug: emptyDebug,
    };
  }

  const [
    { data: tablesData },
    { data: zonesData },
    { data: combosData },
    { data: comboTablesData },
    { data: reservationsData },
  ] = await Promise.all([
    supabase.from("restaurant_tables").select("*").eq("restaurant_id", restaurantId),
    supabase.from("restaurant_zones").select("*").eq("restaurant_id", restaurantId),
    supabase.from("table_combinations").select("*").eq("restaurant_id", restaurantId),
    supabase.from("table_combination_tables").select("*"),
    supabase
      .from("reservations")
      .select("id, table_id, reservation_time, status")
      .eq("restaurant_id", restaurantId)
      .eq("reservation_date", date)
      .not("status", "in", "(cancelled,no_show)"),
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
    table_id: string | null;
    reservation_time: string;
    status: string;
  }>;

  const activeTables = tables.filter((t) => t.is_active);
  if (activeTables.length === 0) {
    return {
      individualTables: [],
      combinations: [],
      unavailableReason: "no_active_tables",
      debug: { ...emptyDebug },
    };
  }

  // Build occupancy from reservation_tables (primary) + fallback to reservations.table_id.
  const overlappingReservations = reservations.filter((r) => {
    if (excludeReservationId && r.id === excludeReservationId) return false;
    return minutesBetween(time, String(r.reservation_time)) < slotWindow;
  });
  const overlappingIds = overlappingReservations.map((r) => r.id);

  const occupied = new Set<string>();
  if (overlappingIds.length > 0) {
    const { data: rtRows } = await supabase
      .from("reservation_tables")
      .select("reservation_id, table_id")
      .in("reservation_id", overlappingIds);
    const reservationsWithRows = new Set<string>();
    for (const row of (rtRows ?? []) as Array<{ reservation_id: string; table_id: string }>) {
      occupied.add(row.table_id);
      reservationsWithRows.add(row.reservation_id);
    }
    // Fallback: reservations.table_id for those without reservation_tables rows.
    for (const r of overlappingReservations) {
      if (r.table_id && !reservationsWithRows.has(r.id)) occupied.add(r.table_id);
    }
  }

  const freeTables = activeTables.filter((t) => !occupied.has(t.id));

  const individualTables = freeTables
    .filter((t) => partySize >= t.min_capacity && partySize <= t.max_capacity)
    .sort((a, b) =>
      a.max_capacity !== b.max_capacity
        ? a.max_capacity - b.max_capacity
        : (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );

  // Build combinations
  const tableById = new Map(tables.map((t) => [t.id, t]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const tablesByCombo = new Map<string, string[]>();
  for (const ct of comboTables) {
    const arr = tablesByCombo.get(ct.combination_id) ?? [];
    arr.push(ct.table_id);
    tablesByCombo.set(ct.combination_id, arr);
  }

  const combinations: AvailableCombination[] = [];
  for (const c of combos) {
    if (!c.is_active) continue;
    const min = c.min_capacity ?? 1;
    if (partySize < min || partySize > c.max_capacity) continue;
    const ids = tablesByCombo.get(c.id) ?? [];
    if (ids.length < 2) continue;
    const memberTables = ids
      .map((id) => tableById.get(id))
      .filter((t): t is RestaurantTable => !!t);
    if (memberTables.length !== ids.length) continue;
    if (memberTables.some((t) => !t.is_active)) continue;
    if (memberTables.some((t) => occupied.has(t.id))) continue;
    const zoneIds = new Set(memberTables.map((t) => t.zone_id));
    if (zoneIds.size !== 1) continue;
    const zone = zoneById.get(memberTables[0].zone_id) ?? null;
    combinations.push({ combination: c, tables: memberTables, zone });
  }

  combinations.sort(
    (a, b) => a.combination.max_capacity - b.combination.max_capacity,
  );

  let unavailableReason: AvailableTableOptions["unavailableReason"];
  if (individualTables.length === 0 && combinations.length === 0) {
    if (freeTables.length === 0) unavailableReason = "all_occupied";
    else unavailableReason = "no_capacity_fit";
  }

  return {
    individualTables,
    combinations,
    unavailableReason,
    debug: {
      activeTables: activeTables.length,
      freeTables: freeTables.length,
      occupiedTableIds: Array.from(occupied),
      candidatesIndividual: individualTables.length,
      candidatesCombinations: combinations.length,
    },
  };
}