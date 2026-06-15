import { supabase } from "@/integrations/supabase/client";

const QA_PREFIX = "QA";
const QA_ZONE_NAME = "QA Terraza inteligente";
const QA_TABLE_LABELS = ["QA1", "QA2", "QA3", "QA4", "QA5", "QA6"];
const QA_RESERVATION_NAMES = ["QA Ana Compacta", "QA Grupo Grande"];
const QA_NOTE = "Reserva QA para probar asignación inteligente.";

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type QASeedResult = {
  zoneId: string;
  tableIds: Record<string, string>;
  combinationIds: string[];
  reservationIds: string[];
  date: string;
};

/**
 * Seeds QA test data for the smart table-assignment recommender.
 * Idempotent: only touches rows prefixed with "QA". Never deletes real data.
 */
export async function seedQATableData(restaurantId: string): Promise<QASeedResult> {
  if (!restaurantId) throw new Error("restaurantId requerido");

  // 1. Zone
  const { data: existingZones, error: zoneErr } = await supabase
    .from("restaurant_zones")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("name", QA_ZONE_NAME);
  if (zoneErr) throw zoneErr;

  let zoneId: string;
  if (existingZones && existingZones.length > 0) {
    zoneId = existingZones[0].id;
    await supabase.from("restaurant_zones").update({ is_active: true }).eq("id", zoneId);
  } else {
    const { data: newZone, error } = await supabase
      .from("restaurant_zones")
      .insert({ restaurant_id: restaurantId, name: QA_ZONE_NAME, is_active: true, sort_order: 999 })
      .select()
      .single();
    if (error) throw error;
    zoneId = newZone.id;
  }

  // 2. Tables — reuse by label, otherwise insert. Update positions/capacities.
  const { data: existingTables, error: tErr } = await supabase
    .from("restaurant_tables")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .in("label", QA_TABLE_LABELS);
  if (tErr) throw tErr;

  const tableIds: Record<string, string> = {};
  for (let i = 0; i < QA_TABLE_LABELS.length; i++) {
    const label = QA_TABLE_LABELS[i];
    const row = (existingTables ?? []).find((t) => t.label === label);
    // Layout: two rows of 3 tables (QA1..QA3 top, QA4..QA6 bottom)
    const col = i % 3;
    const rowIdx = Math.floor(i / 3);
    const visual_x = 100 + col * 160;
    const visual_y = 100 + rowIdx * 160;
    const payload = {
      restaurant_id: restaurantId,
      zone_id: zoneId,
      label,
      min_capacity: 2,
      max_capacity: 4,
      is_active: true,
      sort_order: i,
      visual_x,
      visual_y,
      visual_width: 100,
      visual_height: 100,
      visual_shape: "round" as const,
      visual_rotation: 0,
    };
    if (row) {
      const { error } = await supabase.from("restaurant_tables").update(payload).eq("id", row.id);
      if (error) throw error;
      tableIds[label] = row.id;
    } else {
      const { data, error } = await supabase.from("restaurant_tables").insert(payload).select().single();
      if (error) throw error;
      tableIds[label] = data.id;
    }
  }

  // 3. Combinations: QA1+QA2, QA3+QA4, QA5+QA6
  const comboSpec: Array<{ name: string; tables: [string, string] }> = [
    { name: "QA Combo 1+2", tables: ["QA1", "QA2"] },
    { name: "QA Combo 3+4", tables: ["QA3", "QA4"] },
    { name: "QA Combo 5+6", tables: ["QA5", "QA6"] },
  ];

  const { data: existingCombos, error: cErr } = await supabase
    .from("table_combinations")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .like("name", "QA Combo%");
  if (cErr) throw cErr;

  const combinationIds: string[] = [];
  for (const spec of comboSpec) {
    let comboId: string;
    const existing = (existingCombos ?? []).find((c) => c.name === spec.name);
    const payload = {
      restaurant_id: restaurantId,
      zone_id: zoneId,
      name: spec.name,
      min_capacity: 5,
      max_capacity: 8,
      is_active: true,
    };
    if (existing) {
      const { error } = await supabase.from("table_combinations").update(payload).eq("id", existing.id);
      if (error) throw error;
      comboId = existing.id;
      // Reset links to ensure correct membership
      await supabase.from("table_combination_tables").delete().eq("combination_id", comboId);
    } else {
      const { data, error } = await supabase.from("table_combinations").insert(payload).select().single();
      if (error) throw error;
      comboId = data.id;
    }
    const links = spec.tables.map((label, idx) => ({
      combination_id: comboId,
      table_id: tableIds[label],
      sort_order: idx,
    }));
    const { error: linkErr } = await supabase.from("table_combination_tables").insert(links);
    if (linkErr) throw linkErr;
    combinationIds.push(comboId);
  }

  // 4. Reservations — upsert QA reservations in place and re-sync
  // reservation_tables. Existing QA rows (matched by name + restaurant)
  // are updated, never deleted, so we never lose their ids.
  const date = tomorrowISO();

  const resSpecs: Array<{
    name: string;
    time: string;
    party: number;
    primary: string;
    tables: string[];
  }> = [
    { name: "QA Ana Compacta", time: "21:00:00", party: 2, primary: "QA1", tables: ["QA1"] },
    { name: "QA Grupo Grande", time: "21:30:00", party: 8, primary: "QA5", tables: ["QA5", "QA6"] },
  ];

  const { data: existingRes, error: resErr } = await supabase
    .from("reservations")
    .select("id, customer_name")
    .eq("restaurant_id", restaurantId)
    .in("customer_name", resSpecs.map((s) => s.name));
  if (resErr) throw resErr;

  const reservationIds: string[] = [];
  for (const spec of resSpecs) {
    const primaryId = tableIds[spec.primary];
    if (!primaryId) throw new Error(`QA seed: missing table ${spec.primary}`);
    const payload = {
      restaurant_id: restaurantId,
      customer_name: spec.name,
      reservation_date: date,
      reservation_time: spec.time,
      party_size: spec.party,
      status: "confirmed" as const,
      channel: "manual" as const,
      table_id: primaryId,
      internal_notes: QA_NOTE,
    };
    const existing = (existingRes ?? []).find((r) => r.customer_name === spec.name);
    let resId: string;
    if (existing) {
      const { error } = await supabase
        .from("reservations")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw error;
      resId = existing.id;
    } else {
      const { data, error } = await supabase
        .from("reservations")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      resId = data.id;
    }
    reservationIds.push(resId);

    // Always re-sync reservation_tables to match the spec exactly.
    const { error: delErr } = await supabase
      .from("reservation_tables")
      .delete()
      .eq("reservation_id", resId);
    if (delErr) throw delErr;
    const rtRows = spec.tables.map((label) => {
      const tid = tableIds[label];
      if (!tid) throw new Error(`QA seed: missing table ${label}`);
      return { reservation_id: resId, table_id: tid };
    });
    const { error: insErr } = await supabase.from("reservation_tables").insert(rtRows);
    if (insErr) throw insErr;
  }

  return { zoneId, tableIds, combinationIds, reservationIds, date };
}

export { QA_PREFIX, QA_ZONE_NAME, QA_TABLE_LABELS, QA_RESERVATION_NAMES };