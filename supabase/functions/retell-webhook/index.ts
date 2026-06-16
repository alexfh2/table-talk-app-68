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
  // update: exclude the reservation being modified from occupancy checks
  exclude_reservation_id?: string;
  // camelCase aliases (compat with new create-voice-reservation contract)
  restaurantId?: string;
  customerName?: string;
  customerPhone?: string;
  reservationDate?: string;
  reservationTime?: string;
  partySize?: number;
  notes?: string;
  preferredZoneName?: string;
  preferredZoneId?: string;
  zoneName?: string;
  transcript?: string;
  callId?: string;
  conversation_id?: string;
  call_id?: string;
  excludeReservationId?: string;
}

/**
 * Normalize incoming payload: accept both snake_case (legacy Retell flow) and
 * camelCase (new create-voice-reservation contract) field names, copying the
 * value into the legacy snake_case slot so the rest of this router keeps
 * working unchanged.
 */
function normalizeAliases(p: Payload): Payload {
  const out: Payload = { ...p };
  out.restaurant_id = out.restaurant_id ?? out.restaurantId;
  out.customer_name = out.customer_name ?? out.customerName;
  out.customer_phone = out.customer_phone ?? out.customerPhone ?? out.phone;
  out.reservation_date = out.reservation_date ?? out.reservationDate ?? out.date;
  out.reservation_time = out.reservation_time ?? out.reservationTime;
  out.party_size = out.party_size ?? out.partySize;
  out.customer_notes = out.customer_notes ?? out.notes ?? out.special_requests;
  out.preferred_zone = out.preferred_zone ?? out.zone ?? out.preferredZoneName ?? out.zoneName;
  out.exclude_reservation_id = out.exclude_reservation_id ?? out.excludeReservationId;
  return out;
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
  | { tableId: string; needsReview: false; tableLabel: string; reason: "assigned"; freeSeats: number; debug?: AvailabilityDebug }
  | { tableId: null; needsReview: true; reason: "needs_human_review"; freeSeats: number; debug?: AvailabilityDebug }
  | { tableId: null; needsReview: false; reason: "no_capacity"; freeSeats: number; debug?: AvailabilityDebug }
  | { tableId: null; needsReview: false; reason: "no_tables_configured"; freeSeats: 0; debug?: AvailabilityDebug }
  | { tableId: null; needsReview: false; reason: "zone_unavailable"; freeSeats: number; debug?: AvailabilityDebug };

type AvailabilityDebug = {
  preferred_zone_received: string | null;
  normalized_zone: string | null;
  matched_zone_ids: string[];
  total_tables: number;
  active_tables: number;
  tables_after_zone_filter: number;
  occupied_table_ids: string[];
  free_tables: number;
  candidates_count: number;
  free_seats: number;
  available_zones: Array<{ id: string; name: string }>;
};

function normalizeZoneText(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

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
  excludeReservationId?: string;
}): Promise<AutoAssign> {
  const time = opts.time.slice(0, 5);
  const window = opts.slotMinutes ?? DEFAULT_SLOT_MIN;

  const preferredRaw = (opts.preferredZone ?? "").trim();
  const preferredNorm = normalizeZoneText(preferredRaw);
  const noPreferenceTokens = new Set(["", "sin preferencia", "ninguna", "indiferente", "cualquiera", "sin preferencias"]);
  const hasPreference = !noPreferenceTokens.has(preferredNorm);

  const [zonesRes, tablesRes, reservationsRes] = await Promise.all([
    supabase
      .from("restaurant_zones")
      .select("id, name, is_active, restaurant_id")
      .eq("restaurant_id", opts.restaurantId)
      .eq("is_active", true),
    supabase
      .from("restaurant_tables")
      .select("id, restaurant_id, zone_id, label, min_capacity, max_capacity, sort_order, is_active")
      .eq("restaurant_id", opts.restaurantId)
      .eq("is_active", true),
    supabase
      .from("reservations")
      .select("id, table_id, reservation_time, status")
      .eq("restaurant_id", opts.restaurantId)
      .eq("reservation_date", opts.date)
      .not("status", "in", "(cancelled,no_show)"),
  ]);

  const activeZones = (zonesRes.data ?? []) as Array<{ id: string; name: string; is_active: boolean }>;
  const activeZoneIds = new Set(activeZones.map((z) => z.id));
  const rawTables = (tablesRes.data ?? []) as Array<{
    id: string; label: string; min_capacity: number; max_capacity: number | null;
    sort_order: number | null; zone_id: string | null; is_active: boolean;
  }>;
  const totalTables = rawTables.length;
  // Only consider tables whose zone is active (or that have no zone -> include).
  const activeTables = rawTables
    .filter((t) => !t.zone_id || activeZoneIds.has(t.zone_id))
    .map((t) => ({ ...t, max_capacity: t.max_capacity ?? 0 }));

  const availableZones = activeZones.map((z) => ({ id: z.id, name: z.name }));

  if (activeTables.length === 0) {
    return {
      tableId: null,
      needsReview: false,
      reason: "no_tables_configured",
      freeSeats: 0,
      debug: {
        preferred_zone_received: preferredRaw || null,
        normalized_zone: hasPreference ? preferredNorm : null,
        matched_zone_ids: [],
        total_tables: totalTables,
        active_tables: 0,
        tables_after_zone_filter: 0,
        occupied_table_ids: [],
        free_tables: 0,
        candidates_count: 0,
        free_seats: 0,
        available_zones: availableZones,
      },
    };
  }

  // Zone matching: name normalized equals OR contains preference OR preference contains name.
  let matchedZoneIds: string[] = [];
  if (hasPreference) {
    matchedZoneIds = activeZones
      .filter((z) => {
        const n = normalizeZoneText(z.name);
        return n === preferredNorm || n.includes(preferredNorm) || preferredNorm.includes(n);
      })
      .map((z) => z.id);
  }

  const zoneFilterApplied = hasPreference && matchedZoneIds.length > 0;
  const tablesAfterZone = zoneFilterApplied
    ? activeTables.filter((t) => t.zone_id && matchedZoneIds.includes(t.zone_id))
    : activeTables;

  const occupied = new Set<string>();
  for (const r of reservationsRes.data ?? []) {
    if (!r.table_id) continue;
    if (opts.excludeReservationId && r.id === opts.excludeReservationId) continue;
    if (minutesBetween(time, String(r.reservation_time)) < window) occupied.add(r.table_id);
  }

  const free = tablesAfterZone.filter((t) => !occupied.has(t.id));
  const freeSeats = free.reduce((s, t) => s + (t.max_capacity ?? 0), 0);

  const candidates = free
    .filter((t) => (t.max_capacity ?? 0) >= opts.partySize)
    .sort((a, b) => {
      if (a.max_capacity !== b.max_capacity) return (a.max_capacity ?? 0) - (b.max_capacity ?? 0);
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

  const debug: AvailabilityDebug = {
    preferred_zone_received: preferredRaw || null,
    normalized_zone: hasPreference ? preferredNorm : null,
    matched_zone_ids: matchedZoneIds,
    total_tables: totalTables,
    active_tables: activeTables.length,
    tables_after_zone_filter: tablesAfterZone.length,
    occupied_table_ids: Array.from(occupied),
    free_tables: free.length,
    candidates_count: candidates.length,
    free_seats: freeSeats,
    available_zones: availableZones,
  };

  if (candidates.length > 0) {
    const t = candidates[0];
    return { tableId: t.id, needsReview: false, tableLabel: t.label, reason: "assigned", freeSeats, debug };
  }

  // If preference was given but no matching zone exists, surface zone_unavailable.
  if (hasPreference && matchedZoneIds.length === 0) {
    return { tableId: null, needsReview: false, reason: "zone_unavailable", freeSeats, debug };
  }

  if (freeSeats >= opts.partySize) {
    return { tableId: null, needsReview: true, reason: "needs_human_review", freeSeats, debug };
  }
  return { tableId: null, needsReview: false, reason: "no_capacity", freeSeats, debug };
}

async function createReservation(p: Payload) {
  if (!p.restaurant_id || !p.customer_name || !p.reservation_date || !p.reservation_time || !p.party_size) {
    return json({ ok: false, error: "missing_fields" }, 400);
  }

  // Delegate to the new create-voice-reservation edge function so we share
  // a single source of truth for rules, recommendations, shift-mode
  // validation, idempotency and table assignment.
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const token = Deno.env.get("RETELL_WEBHOOK_TOKEN") ?? "";
  if (!baseUrl) return json({ ok: false, error: "server_not_configured" }, 500);

  const callId =
    (p as any).callId ?? (p as any).call_id ?? (p as any).conversation_id ?? null;

  const body = {
    restaurantId: p.restaurant_id,
    customerName: p.customer_name,
    phone: p.customer_phone ?? null,
    date: p.reservation_date,
    time: p.reservation_time,
    partySize: p.party_size,
    notes: p.customer_notes ?? p.special_requests ?? null,
    preferredZoneName: p.preferred_zone ?? p.zone ?? null,
    preferredZoneId: (p as any).preferredZoneId ?? null,
    transcript: (p as any).transcript ?? null,
    callId,
  };

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/functions/v1/create-voice-reservation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-token": token,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return json(
      {
        ok: false,
        error: "voice_reservation_unreachable",
        message: "No he podido guardar la reserva. Vuelve a intentarlo, por favor.",
        debug: { reason: String(e) },
      },
      502,
    );
  }

  let result: any;
  try {
    result = await res.json();
  } catch {
    return json(
      {
        ok: false,
        error: "voice_reservation_invalid_response",
        message: "No he podido guardar la reserva. Vuelve a intentarlo, por favor.",
      },
      502,
    );
  }

  return json(normalizeVoiceReservationResponse(result));
}

/**
 * Map the new VoiceReservationResponse shape back to the legacy
 * `{ ok, reservation, message, ... }` envelope that the existing Retell
 * agent ("Sofía") understands.
 *
 * - confirmed       → ok:true, reservation.status:"confirmed"
 * - requires_human  → ok:true, reservation.status:"requires_human", needs_review:true
 * - blocked         → ok:false, available:false, reason:"blocked"
 *
 * `messageForAgent` is always surfaced as `message` (the spoken line).
 * Technical fields (debug, reviewReasons, recommendedAssignment) are kept
 * in separate keys so the agent never reads them aloud.
 */
function normalizeVoiceReservationResponse(r: any) {
  const status = r?.status as "confirmed" | "requires_human" | "blocked" | undefined;
  const message = r?.messageForAgent ?? "";
  const base = {
    message,
    review_reasons: r?.reviewReasons ?? [],
    recommended_assignment: r?.recommendedAssignment ?? null,
    assigned_tables: r?.assignedTables ?? [],
    available_turns: r?.availableTurns ?? undefined,
    idempotent: r?.idempotent ?? undefined,
    debug: r?.debug ?? undefined,
  };

  if (status === "confirmed") {
    return {
      ok: true,
      available: true,
      reservation: {
        id: r?.reservationId ?? null,
        status: "confirmed",
      },
      ...base,
    };
  }
  if (status === "requires_human") {
    return {
      ok: true,
      available: true,
      needs_review: true,
      reservation: {
        id: r?.reservationId ?? null,
        status: "requires_human",
      },
      ...base,
    };
  }
  // blocked or unknown
  return {
    ok: false,
    available: false,
    reason: "blocked",
    blocking_reason: r?.blockingReason ?? null,
    ...base,
  };
}

  // Auto-assign the smallest table that fits the party.
  const assignment = await autoAssignTable({
    restaurantId: p.restaurant_id,
    date: p.reservation_date,
    time: p.reservation_time,
    partySize: p.party_size,
    preferredZone: p.preferred_zone ?? p.zone,
  });

  if (
    assignment.reason === "no_capacity" ||
    assignment.reason === "no_tables_configured" ||
    assignment.reason === "zone_unavailable"
  ) {
    return json({
      ok: false,
      error: assignment.reason,
      message:
        assignment.reason === "no_tables_configured"
          ? "El restaurante no tiene mesas configuradas."
          : assignment.reason === "zone_unavailable"
            ? `No hay disponibilidad en la zona "${p.preferred_zone ?? p.zone}".`
            : "No hay capacidad disponible para esa hora.",
      free_seats: assignment.freeSeats,
      available_zones: assignment.debug?.available_zones ?? [],
      availability_debug: assignment.debug,
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
        excludeReservationId: p.exclude_reservation_id,
      });

      if (
        assignment.reason === "no_capacity" ||
        assignment.reason === "no_tables_configured" ||
        assignment.reason === "zone_unavailable"
      ) {
        return json({
          ok: true,
          date: p.date,
          time: p.reservation_time,
          is_open: true,
          available: false,
          reason: assignment.reason,
          message:
            assignment.reason === "no_tables_configured"
              ? "El restaurante no tiene mesas configuradas."
              : assignment.reason === "zone_unavailable"
                ? `No hay disponibilidad en la zona "${p.preferred_zone ?? p.zone}". Zonas disponibles: ${(assignment.debug?.available_zones ?? []).map((z) => z.name).join(", ") || "ninguna"}.`
                : "No hay capacidad disponible para esa hora.",
          assignment_preview: {
            table_id: null,
            needs_review: false,
            free_seats: assignment.freeSeats,
          },
          availability_debug: assignment.debug,
          available_zones: assignment.debug?.available_zones ?? [],
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
          availability_debug: assignment.debug,
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
        availability_debug: assignment.debug,
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

function normalizePhone(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\D/g, "");
}

function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  const denom = Math.max(ta.size, tb.size);
  return denom ? common / denom : 0;
}

async function findReservation(p: Payload) {
  if (!p.restaurant_id) return json({ ok: false, error: "missing_restaurant_id" }, 400);
  if (!p.customer_name && !p.customer_phone) {
    return json({ ok: false, error: "missing_search_criteria", message: "Indica customer_name o customer_phone." }, 400);
  }

  // Today (UTC) to scope future/recent reservations
  const today = new Date().toISOString().slice(0, 10);

  const baseQuery = (date?: string) => {
    let q = supabase
      .from("reservations")
      .select("*")
      .eq("restaurant_id", p.restaurant_id)
      // Exclude only explicitly cancelled/no_show; keep status null.
      .or("status.is.null,and(status.neq.cancelled,status.neq.no_show)")
      .order("reservation_date", { ascending: true })
      .order("reservation_time", { ascending: true })
      .limit(200);
    if (date) q = q.eq("reservation_date", date);
    else q = q.gte("reservation_date", today);
    return q;
  };

  const runSearch = async (date?: string) => {
    const { data, error } = await baseQuery(date);
    if (error) throw new Error(error.message);
    return data ?? [];
  };

  let pool: any[] = [];
  try {
    if (p.reservation_date) {
      pool = await runSearch(p.reservation_date);
      if (pool.length === 0) pool = await runSearch();
    } else {
      pool = await runSearch();
    }
  } catch (e) {
    return json({ ok: false, error: String(e) }, 400);
  }

  const inputPhone = normalizePhone(p.customer_phone);
  const inputName = normalizeName(p.customer_name);

  type Scored = { reservation: any; score: number; phone_match: boolean; name_score: number };
  const scored: Scored[] = pool.map((r) => {
    const rPhone = normalizePhone(r.customer_phone);
    let phoneMatch = false;
    if (inputPhone && rPhone) {
      // match last 9 digits (typical local number) or full
      const a = inputPhone.slice(-9);
      const b = rPhone.slice(-9);
      phoneMatch = a.length >= 6 && (a === b || rPhone.endsWith(inputPhone) || inputPhone.endsWith(rPhone));
    }
    const nameScore = inputName ? nameSimilarity(inputName, r.customer_name ?? "") : 0;
    let score = 0;
    if (phoneMatch) score += 1;
    score += nameScore;
    return { reservation: r, score, phone_match: phoneMatch, name_score: nameScore };
  });

  const matches = scored
    .filter((s) => s.phone_match || s.name_score >= 0.6)
    .sort((a, b) => b.score - a.score);

  const candidates = scored
    .filter((s) => !matches.includes(s) && (s.name_score >= 0.3 || (inputPhone && normalizePhone(s.reservation.customer_phone))))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return json({
    ok: true,
    count: matches.length,
    reservations: matches.map((m) => m.reservation),
    candidates: candidates.map((c) => ({
      reservation: c.reservation,
      name_score: Number(c.name_score.toFixed(2)),
      phone_match: c.phone_match,
    })),
    searched: {
      date: p.reservation_date ?? null,
      fell_back_to_no_date: !!p.reservation_date && pool.length > 0 && !pool.some((r) => r.reservation_date === p.reservation_date),
      pool_size: pool.length,
    },
  });
}

async function updateReservation(p: Payload) {
  if (!p.reservation_id) return json({ ok: false, error: "missing_reservation_id" }, 400);

  // Load current reservation
  const { data: cur, error: curErr } = await supabase
    .from("reservations")
    .select("*")
    .eq("id", p.reservation_id)
    .maybeSingle();
  if (curErr) return json({ ok: false, error: curErr.message }, 400);
  if (!cur) return json({ ok: false, error: "reservation_not_found" }, 404);

  const restaurantId = (p.restaurant_id ?? cur.restaurant_id) as string;
  const newZone = p.preferred_zone ?? p.zone;

  const dateChanged = !!p.reservation_date && p.reservation_date !== cur.reservation_date;
  const timeChanged = !!p.reservation_time && p.reservation_time.slice(0, 5) !== String(cur.reservation_time).slice(0, 5);
  const partyChanged = !!p.party_size && p.party_size !== cur.party_size;
  const zoneChanged = !!newZone;

  const patch: Record<string, unknown> = { status: "modified" };
  if (p.customer_notes !== undefined) patch.customer_notes = p.customer_notes;

  if (dateChanged || timeChanged || partyChanged || zoneChanged) {
    const date = (p.reservation_date ?? cur.reservation_date) as string;
    const time = (p.reservation_time ?? cur.reservation_time) as string;
    const partySize = (p.party_size ?? cur.party_size) as number;

    // Validate service hours
    const v = await validateSlot(restaurantId, date, time);
    if (!v.ok) return json(v, 409);

    // Reassign table, excluding this reservation from occupancy
    const assignment = await autoAssignTable({
      restaurantId,
      date,
      time,
      partySize,
      preferredZone: newZone,
      excludeReservationId: p.reservation_id,
    });

    if (
      assignment.reason === "no_capacity" ||
      assignment.reason === "no_tables_configured" ||
      assignment.reason === "zone_unavailable"
    ) {
      return json({
        ok: false,
        error: assignment.reason,
        reason: assignment.reason,
        message:
          assignment.reason === "no_tables_configured"
            ? "El restaurante no tiene mesas configuradas."
            : assignment.reason === "zone_unavailable"
              ? `No hay disponibilidad en la zona "${newZone}".`
              : "No hay capacidad disponible para esa hora.",
        free_seats: assignment.freeSeats,
        available_zones: assignment.debug?.available_zones ?? [],
        availability_debug: assignment.debug,
      }, 409);
    }

    patch.reservation_date = date;
    patch.reservation_time = time;
    patch.party_size = partySize;
    patch.table_id = assignment.tableId;
    patch.status = assignment.needsReview ? "requires_human" : "modified";

    // Merge zone/special_requests into customer_notes if provided
    if (newZone || p.special_requests || p.customer_notes !== undefined) {
      const extra: string[] = [];
      if (p.customer_notes !== undefined) {
        if (p.customer_notes) extra.push(p.customer_notes);
      } else if (cur.customer_notes) {
        extra.push(cur.customer_notes);
      }
      if (newZone) extra.push(`Zona preferida: ${newZone}`);
      if (p.special_requests) extra.push(`Peticiones: ${p.special_requests}`);
      patch.customer_notes = extra.length ? extra.join(" | ") : null;
    }

    const { data, error } = await supabase
      .from("reservations")
      .update(patch)
      .eq("id", p.reservation_id)
      .select()
      .single();
    if (error) return json({ ok: false, error: error.message }, 400);

    if (assignment.needsReview && data) {
      await supabase.from("human_handoff_requests").insert({
        restaurant_id: restaurantId,
        reservation_id: data.id,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        source_channel: "future_voice",
        reason: "table_auto_assignment_failed",
        customer_message: `Modificación de reserva: ${partySize} personas el ${date} a las ${time}. Reasignar mesa manualmente.`,
        status: "pending",
      });
      return json({
        ok: true,
        reservation: data,
        reason: "needs_human_review",
        assignment: { table_id: null, needs_review: true, free_seats: assignment.freeSeats },
      });
    }

    return json({
      ok: true,
      reservation: data,
      reason: "assigned",
      assignment: {
        table_id: assignment.tableId,
        needs_review: false,
        ...(("tableLabel" in assignment) ? { table_label: assignment.tableLabel } : {}),
      },
    });
  }

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
  payload = normalizeAliases(payload);

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