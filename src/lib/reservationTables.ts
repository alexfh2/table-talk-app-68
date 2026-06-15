import { supabase } from "@/integrations/supabase/client";
import type { RestaurantTable, Zone } from "@/lib/types";

/**
 * Helpers around the new `reservation_tables` join table.
 *
 * `reservations.table_id` is kept for backwards compatibility, but
 * `reservation_tables` is the source of truth going forward and is the
 * only place that can represent a reservation occupying multiple joined
 * tables.
 */

/** Returns the table ids assigned to a reservation through `reservation_tables`. */
export async function getReservationTableIds(reservationId: string): Promise<string[]> {
  if (!reservationId) return [];
  const { data, error } = await supabase
    .from("reservation_tables")
    .select("table_id")
    .eq("reservation_id", reservationId);
  if (error) {
    console.warn("[getReservationTableIds] failed", error);
    return [];
  }
  return (data ?? []).map((r: { table_id: string }) => r.table_id);
}

/**
 * Returns a `Map<reservationId, tableId[]>` for the supplied reservations.
 * Reservations with no rows are simply absent from the map; callers should
 * fall back to `reservations.table_id` for compatibility.
 */
export async function getReservationsTableMap(
  reservationIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const ids = Array.from(new Set(reservationIds.filter(Boolean)));
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("reservation_tables")
    .select("reservation_id, table_id")
    .in("reservation_id", ids);
  if (error) {
    console.warn("[getReservationsTableMap] failed", error);
    return map;
  }
  for (const row of (data ?? []) as { reservation_id: string; table_id: string }[]) {
    const arr = map.get(row.reservation_id) ?? [];
    arr.push(row.table_id);
    map.set(row.reservation_id, arr);
  }
  return map;
}

/**
 * Replaces the table assignment of a reservation in `reservation_tables`
 * with `tableIds` (deduplicated). Pass `[]` to clear the assignment.
 */
export async function syncReservationTables(
  reservationId: string,
  tableIds: string[],
): Promise<void> {
  if (!reservationId) return;
  const desired = Array.from(new Set(tableIds.filter(Boolean)));

  const { data: existing, error: readErr } = await supabase
    .from("reservation_tables")
    .select("id, table_id")
    .eq("reservation_id", reservationId);
  if (readErr) {
    console.warn("[syncReservationTables] read failed", readErr);
    return;
  }

  const current = new Set((existing ?? []).map((r: { table_id: string }) => r.table_id));
  const toDelete = (existing ?? [])
    .filter((r: { table_id: string }) => !desired.includes(r.table_id))
    .map((r: { id: string }) => r.id);
  const toInsert = desired.filter((id) => !current.has(id));

  if (toDelete.length > 0) {
    const { error } = await supabase.from("reservation_tables").delete().in("id", toDelete);
    if (error) console.warn("[syncReservationTables] delete failed", error);
  }
  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("reservation_tables")
      .insert(toInsert.map((table_id) => ({ reservation_id: reservationId, table_id })));
    if (error) console.warn("[syncReservationTables] insert failed", error);
  }
}

/**
 * Returns the effective table ids for a reservation: prefers
 * `reservation_tables` if it has any rows, otherwise falls back to the
 * single `reservations.table_id`.
 */
export function effectiveTableIds(
  reservationId: string,
  fallbackTableId: string | null,
  tableMap: Map<string, string[]>,
): string[] {
  const rows = tableMap.get(reservationId);
  if (rows && rows.length > 0) return rows;
  return fallbackTableId ? [fallbackTableId] : [];
}

/**
 * Formats the assignment for display.
 *
 * - 0 tables  → null
 * - 1 table   → "I2 · Interior"  (or just "I2" if no zone)
 * - N tables  → "T1 + T2 · Terraza" if all share the same zone, else "T1 + T2"
 */
export function formatTableAssignment(
  tableIds: string[],
  tables: Pick<RestaurantTable, "id" | "label" | "zone_id" | "sort_order">[],
  zones: Pick<Zone, "id" | "name">[],
): { label: string; zone?: string } | null {
  if (!tableIds || tableIds.length === 0) return null;
  const resolved = tableIds
    .map((id) => tables.find((t) => t.id === id))
    .filter((t): t is (typeof tables)[number] => !!t)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (resolved.length === 0) return null;

  const label = resolved.map((t) => t.label).join(" + ");
  const zoneIds = new Set(resolved.map((t) => t.zone_id));
  if (zoneIds.size === 1) {
    const zone = zones.find((z) => z.id === resolved[0].zone_id);
    return zone ? { label, zone: zone.name } : { label };
  }
  return { label };
}