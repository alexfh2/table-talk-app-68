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
  | "get_restaurant_info"
  | "get_restaurant_info_by_phone";

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

function dayOfWeekFromISO(d: string): number {
  // Avoid TZ surprises: compute UTC day-of-week from YYYY-MM-DD
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1)).getUTCDay();
}

async function validateSlot(restaurantId: string, date: string, time: string) {
  const dow = dayOfWeekFromISO(date);
  const [{ data: schedule }, { data: blocked }] = await Promise.all([
    supabase.from("restaurant_schedule").select("*").eq("restaurant_id", restaurantId).eq("day_of_week", dow),
    supabase.from("blocked_dates").select("*").eq("restaurant_id", restaurantId).eq("blocked_date", date),
  ]);
  if ((blocked?.length ?? 0) > 0) {
    return { ok: false, error: "date_blocked", message: "El restaurante no acepta reservas ese día (fecha bloqueada)." };
  }
  const openServices = (schedule ?? []).filter((s: any) => s.is_open);
  if (openServices.length === 0) {
    return { ok: false, error: "closed_day", message: "El restaurante está cerrado ese día de la semana." };
  }
  const t = time.slice(0, 5);
  const inService = openServices.some((s: any) => {
    const open = (s.opening_time ?? "").slice(0, 5);
    const close = (s.closing_time ?? "").slice(0, 5);
    return open && close && t >= open && t <= close;
  });
  if (!inService) {
    return {
      ok: false,
      error: "out_of_service_hours",
      message: "La hora solicitada está fuera del horario de servicio.",
      services: openServices.map((s: any) => ({
        service_name: s.service_name,
        opening_time: s.opening_time,
        closing_time: s.closing_time,
      })),
    };
  }
  return { ok: true as const };
}

async function createReservation(p: Payload) {
  if (!p.restaurant_id || !p.customer_name || !p.reservation_date || !p.reservation_time || !p.party_size) {
    return json({ ok: false, error: "missing_fields" }, 400);
  }
  const v = await validateSlot(p.restaurant_id, p.reservation_date, p.reservation_time);
  if (!v.ok) return json(v, 409);
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
  const day = dayOfWeekFromISO(p.date);

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

  const isBlocked = (blocked?.length ?? 0) > 0;
  if (isBlocked) {
    return json({ ok: true, date: p.date, available: false, reason: "date_blocked", message: "El restaurante no acepta reservas ese día (fecha bloqueada)." });
  }

  const openServices = (schedule ?? []).filter((s: any) => s.is_open);
  if (openServices.length === 0) {
    return json({ ok: true, date: p.date, available: false, reason: "closed_day", message: "El restaurante está cerrado ese día de la semana." });
  }

  // If time is provided, validate it falls within open service hours
  if (p.reservation_time) {
    const t = p.reservation_time.slice(0, 5);
    const inService = openServices.some((s: any) => {
      const open = (s.opening_time ?? "").slice(0, 5);
      const close = (s.closing_time ?? "").slice(0, 5);
      return open && close && t >= open && t <= close;
    });
    if (!inService) {
      return json({
        ok: true,
        date: p.date,
        time: p.reservation_time,
        available: false,
        reason: "out_of_service_hours",
        message: "La hora solicitada está fuera del horario de servicio.",
        services: openServices.map((s: any) => ({
          service_name: s.service_name,
          opening_time: s.opening_time,
          closing_time: s.closing_time,
        })),
      });
    }
  }

  return json({
    ok: true,
    date: p.date,
    available: true,
    services: openServices,
    existing_reservations: reservations ?? [],
  });
}

async function updateReservation(p: Payload) {
  if (!p.reservation_id) return json({ ok: false, error: "missing_reservation_id" }, 400);
  if (p.reservation_date || p.reservation_time) {
    // Need both effective date & time to validate; fetch current if one is missing
    let date = p.reservation_date;
    let time = p.reservation_time;
    let restaurantId = p.restaurant_id;
    if (!date || !time || !restaurantId) {
      const { data: cur } = await supabase
        .from("reservations")
        .select("restaurant_id, reservation_date, reservation_time")
        .eq("id", p.reservation_id)
        .maybeSingle();
      date = date ?? cur?.reservation_date;
      time = time ?? cur?.reservation_time;
      restaurantId = restaurantId ?? cur?.restaurant_id;
    }
    if (date && time && restaurantId) {
      const v = await validateSlot(restaurantId, date, time);
      if (!v.ok) return json(v, 409);
    }
  }
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
  const rid = p.restaurant_id;
  const [
    { data: restaurant },
    { data: schedule },
    { data: faqs },
    { data: zones },
    { data: tables },
    { data: blocked_dates },
    { data: agent_settings },
    { data: notification_settings },
    { data: external_calendar },
  ] = await Promise.all([
    supabase.from("restaurants").select("*").eq("id", rid).maybeSingle(),
    supabase.from("restaurant_schedule").select("*").eq("restaurant_id", rid).order("day_of_week"),
    supabase.from("faqs").select("*").eq("restaurant_id", rid).eq("is_active", true),
    supabase.from("restaurant_zones").select("*").eq("restaurant_id", rid),
    supabase.from("restaurant_tables").select("*").eq("restaurant_id", rid),
    supabase.from("blocked_dates").select("*").eq("restaurant_id", rid).gte("date", new Date().toISOString().slice(0, 10)).order("date"),
    supabase.from("agent_settings").select("*").eq("restaurant_id", rid).maybeSingle(),
    supabase.from("notification_settings").select("*").eq("restaurant_id", rid).maybeSingle(),
    supabase.from("external_calendar_settings").select("*").eq("restaurant_id", rid).maybeSingle(),
  ]);

  const total_capacity = (tables ?? []).reduce((sum, t: any) => sum + (t.capacity ?? 0), 0);
  const tables_count = (tables ?? []).length;

  return json({
    ok: true,
    restaurant,
    schedule: schedule ?? [],
    faqs: faqs ?? [],
    zones: zones ?? [],
    tables: tables ?? [],
    capacity: { total_capacity, tables_count },
    blocked_dates: blocked_dates ?? [],
    agent_settings,
    notification_settings,
    external_calendar,
  });
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