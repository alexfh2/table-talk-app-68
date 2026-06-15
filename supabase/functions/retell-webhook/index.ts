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
  | "find_reservation"
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
  // lookup by phone
  phone?: string;
  // voice-only extras
  preferred_zone?: string;
  zone?: string;
  special_requests?: string;
  time_preference?: string;
}

function dayOfWeekFromISO(d: string): number {
  // Avoid TZ surprises: compute UTC day-of-week from YYYY-MM-DD.
  // Convention: 0 = Sunday … 6 = Saturday (matches restaurant_schedule.day_of_week).
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1)).getUTCDay();
}

function timeToMinutes(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Returns true if `time` (HH:MM) falls within [open, close].
 * Supports services that end at 00:00 or cross midnight (e.g. 20:00–01:30).
 */
function isTimeWithinService(time: string, open: string, close: string): boolean {
  if (!open || !close) return false;
  const t = timeToMinutes(time);
  const o = timeToMinutes(open);
  let c = timeToMinutes(close);
  // 00:00 closing means end-of-day (24:00)
  if (c === 0) c = 24 * 60;
  if (c >= o) {
    return t >= o && t <= c;
  }
  // crosses midnight: [o..24h] U [0..c]
  return t >= o || t <= c;
}

/**
 * Compute the effective services for a given date, applying priority:
 *   Exception > Season > Base schedule.
 * Mirrors src/lib/effectiveSchedule.ts so the agent sees the same hours
 * as the dashboard.
 */
async function getEffectiveServices(restaurantId: string, date: string) {
  const dow = dayOfWeekFromISO(date);
  const [schedRes, seasonsRes, excRes] = await Promise.all([
    supabase.from("restaurant_schedule").select("*").eq("restaurant_id", restaurantId).eq("day_of_week", dow),
    supabase.from("schedule_seasons").select("*").eq("restaurant_id", restaurantId)
      .lte("start_date", date).gte("end_date", date),
    supabase.from("blocked_dates").select("*").eq("restaurant_id", restaurantId).eq("date", date),
  ]);
  const schedule = schedRes.data ?? [];
  const seasons = (seasonsRes.data ?? []).slice().sort((a: any, b: any) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.start_date < b.start_date ? 1 : -1;
  });
  const season = seasons[0] ?? null;
  const seasonId = season?.id ?? null;
  const exceptions = excRes.data ?? [];

  const openRows = (sid: string | null) =>
    schedule
      .filter((r: any) =>
        (r.season_id ?? null) === sid &&
        r.is_open && r.opening_time && r.closing_time,
      )
      .map((r: any) => ({ ...r }));

  let services = openRows(seasonId);
  let source: "exception" | "season" | "base" = season ? "season" : "base";

  // Fallback: season is active but has no services for this weekday → use base schedule.
  if (season && services.length === 0) {
    services = openRows(null);
    source = "base";
  }

  for (const ex of exceptions as any[]) {
    source = "exception";
    const affected: Array<"lunch" | "dinner"> =
      ex.service_period === "lunch" ? ["lunch"]
      : ex.service_period === "dinner" ? ["dinner"]
      : ["lunch", "dinner"];

    if (ex.kind === "closed" || ex.kind === "private_event") {
      services = services.filter((s: any) => !affected.includes(s.service_period));
    } else if (ex.kind === "special_hours" || ex.kind === "extra_service") {
      for (const p of affected) {
        if (!ex.start_time || !ex.end_time) continue;
        services = services.filter((s: any) => s.service_period !== p);
        services.push({
          id: `exception-${ex.id}-${p}`,
          restaurant_id: ex.restaurant_id,
          day_of_week: dow,
          is_open: true,
          opening_time: ex.start_time,
          closing_time: ex.end_time,
          service_name: ex.reason ?? (p === "lunch" ? "Mediodía" : "Noche"),
          max_guests_per_slot: ex.max_guests_per_slot,
          max_reservations_per_slot: ex.max_reservations_per_slot,
          slot_duration_minutes: ex.slot_duration_minutes ?? 30,
          booking_mode: ex.booking_mode ?? "slots",
          shift_times: ex.shift_times,
          service_period: p,
          season_id: null,
        });
      }
    }
  }

  services.sort((a: any, b: any) => (a.opening_time < b.opening_time ? -1 : 1));
  return { services, source, seasonId, season };
}

async function validateSlot(restaurantId: string, date: string, time: string) {
  const { services, source } = await getEffectiveServices(restaurantId, date);
  if (services.length === 0) {
    return {
      ok: false,
      error: source === "exception" ? "date_blocked" : "closed_day",
      message: source === "exception"
        ? "El restaurante no acepta reservas ese día (fecha bloqueada o evento privado)."
        : "El restaurante está cerrado ese día.",
    };
  }
  const t = time.slice(0, 5);
  const inService = services.some((s: any) =>
    isTimeWithinService(t, (s.opening_time ?? "").slice(0, 5), (s.closing_time ?? "").slice(0, 5)),
  );
  if (!inService) {
    return {
      ok: false,
      error: "out_of_service_hours",
      message: "La hora solicitada está fuera del horario de servicio.",
      services: services.map((s: any) => ({
        service_name: s.service_name,
        opening_time: s.opening_time,
        closing_time: s.closing_time,
      })),
    };
  }
  return { ok: true as const };
}

type AutoAssign =
  | { tableId: string; needsReview: false; tableLabel: string; reason: "assigned"; freeSeats: number }
  | { tableId: null; needsReview: true; reason: "needs_human_review"; freeSeats: number }
  | { tableId: null; needsReview: false; reason: "no_capacity"; freeSeats: number };

const DEFAULT_SLOT_MIN = 120;

function minutesBetween(a: string, b: string) {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return Math.abs(ah * 60 + am - (bh * 60 + bm));
}

async function autoAssignTable(opts: {
  restaurantId: string;
  date: string;
  time: string;
  partySize: number;
  slotMinutes?: number;
  preferredZone?: string;
}): Promise<AutoAssign> {
  const time = opts.time.slice(0, 5);
  const window = opts.slotMinutes ?? DEFAULT_SLOT_MIN;

  const [{ data: tables }, { data: reservations }] = await Promise.all([
    supabase
      .from("restaurant_tables")
      .select("id, label, min_capacity, max_capacity, sort_order, zone_id, restaurant_zones(name)")
      .eq("restaurant_id", opts.restaurantId)
      .eq("is_active", true),
    supabase
      .from("reservations")
      .select("id, table_id, reservation_time, status")
      .eq("restaurant_id", opts.restaurantId)
      .eq("reservation_date", opts.date)
      .not("status", "in", "(cancelled,no_show)"),
  ]);

  const activeTables = (tables ?? []) as Array<{
    id: string; label: string; min_capacity: number; max_capacity: number; sort_order: number | null;
    zone_id: string; restaurant_zones: { name: string } | null;
  }>;

  const occupied = new Set<string>();
  for (const r of reservations ?? []) {
    if (!r.table_id) continue;
    if (minutesBetween(time, String(r.reservation_time)) < window) occupied.add(r.table_id);
  }

  const free = activeTables.filter((t) => !occupied.has(t.id));
  const freeSeats = free.reduce((s, t) => s + (t.max_capacity ?? 0), 0);

  const preferred = opts.preferredZone?.trim().toLowerCase() ?? "";
  const inZone = (t: typeof activeTables[number]) =>
    preferred ? (t.restaurant_zones?.name ?? "").trim().toLowerCase() === preferred : false;

  const candidates = free
    .filter((t) => t.max_capacity >= opts.partySize)
    .sort((a, b) => {
      // 1) Preferred zone first
      if (preferred) {
        const az = inZone(a) ? 0 : 1;
        const bz = inZone(b) ? 0 : 1;
        if (az !== bz) return az - bz;
      }
      // 2) Smallest table that fits
      if (a.max_capacity !== b.max_capacity) return a.max_capacity - b.max_capacity;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

  if (candidates.length > 0) {
    const t = candidates[0];
    return { tableId: t.id, needsReview: false, tableLabel: t.label, reason: "assigned", freeSeats };
  }
  if (freeSeats >= opts.partySize) {
    return { tableId: null, needsReview: true, reason: "needs_human_review", freeSeats };
  }
  return { tableId: null, needsReview: false, reason: "no_capacity", freeSeats };
}

async function createReservation(p: Payload) {
  if (!p.restaurant_id || !p.customer_name || !p.reservation_date || !p.reservation_time || !p.party_size) {
    return json({ ok: false, error: "missing_fields" }, 400);
  }
  const v = await validateSlot(p.restaurant_id, p.reservation_date, p.reservation_time);
  if (!v.ok) return json(v, 409);

  // Auto-assign the smallest table that fits the party.
  const assignment = await autoAssignTable({
    restaurantId: p.restaurant_id,
    date: p.reservation_date,
    time: p.reservation_time,
    partySize: p.party_size,
    preferredZone: p.preferred_zone ?? p.zone,
  });

  if (assignment.reason === "no_capacity") {
    return json({
      ok: false,
      error: "no_capacity",
      message: "No hay capacidad disponible para esa hora.",
      free_seats: assignment.freeSeats,
    }, 409);
  }

  const status = assignment.needsReview ? "requires_human" : "confirmed";
  const internalNotes = assignment.needsReview
    ? "⚠ Sin mesa única que encaje. Requiere reasignación manual."
    : null;

  // Merge optional zone + special_requests into customer_notes
  // (the table has no dedicated columns for them).
  const extraParts: string[] = [];
  if (p.customer_notes) extraParts.push(p.customer_notes);
  if (p.zone || p.preferred_zone) extraParts.push(`Zona preferida: ${p.zone ?? p.preferred_zone}`);
  if (p.special_requests) extraParts.push(`Peticiones: ${p.special_requests}`);
  const mergedNotes = extraParts.length ? extraParts.join(" | ") : null;

  const { data, error } = await supabase
    .from("reservations")
    .insert({
      restaurant_id: p.restaurant_id,
      customer_name: p.customer_name,
      customer_phone: p.customer_phone ?? null,
      reservation_date: p.reservation_date,
      reservation_time: p.reservation_time,
      party_size: p.party_size,
      customer_notes: mergedNotes,
      internal_notes: internalNotes,
      table_id: assignment.tableId,
      status,
      channel: "future_voice",
    })
    .select()
    .single();
  if (error) return json({ ok: false, error: error.message }, 400);

  // Create a handoff request when the reservation needs human review.
  if (assignment.needsReview && data) {
    await supabase.from("human_handoff_requests").insert({
      restaurant_id: p.restaurant_id,
      reservation_id: data.id,
      customer_name: p.customer_name,
      customer_phone: p.customer_phone ?? null,
      source_channel: "future_voice",
      reason: "table_auto_assignment_failed",
      customer_message: `Reserva para ${p.party_size} personas el ${p.reservation_date} a las ${p.reservation_time}. No hay una mesa única que encaje; reasignar manualmente.`,
      status: "pending",
    });
  }

  return json({
    ok: true,
    reservation: data,
    assignment: {
      table_id: assignment.tableId,
      needs_review: assignment.needsReview,
      ...(("tableLabel" in assignment) ? { table_label: assignment.tableLabel } : {}),
    },
  });
}

async function checkAvailability(p: Payload) {
  if (!p.restaurant_id || !p.date) return json({ ok: false, error: "missing_fields" }, 400);

  const { services: openServices, source, season } = await getEffectiveServices(p.restaurant_id, p.date);

  const { data: reservations } = await supabase
    .from("reservations")
    .select("reservation_time, party_size, status")
    .eq("restaurant_id", p.restaurant_id)
    .eq("reservation_date", p.date)
    .not("status", "in", "(cancelled,no_show)");

  if (openServices.length === 0) {
    const reason = source === "exception" ? "date_blocked" : "closed_day";
    const message = source === "exception"
      ? "El restaurante no acepta reservas ese día (fecha bloqueada o evento privado)."
      : "El restaurante está cerrado ese día.";
    return json({
      ok: true,
      date: p.date,
      is_open: false,
      available: false,
      reason,
      message,
      source,
    });
  }

  // If a time is provided, validate it's within service hours (midnight-safe).
  if (p.reservation_time) {
    const t = p.reservation_time.slice(0, 5);
    const inService = openServices.some((s: any) =>
      isTimeWithinService(t, (s.opening_time ?? "").slice(0, 5), (s.closing_time ?? "").slice(0, 5)),
    );
    if (!inService) {
      return json({
        ok: true,
        date: p.date,
        time: p.reservation_time,
        is_open: true,
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

    // If party_size is also provided, validate capacity via autoAssignTable.
    if (p.party_size) {
      const assignment = await autoAssignTable({
        restaurantId: p.restaurant_id,
        date: p.date,
        time: p.reservation_time,
        partySize: p.party_size,
        preferredZone: p.preferred_zone ?? p.zone,
      });

      if (assignment.reason === "no_capacity") {
        return json({
          ok: true,
          date: p.date,
          time: p.reservation_time,
          is_open: true,
          available: false,
          reason: "no_capacity",
          message: "No hay capacidad disponible para esa hora.",
          assignment_preview: {
            table_id: null,
            needs_review: false,
            free_seats: assignment.freeSeats,
          },
          source,
        });
      }

      if (assignment.needsReview) {
        return json({
          ok: true,
          date: p.date,
          time: p.reservation_time,
          is_open: true,
          available: true,
          reason: "needs_human_review",
          message: "Hay plazas suficientes pero ninguna mesa única encaja. La reserva requerirá revisión humana.",
          assignment_preview: {
            table_id: null,
            needs_review: true,
            free_seats: assignment.freeSeats,
          },
          source,
        });
      }

      return json({
        ok: true,
        date: p.date,
        time: p.reservation_time,
        is_open: true,
        available: true,
        reason: "available",
        message: "Hay disponibilidad.",
        assignment_preview: {
          table_id: assignment.tableId,
          table_label: assignment.tableLabel,
          needs_review: false,
          free_seats: assignment.freeSeats,
        },
        source,
        season: season ? { id: season.id, name: season.name } : null,
      });
    }
  }

  return json({
    ok: true,
    date: p.date,
    is_open: true,
    available: true,
    reason: "available",
    message: "El restaurante está abierto.",
    services: openServices,
    source,
    season: season ? { id: season.id, name: season.name } : null,
    existing_reservations: reservations ?? [],
  });
}

async function findReservation(p: Payload) {
  if (!p.restaurant_id) return json({ ok: false, error: "missing_restaurant_id" }, 400);
  if (!p.customer_name && !p.customer_phone) {
    return json({ ok: false, error: "missing_search_criteria", message: "Indica customer_name o customer_phone." }, 400);
  }

  let q = supabase
    .from("reservations")
    .select("*")
    .eq("restaurant_id", p.restaurant_id)
    .not("status", "in", "(cancelled,no_show)")
    .order("reservation_date", { ascending: true })
    .order("reservation_time", { ascending: true });

  if (p.reservation_date) q = q.eq("reservation_date", p.reservation_date);
  if (p.customer_phone) {
    const normalized = p.customer_phone.replace(/[^\d+]/g, "");
    q = q.ilike("customer_phone", `%${normalized}%`);
  }
  if (p.customer_name) q = q.ilike("customer_name", `%${p.customer_name}%`);

  const { data, error } = await q;
  if (error) return json({ ok: false, error: error.message }, 400);

  return json({
    ok: true,
    count: data?.length ?? 0,
    reservations: data ?? [],
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

async function getRestaurantInfoByPhone(p: Payload) {
  if (!p.phone) return json({ ok: false, error: "missing_phone" }, 400);

  // Normalize phone: keep only digits and optional leading +
  const normalized = p.phone.replace(/[^\d+]/g, "");
  const searchPattern = `%${normalized}%`;

  // Search by exact or partial match on main_phone
  const { data: restaurants, error: rErr } = await supabase
    .from("restaurants")
    .select("id")
    .ilike("main_phone", searchPattern);

  if (rErr) return json({ ok: false, error: rErr.message }, 400);

  if (!restaurants || restaurants.length === 0) {
    return json({ ok: false, error: "restaurant_not_found", message: "No se encontró ningún restaurante con ese teléfono." }, 404);
  }

  if (restaurants.length > 1) {
    return json({
      ok: false,
      error: "multiple_restaurants_found",
      message: "Se encontraron varios restaurantes con ese teléfono. Especifique el número completo o use restaurant_id.",
      matches: restaurants.map((r: any) => r.id),
    }, 409);
  }

  const rid = (restaurants[0] as any).id;

  // Reuse existing getRestaurantInfo logic inline
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
      case "find_reservation": return await findReservation(payload);
      case "get_restaurant_info": return await getRestaurantInfo(payload);
      case "get_restaurant_info_by_phone": return await getRestaurantInfoByPhone(payload);
      default: return json({ ok: false, error: "unknown_action" }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});