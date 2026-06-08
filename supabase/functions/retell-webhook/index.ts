import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Action =
  | "create_reservation"
  | "check_availability"
  | "update_reservation"
  | "cancel_reservation"
  | "get_restaurant_info";

interface Payload {
  action: Action;
  restaurant_id?: string;
  // create
  customer_name?: string;
  customer_phone?: string;
  reservation_date?: string; // YYYY-MM-DD
  reservation_time?: string; // HH:MM
  party_size?: number;
  customer_notes?: string;
  // update/cancel
  reservation_id?: string;
  // availability
  date?: string;
}

async function createReservation(p: Payload) {
  if (!p.restaurant_id || !p.customer_name || !p.reservation_date || !p.reservation_time || !p.party_size) {
    return json({ ok: false, error: "missing_fields" }, 400);
  }
  const { data, error } = await supabase
    .from("reservations")
    .insert({
      restaurant_id: p.restaurant_id,
      customer_name: p.customer_name,
      customer_phone: p.customer_phone ?? null,
      reservation_date: p.reservation_date,
      reservation_time: p.reservation_time,
      party_size: p.party_size,
      customer_notes: p.customer_notes ?? null,
      status: "confirmed",
      channel: "future_voice",
    })
    .select()
    .single();
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, reservation: data });
}

async function checkAvailability(p: Payload) {
  if (!p.restaurant_id || !p.date) return json({ ok: false, error: "missing_fields" }, 400);
  const day = new Date(p.date + "T00:00:00").getDay();

  const [{ data: schedule }, { data: blocked }, { data: reservations }] = await Promise.all([
    supabase.from("restaurant_schedule").select("*").eq("restaurant_id", p.restaurant_id).eq("day_of_week", day),
    supabase.from("blocked_dates").select("*").eq("restaurant_id", p.restaurant_id).eq("blocked_date", p.date),
    supabase
      .from("reservations")
      .select("reservation_time, party_size, status")
      .eq("restaurant_id", p.restaurant_id)
      .eq("reservation_date", p.date)
      .not("status", "in", "(cancelled,no_show)"),
  ]);

  return json({
    ok: true,
    date: p.date,
    is_blocked: (blocked?.length ?? 0) > 0,
    services: schedule ?? [],
    existing_reservations: reservations ?? [],
  });
}

async function updateReservation(p: Payload) {
  if (!p.reservation_id) return json({ ok: false, error: "missing_reservation_id" }, 400);
  const patch: Record<string, unknown> = { status: "modified" };
  if (p.reservation_date) patch.reservation_date = p.reservation_date;
  if (p.reservation_time) patch.reservation_time = p.reservation_time;
  if (p.party_size) patch.party_size = p.party_size;
  if (p.customer_notes !== undefined) patch.customer_notes = p.customer_notes;

  const { data, error } = await supabase
    .from("reservations")
    .update(patch)
    .eq("id", p.reservation_id)
    .select()
    .single();
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, reservation: data });
}

async function cancelReservation(p: Payload) {
  if (!p.reservation_id) return json({ ok: false, error: "missing_reservation_id" }, 400);
  const { data, error } = await supabase
    .from("reservations")
    .update({ status: "cancelled" })
    .eq("id", p.reservation_id)
    .select()
    .single();
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, reservation: data });
}

async function getRestaurantInfo(p: Payload) {
  if (!p.restaurant_id) return json({ ok: false, error: "missing_restaurant_id" }, 400);
  const [{ data: restaurant }, { data: schedule }, { data: faqs }] = await Promise.all([
    supabase.from("restaurants").select("*").eq("id", p.restaurant_id).maybeSingle(),
    supabase.from("restaurant_schedule").select("*").eq("restaurant_id", p.restaurant_id).order("day_of_week"),
    supabase.from("faqs").select("*").eq("restaurant_id", p.restaurant_id).eq("is_active", true),
  ]);
  return json({ ok: true, restaurant, schedule: schedule ?? [], faqs: faqs ?? [] });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  // Token auth
  const expected = Deno.env.get("RETELL_WEBHOOK_TOKEN");
  if (!expected) return json({ ok: false, error: "server_not_configured" }, 500);
  const provided =
    req.headers.get("x-webhook-token") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (provided !== expected) return json({ ok: false, error: "unauthorized" }, 401);

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  try {
    switch (payload.action) {
      case "create_reservation": return await createReservation(payload);
      case "check_availability": return await checkAvailability(payload);
      case "update_reservation": return await updateReservation(payload);
      case "cancel_reservation": return await cancelReservation(payload);
      case "get_restaurant_info": return await getRestaurantInfo(payload);
      default: return json({ ok: false, error: "unknown_action" }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});