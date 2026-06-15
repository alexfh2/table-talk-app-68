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

  // 4. Reservations — clean prior QA reservations for this restaurant, then re-create.
  const date = tomorrowISO();
  const { data: existingRes } = await supabase
    .from("reservations")
    .select("id, customer_name")
    .eq("restaurant_id", restaurantId)
    .like("customer_name", "QA %");
  if (existingRes && existingRes.length > 0) {
    await supabase.from("reservations").delete().in("id", existingRes.map((r) => r.id));
  }

  const reservationIds: string[] = [];

  // QA Ana Compacta — 2 personas, 21:00, mesa QA1
  {
    const { data, error } = await supabase
      .from("reservations")
      .insert({
        restaurant_id: restaurantId,
        customer_name: "QA Ana Compacta",
        reservation_date: date,
        reservation_time: "21:00:00",
        party_size: 2,
        status: "confirmed",
        channel: "manual",
        table_id: tableIds["QA1"],
        internal_notes: QA_NOTE,
      })
      .select()
      .single();
    if (error) throw error;
    reservationIds.push(data.id);
    const { error: rtErr } = await supabase
      .from("reservation_tables")
      .insert({ reservation_id: data.id, table_id: tableIds["QA1"] });
    if (rtErr) throw rtErr;
  }

  // QA Grupo Grande — 8 personas, 21:30, mesas QA5 + QA6
  {
    const { data, error } = await supabase
      .from("reservations")
      .insert({
        restaurant_id: restaurantId,
        customer_name: "QA Grupo Grande",
        reservation_date: date,
        reservation_time: "21:30:00",
        party_size: 8,
        status: "confirmed",
        channel: "manual",
        table_id: tableIds["QA5"],
        internal_notes: QA_NOTE,
      })
      .select()
      .single();
    if (error) throw error;
    reservationIds.push(data.id);
    const { error: rtErr } = await supabase.from("reservation_tables").insert([
      { reservation_id: data.id, table_id: tableIds["QA5"] },
      { reservation_id: data.id, table_id: tableIds["QA6"] },
    ]);
    if (rtErr) throw rtErr;
  }

  return { zoneId, tableIds, combinationIds, reservationIds, date };
}

export { QA_PREFIX, QA_ZONE_NAME, QA_TABLE_LABELS, QA_RESERVATION_NAMES };