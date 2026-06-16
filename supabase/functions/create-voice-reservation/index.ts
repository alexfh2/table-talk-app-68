// Edge Function: create-voice-reservation
//
// Crea reservas por voz (canal future_voice) usando la misma lógica del
// dashboard: horario efectivo, reglas de confirmación y recomendación
// inteligente de mesa/combinación.
//
// Endpoint público (verify_jwt = false en config). Protegido por el secreto
// compartido RETELL_WEBHOOK_TOKEN — el cliente (N8N / Retell) debe pasar
// `x-webhook-token` con el valor del secreto.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-token",
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

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface VoiceReservationPayload {
  restaurantId?: string;
  customerName?: string;
  phone?: string | null;
  date?: string;
  time?: string;
  partySize?: number;
  notes?: string | null;
  preferredZoneId?: string | null;
  preferredZoneName?: string | null;
  transcript?: string | null;
  callId?: string | null;
}

type Status = "confirmed" | "requires_human" | "blocked";

interface AssignedTable {
  id: string;
  label: string;
  zoneName: string | null;
}

interface RecommendedAssignmentSummary {
  type: "individual_table" | "table_combination" | "none";
  label: string | null;
  zoneName: string | null;
  confidence: "high" | "medium" | "low";
}

interface VoiceReservationResponse {
  success: boolean;
  reservationId?: string;
  status: Status;
  channel: "future_voice";
  assignedTables?: AssignedTable[];
  recommendedAssignment?: RecommendedAssignmentSummary;
  messageForAgent: string;
  reviewReasons: string[];
  blockingReason?: string;
  idempotent?: boolean;
  availableTurns?: string[];
  debug?: {
    receivedPayloadKeys: string[];
    normalizedPayload: VoiceReservationPayload;
  };
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function dayOfWeekFromISO(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1)).getUTCDay();
}

function timeToMinutes(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minutesBetween(a: string, b: string) {
  return Math.abs(timeToMinutes(a) - timeToMinutes(b));
}

function isTimeWithinService(time: string, open: string, close: string) {
  if (!open || !close) return false;
  const t = timeToMinutes(time);
  const o = timeToMinutes(open);
  let c = timeToMinutes(close);
  if (c === 0) c = 24 * 60;
  if (c >= o) return t >= o && t <= c;
  return t >= o || t <= c;
}

function formatDateEs(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}`;
}

function personas(n: number) {
  return `${n} ${n === 1 ? "persona" : "personas"}`;
}

// ---------------------------------------------------------------------------
// Horario efectivo
// ---------------------------------------------------------------------------

async function getEffectiveServices(restaurantId: string, date: string) {
  const dow = dayOfWeekFromISO(date);
  const [schedRes, seasonsRes, excRes] = await Promise.all([
    supabase
      .from("restaurant_schedule")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("day_of_week", dow),
    supabase
      .from("schedule_seasons")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .lte("start_date", date)
      .gte("end_date", date),
    supabase
      .from("blocked_dates")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("date", date),
  ]);
  const schedule = schedRes.data ?? [];
  const seasons = (seasonsRes.data ?? [])
    .slice()
    .sort((a: any, b: any) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.start_date < b.start_date ? 1 : -1;
    });
  const season = seasons[0] ?? null;
  const seasonId = season?.id ?? null;
  const exceptions = excRes.data ?? [];

  const openRows = (sid: string | null) =>
    schedule
      .filter(
        (r: any) =>
          (r.season_id ?? null) === sid &&
          r.is_open &&
          r.opening_time &&
          r.closing_time,
      )
      .map((r: any) => ({ ...r }));

  let services = openRows(seasonId);
  let source: "exception" | "season" | "base" = season ? "season" : "base";
  if (season && services.length === 0) {
    services = openRows(null);
    source = "base";
  }

  for (const ex of exceptions as any[]) {
    source = "exception";
    const affected: Array<"lunch" | "dinner"> =
      ex.service_period === "lunch"
        ? ["lunch"]
        : ex.service_period === "dinner"
          ? ["dinner"]
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
  return { services, source };
}

// ---------------------------------------------------------------------------
// Disponibilidad de mesas + recomendación
// ---------------------------------------------------------------------------

interface TableRow {
  id: string;
  label: string;
  zone_id: string | null;
  min_capacity: number;
  max_capacity: number;
  sort_order: number | null;
  is_active: boolean;
}

interface ZoneRow {
  id: string;
  name: string;
  is_active: boolean;
}

interface ComboRow {
  id: string;
  is_active: boolean;
  min_capacity: number | null;
  max_capacity: number;
}

interface AvailableCombo {
  combination: ComboRow;
  tables: TableRow[];
  zone: ZoneRow | null;
}

const DEFAULT_SLOT_MIN = 120;

async function getAvailableOptions(opts: {
  restaurantId: string;
  date: string;
  time: string;
  partySize: number;
  slotMinutes?: number;
}) {
  const time = opts.time.slice(0, 5);
  const slotWindow = opts.slotMinutes ?? DEFAULT_SLOT_MIN;
  const [tablesRes, zonesRes, combosRes, comboTablesRes, reservationsRes] =
    await Promise.all([
      supabase.from("restaurant_tables").select("*").eq("restaurant_id", opts.restaurantId),
      supabase.from("restaurant_zones").select("*").eq("restaurant_id", opts.restaurantId),
      supabase.from("table_combinations").select("*").eq("restaurant_id", opts.restaurantId),
      supabase.from("table_combination_tables").select("*"),
      supabase
        .from("reservations")
        .select("id, table_id, reservation_time, status")
        .eq("restaurant_id", opts.restaurantId)
        .eq("reservation_date", opts.date)
        .not("status", "in", "(cancelled,no_show)"),
    ]);

  const tables = (tablesRes.data ?? []) as TableRow[];
  const zones = (zonesRes.data ?? []) as ZoneRow[];
  const combos = (combosRes.data ?? []) as ComboRow[];
  const comboTables = (comboTablesRes.data ?? []) as Array<{
    combination_id: string;
    table_id: string;
  }>;
  const reservations = (reservationsRes.data ?? []) as Array<{
    id: string;
    table_id: string | null;
    reservation_time: string;
  }>;

  const activeTables = tables.filter((t) => t.is_active);

  const overlapping = reservations.filter(
    (r) => minutesBetween(time, String(r.reservation_time)) < slotWindow,
  );
  const overlappingIds = overlapping.map((r) => r.id);

  const occupied = new Set<string>();
  if (overlappingIds.length > 0) {
    const { data: rt } = await supabase
      .from("reservation_tables")
      .select("reservation_id, table_id")
      .in("reservation_id", overlappingIds);
    const withRows = new Set<string>();
    for (const row of (rt ?? []) as Array<{ reservation_id: string; table_id: string }>) {
      occupied.add(row.table_id);
      withRows.add(row.reservation_id);
    }
    for (const r of overlapping) {
      if (r.table_id && !withRows.has(r.id)) occupied.add(r.table_id);
    }
  }

  const freeTables = activeTables.filter((t) => !occupied.has(t.id));
  const individualTables = freeTables
    .filter((t) => opts.partySize >= t.min_capacity && opts.partySize <= t.max_capacity)
    .sort((a, b) =>
      a.max_capacity !== b.max_capacity
        ? a.max_capacity - b.max_capacity
        : (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );

  const tableById = new Map(tables.map((t) => [t.id, t]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const tablesByCombo = new Map<string, string[]>();
  for (const ct of comboTables) {
    const arr = tablesByCombo.get(ct.combination_id) ?? [];
    arr.push(ct.table_id);
    tablesByCombo.set(ct.combination_id, arr);
  }

  const combinations: AvailableCombo[] = [];
  for (const c of combos) {
    if (!c.is_active) continue;
    const min = c.min_capacity ?? 1;
    if (opts.partySize < min || opts.partySize > c.max_capacity) continue;
    const ids = tablesByCombo.get(c.id) ?? [];
    if (ids.length < 2) continue;
    const members = ids.map((id) => tableById.get(id)).filter((t): t is TableRow => !!t);
    if (members.length !== ids.length) continue;
    if (members.some((t) => !t.is_active)) continue;
    if (members.some((t) => occupied.has(t.id))) continue;
    const zoneIds = new Set(members.map((t) => t.zone_id));
    if (zoneIds.size !== 1) continue;
    const zone = members[0].zone_id ? (zoneById.get(members[0].zone_id) ?? null) : null;
    combinations.push({ combination: c, tables: members, zone });
  }
  combinations.sort((a, b) => a.combination.max_capacity - b.combination.max_capacity);

  return { individualTables, combinations, zones, occupiedTableIds: Array.from(occupied), combosAll: combos, comboTablesAll: comboTables };
}

interface ScoredIndividual {
  type: "individual_table";
  table: TableRow;
  waste: number;
  inPreferredZone: boolean;
  total: number;
}
interface ScoredCombination {
  type: "table_combination";
  combo: AvailableCombo;
  waste: number;
  inPreferredZone: boolean;
  total: number;
}
type Scored = ScoredIndividual | ScoredCombination;

interface RecommendationResult {
  recommended:
    | { type: "individual_table"; table: TableRow; zone: ZoneRow | null }
    | { type: "table_combination"; combo: AvailableCombo }
    | { type: "none" };
  confidence: "high" | "medium" | "low";
  inPreferredZone: boolean;
  anyInPreferredZone: boolean;
}

function computeRecommendation(
  available: Awaited<ReturnType<typeof getAvailableOptions>>,
  partySize: number,
  preferredZoneId: string | null,
): RecommendationResult {
  const { individualTables, combinations, zones, occupiedTableIds, combosAll, comboTablesAll } = available;

  // Combination membership map for preservation penalty.
  const combosByTable = new Map<string, ComboRow[]>();
  const tablesByCombo = new Map<string, string[]>();
  for (const ct of comboTablesAll) {
    const arr = tablesByCombo.get(ct.combination_id) ?? [];
    arr.push(ct.table_id);
    tablesByCombo.set(ct.combination_id, arr);
  }
  for (const c of combosAll) {
    if (!c.is_active) continue;
    for (const tid of tablesByCombo.get(c.id) ?? []) {
      const arr = combosByTable.get(tid) ?? [];
      arr.push(c);
      combosByTable.set(tid, arr);
    }
  }
  const occupiedSet = new Set(occupiedTableIds);

  const indivs: ScoredIndividual[] = individualTables.map((t) => {
    const waste = Math.max(0, t.max_capacity - partySize);
    const inPreferredZone = !!preferredZoneId && t.zone_id === preferredZoneId;
    const memberCombos = combosByTable.get(t.id) ?? [];
    let breaksFullyFree = 0;
    let belongsToBroken = false;
    for (const c of memberCombos) {
      const others = (tablesByCombo.get(c.id) ?? []).filter((id) => id !== t.id);
      if (others.length === 0) continue;
      const anyOcc = others.some((id) => occupiedSet.has(id));
      if (anyOcc) belongsToBroken = true;
      else breaksFullyFree += 1;
    }
    const combinationBreakPenalty = breaksFullyFree * 2;
    const alreadyBrokenBonus = belongsToBroken && breaksFullyFree === 0 ? -0.25 : 0;
    const highCombinabilityPenalty =
      memberCombos.length > 1 ? (memberCombos.length - 1) * 0.5 : 0;
    const preferredZonePenalty = preferredZoneId && !inPreferredZone ? 3 : 0;
    const total =
      waste +
      combinationBreakPenalty +
      alreadyBrokenBonus +
      highCombinabilityPenalty +
      preferredZonePenalty;
    return { type: "individual_table", table: t, waste, inPreferredZone, total };
  });

  const combos: ScoredCombination[] = combinations.map((c) => {
    const waste = Math.max(0, c.combination.max_capacity - partySize);
    const inPreferredZone =
      !!preferredZoneId && c.tables.every((t) => t.zone_id === preferredZoneId);
    const preferredZonePenalty = preferredZoneId && !inPreferredZone ? 3 : 0;
    const typePenalty = 0.5;
    return {
      type: "table_combination",
      combo: c,
      waste,
      inPreferredZone,
      total: waste + typePenalty + preferredZonePenalty,
    };
  });

  const all: Scored[] = [...indivs, ...combos].sort((a, b) => a.total - b.total);
  if (all.length === 0) {
    return {
      recommended: { type: "none" },
      confidence: "low",
      inPreferredZone: false,
      anyInPreferredZone: false,
    };
  }

  const top = all[0];
  const anyInPreferredZone = !!preferredZoneId && all.some((o) => o.inPreferredZone);

  let confidence: "high" | "medium" | "low";
  if (top.waste === 0) confidence = "high";
  else if (top.waste <= 1 && top.type === "individual_table") confidence = "high";
  else if (top.waste <= 3) confidence = "medium";
  else confidence = "low";
  if (preferredZoneId && !top.inPreferredZone) {
    confidence = confidence === "high" ? "medium" : "low";
  }

  if (top.type === "individual_table") {
    const zone = top.table.zone_id
      ? (zones.find((z) => z.id === top.table.zone_id) ?? null)
      : null;
    return {
      recommended: { type: "individual_table", table: top.table, zone },
      confidence,
      inPreferredZone: top.inPreferredZone,
      anyInPreferredZone,
    };
  }
  return {
    recommended: { type: "table_combination", combo: top.combo },
    confidence,
    inPreferredZone: top.inPreferredZone,
    anyInPreferredZone,
  };
}

// ---------------------------------------------------------------------------
// Reglas
// ---------------------------------------------------------------------------

interface RulesContext {
  maxAuto: number;
  requirePhone: boolean;
  minNoticeHours: number;
  maxAdvanceDays: number;
}

interface RulesEvaluation {
  canSave: boolean;
  suggestedStatus: "confirmed" | "requires_human" | null;
  blockingReason: string | null;
  reviewReasons: string[];
}

function evaluateRules(
  input: {
    customerName: string;
    phone: string | null;
    date: string;
    time: string;
    partySize: number;
  },
  ctx: RulesContext,
): RulesEvaluation {
  const reviewReasons: string[] = [];

  // Antelación
  const reservationAt = new Date(`${input.date}T${input.time.slice(0, 5)}:00`);
  const nowMs = Date.now();
  const diffHours = (reservationAt.getTime() - nowMs) / 3_600_000;
  if (diffHours < 0) {
    return {
      canSave: false,
      suggestedStatus: null,
      blockingReason: "La hora solicitada ya ha pasado.",
      reviewReasons: [],
    };
  }
  if (ctx.minNoticeHours > 0 && diffHours < ctx.minNoticeHours) {
    reviewReasons.push("Antelación insuficiente.");
  }
  const diffDays = diffHours / 24;
  if (ctx.maxAdvanceDays > 0 && diffDays > ctx.maxAdvanceDays) {
    return {
      canSave: false,
      suggestedStatus: null,
      blockingReason: `La reserva supera el máximo de ${ctx.maxAdvanceDays} días de antelación.`,
      reviewReasons: [],
    };
  }

  if (input.partySize > ctx.maxAuto) {
    reviewReasons.push("Reserva grande: supera el límite de confirmación automática.");
  }
  const phoneMissing = !input.phone || input.phone.trim().length < 6;
  if (phoneMissing && ctx.requirePhone) {
    reviewReasons.push("Falta teléfono.");
  }

  return {
    canSave: true,
    suggestedStatus: reviewReasons.length > 0 ? "requires_human" : "confirmed",
    blockingReason: null,
    reviewReasons,
  };
}

// ---------------------------------------------------------------------------
// Normalización de payload (compatibilidad N8N/Retell aliases)
// ---------------------------------------------------------------------------

function normalizePayload(raw: Record<string, unknown>): VoiceReservationPayload {
  const pickString = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "string") return v;
    }
    return undefined;
  };
  const pickNumber = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
    }
    return undefined;
  };

  return {
    restaurantId: pickString("restaurantId"),
    customerName: pickString("customerName", "name"),
    phone: pickString("phone", "customerPhone") ?? null,
    date: pickString("date", "reservationDate"),
    time: pickString("time", "reservationTime"),
    partySize: pickNumber("partySize", "guests", "people"),
    notes: pickString("notes", "note") ?? null,
    preferredZoneId: pickString("preferredZoneId") ?? null,
    preferredZoneName: pickString("preferredZoneName", "zoneName") ?? null,
    transcript: pickString("transcript") ?? null,
    callId: pickString("callId") ?? null,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function validatePayload(p: VoiceReservationPayload):
  | { ok: true; data: Required<Pick<VoiceReservationPayload, "restaurantId" | "customerName" | "date" | "time" | "partySize">> & VoiceReservationPayload }
  | { ok: false; reason: string } {
  if (!p.restaurantId) return { ok: false, reason: "Falta el identificador del restaurante." };
  if (!p.customerName || !p.customerName.trim())
    return { ok: false, reason: "Falta el nombre del cliente." };
  if (!p.date) return { ok: false, reason: "Falta la fecha de la reserva." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date))
    return { ok: false, reason: "Fecha inválida (YYYY-MM-DD)." };
  if (!p.time) return { ok: false, reason: "Falta la hora de la reserva." };
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(p.time))
    return { ok: false, reason: "Hora inválida (HH:MM)." };
  if (p.partySize === undefined || p.partySize === null)
    return { ok: false, reason: "Falta el número de personas." };
  const ps = Number(p.partySize);
  if (!Number.isFinite(ps) || ps < 1)
    return { ok: false, reason: "Número de personas inválido." };
  return {
    ok: true,
    data: {
      ...p,
      restaurantId: p.restaurantId,
      customerName: p.customerName.trim(),
      date: p.date,
      time: p.time.slice(0, 5),
      partySize: ps,
    },
  };
}

async function handle(payload: VoiceReservationPayload): Promise<VoiceReservationResponse> {
  const valid = validatePayload(payload);
  if (!valid.ok) {
    return {
      success: false,
      status: "blocked",
      channel: "future_voice",
      reviewReasons: [valid.reason],
      messageForAgent: "He tomado nota de la solicitud. El restaurante la revisará y confirmará.",
      blockingReason: valid.reason,
    };
  }
  const p = valid.data;

  // 0) Idempotencia por callId: si ya existe una reserva con el mismo Call ID
  // para este restaurante, devolverla sin crear duplicado.
  const callId = (payload.callId ?? "").trim();
  if (callId) {
    const callIdTag = `Call ID: ${callId}`;
    const { data: existingRows } = await supabase
      .from("reservations")
      .select("id, status, table_id, reservation_date, reservation_time, party_size")
      .eq("restaurant_id", p.restaurantId)
      .ilike("internal_notes", `%${callIdTag}%`)
      .order("created_at", { ascending: false })
      .limit(1);
    const existing = (existingRows ?? [])[0];
    if (existing) {
      const { data: rtRows } = await supabase
        .from("reservation_tables")
        .select("table_id, restaurant_tables(label, zone_id, restaurant_zones(name))")
        .eq("reservation_id", existing.id);
      const assignedTables: AssignedTable[] = (rtRows ?? []).map((r: any) => ({
        id: r.table_id,
        label: r.restaurant_tables?.label ?? "",
        zoneName: r.restaurant_tables?.restaurant_zones?.name ?? null,
      }));
      const status: Status =
        existing.status === "requires_human" ? "requires_human" : "confirmed";
      console.log("[create-voice-reservation] idempotent hit", {
        callId,
        reservationId: existing.id,
        status,
      });
      return {
        success: true,
        reservationId: existing.id,
        status,
        channel: "future_voice",
        assignedTables: assignedTables.length > 0 ? assignedTables : undefined,
        messageForAgent:
          status === "requires_human"
            ? "Ya tengo registrada esta solicitud. El restaurante la revisará."
            : `Ya tengo registrada esta reserva para ${personas(existing.party_size)} el ${formatDateEs(existing.reservation_date)} a las ${String(existing.reservation_time).slice(0, 5)}.`,
        reviewReasons: [],
        idempotent: true,
      };
    }
  }

  // 1) Horario efectivo
  const sched = await getEffectiveServices(p.restaurantId, p.date);
  const time = p.time;
  const inService =
    sched.services.length > 0 &&
    sched.services.some((s: any) =>
      isTimeWithinService(
        time,
        (s.opening_time ?? "").slice(0, 5),
        (s.closing_time ?? "").slice(0, 5),
      ),
    );
  if (sched.services.length === 0) {
    const reason =
      sched.source === "exception"
        ? "El restaurante no acepta reservas ese día."
        : "El restaurante está cerrado ese día.";
    return {
      success: false,
      status: "blocked",
      channel: "future_voice",
      reviewReasons: [],
      messageForAgent: "No hay disponibilidad para esa hora. Puedo mirar otra hora.",
      blockingReason: reason,
    };
  }
  if (!inService) {
    return {
      success: false,
      status: "blocked",
      channel: "future_voice",
      reviewReasons: [],
      messageForAgent: "No hay disponibilidad para esa hora. Puedo mirar otra hora.",
      blockingReason: "La hora solicitada está fuera del horario de servicio.",
    };
  }

  // 2) Reglas
  const { data: agentData } = await supabase
    .from("agent_settings")
    .select("*")
    .eq("restaurant_id", p.restaurantId)
    .maybeSingle();
  const agent = (agentData ?? {}) as Record<string, unknown>;
  const ctx: RulesContext = {
    maxAuto: (agent.max_party_size_auto as number) ?? 8,
    requirePhone: (agent.missing_phone_policy as string) === "requires_review",
    minNoticeHours: (agent.min_notice_hours as number) ?? 0,
    maxAdvanceDays: (agent.max_advance_days as number) ?? 60,
  };
  const voicePolicy =
    (agent.voice_reservation_policy as string) ?? "auto_if_no_conflict";
  const autoMode =
    (agent.voice_table_autoassign_mode as
      | "off"
      | "high_confidence_only"
      | "any_available") ?? "high_confidence_only";
  const noTableFallback =
    (agent.voice_no_table_fallback as
      | "requires_human"
      | "confirm_without_table"
      | "block") ?? "requires_human";

  const rules = evaluateRules(
    {
      customerName: p.customerName,
      phone: p.phone ?? null,
      date: p.date,
      time,
      partySize: p.partySize,
    },
    ctx,
  );

  // Política global del agente: forzar review siempre si así está configurado
  if (voicePolicy === "requires_review" && rules.canSave) {
    if (!rules.reviewReasons.includes("Política: las reservas por voz requieren revisión.")) {
      rules.reviewReasons.push("Política: las reservas por voz requieren revisión.");
    }
    rules.suggestedStatus = "requires_human";
  }

  // 3) Mesa preferida -> validar que la zona existe y está activa
  let preferredZoneId = p.preferredZoneId ?? null;
  let preferredZoneName: string | null = null;
  let preferredZoneTextual: string | null = null;
  if (preferredZoneId) {
    const { data: zRow } = await supabase
      .from("restaurant_zones")
      .select("id, name, is_active, restaurant_id")
      .eq("id", preferredZoneId)
      .maybeSingle();
    const z = zRow as { name: string; is_active: boolean; restaurant_id: string } | null;
    if (!z || !z.is_active || z.restaurant_id !== p.restaurantId) {
      preferredZoneId = null;
    } else {
      preferredZoneName = z.name;
    }
  }

  // 3.b) Resolver preferredZoneName si no hay preferredZoneId.
  const rawZoneName = (payload.preferredZoneName ?? "").trim();
  if (!preferredZoneId && rawZoneName) {
    const { data: zonesRows } = await supabase
      .from("restaurant_zones")
      .select("id, name, is_active")
      .eq("restaurant_id", p.restaurantId)
      .eq("is_active", true);
    const zones = (zonesRows ?? []) as Array<{ id: string; name: string }>;
    const target = rawZoneName.toLowerCase();
    const exact = zones.filter((z) => z.name.toLowerCase() === target);
    const partial =
      exact.length === 0
        ? zones.filter(
            (z) =>
              z.name.toLowerCase().includes(target) ||
              target.includes(z.name.toLowerCase()),
          )
        : [];
    const matches = exact.length > 0 ? exact : partial;
    if (matches.length === 1) {
      preferredZoneId = matches[0].id;
      preferredZoneName = matches[0].name;
    } else {
      preferredZoneTextual = rawZoneName;
    }
  }

  // 4) Recomendación
  const available = await getAvailableOptions({
    restaurantId: p.restaurantId,
    date: p.date,
    time,
    partySize: p.partySize,
  });
  const recommendation = computeRecommendation(available, p.partySize, preferredZoneId);

  // Si hay blockingReason: no se puede guardar. Bloqueado.
  if (!rules.canSave) {
    return {
      success: false,
      status: "blocked",
      channel: "future_voice",
      reviewReasons: rules.reviewReasons,
      messageForAgent: "No hay disponibilidad para esa hora. Puedo mirar otra hora.",
      blockingReason: rules.blockingReason ?? "Reserva bloqueada.",
    };
  }

  // 5) Decisión de autoasignación
  const recommendedSummary: RecommendedAssignmentSummary = (() => {
    if (recommendation.recommended.type === "none") {
      return { type: "none", label: null, zoneName: null, confidence: recommendation.confidence };
    }
    if (recommendation.recommended.type === "individual_table") {
      return {
        type: "individual_table",
        label: recommendation.recommended.table.label,
        zoneName: recommendation.recommended.zone?.name ?? null,
        confidence: recommendation.confidence,
      };
    }
    return {
      type: "table_combination",
      label: recommendation.recommended.combo.tables.map((t) => t.label).join(" + "),
      zoneName: recommendation.recommended.combo.zone?.name ?? null,
      confidence: recommendation.confidence,
    };
  })();

  // Auto-assign only if conditions are met.
  const recommendationIsClear =
    recommendation.recommended.type !== "none" && recommendation.confidence === "high";
  const recommendationIsAvailable = recommendation.recommended.type !== "none";

  let willAssign = false;
  if (rules.suggestedStatus === "confirmed") {
    if (autoMode === "any_available" && recommendationIsAvailable) willAssign = true;
    else if (autoMode === "high_confidence_only" && recommendationIsClear) willAssign = true;
  }

  // Si la preferencia de zona se solicitó pero no hay opciones en esa zona → marcar motivo de revisión opcional
  if (preferredZoneId && !recommendation.anyInPreferredZone) {
    rules.reviewReasons.push("Preferencia de zona no disponible.");
    if (rules.suggestedStatus === "confirmed") {
      rules.suggestedStatus = "requires_human";
      willAssign = false;
    }
  }

  // Si no hay mesa pero rules confirma → aplicar política de fallback
  let status: Status = rules.suggestedStatus === "requires_human" ? "requires_human" : "confirmed";
  let willInsertTable = willAssign;

  if (status === "confirmed" && !willAssign) {
    // No hay mesa clara (o autoMode off)
    if (noTableFallback === "block") {
      return {
        success: false,
        status: "blocked",
        channel: "future_voice",
        reviewReasons: rules.reviewReasons,
        recommendedAssignment: recommendedSummary,
        messageForAgent: "No hay disponibilidad para esa hora. Puedo mirar otra hora.",
        blockingReason: "No hay una mesa clara disponible.",
      };
    }
    if (noTableFallback === "requires_human") {
      status = "requires_human";
      const reason = !recommendationIsAvailable
        ? "No hay recomendación clara de mesa."
        : "Recomendación de mesa con baja confianza.";
      if (!rules.reviewReasons.includes(reason)) rules.reviewReasons.push(reason);
    }
    // confirm_without_table → status confirmed, sin mesa.
  }

  // 6) Insertar reservation
  const internalNotesParts: string[] = [];
  if (willInsertTable) {
    internalNotesParts.push("Reserva creada por voz. Mesa asignada automáticamente.");
  } else {
    internalNotesParts.push("Reserva creada por voz.");
  }
  if (status === "requires_human" && rules.reviewReasons.length > 0) {
    internalNotesParts.push(
      `Requiere revisión: ${rules.reviewReasons.map((r) => r.replace(/\.$/, "")).join("; ")}.`,
    );
  }
  if (payload.callId) internalNotesParts.push(`Call ID: ${payload.callId}`);
  if (payload.transcript) internalNotesParts.push(`Transcript: ${payload.transcript.slice(0, 1000)}`);
  if (preferredZoneTextual) {
    internalNotesParts.push(`Preferencia de zona (texto): ${preferredZoneTextual}`);
  }

  let tableId: string | null = null;
  let tableIds: string[] = [];
  if (willInsertTable && recommendation.recommended.type === "individual_table") {
    tableId = recommendation.recommended.table.id;
    tableIds = [tableId];
  } else if (willInsertTable && recommendation.recommended.type === "table_combination") {
    tableIds = recommendation.recommended.combo.tables.map((t) => t.id);
    tableId = tableIds[0] ?? null;
  }

  const insertPayload = {
    restaurant_id: p.restaurantId,
    customer_name: p.customerName,
    customer_phone: p.phone ?? null,
    reservation_date: p.date,
    reservation_time: time,
    party_size: p.partySize,
    customer_notes: payload.notes ?? null,
    internal_notes: internalNotesParts.join("\n"),
    table_id: tableId,
    preferred_zone_id: preferredZoneId,
    status,
    channel: "future_voice" as const,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("reservations")
    .insert(insertPayload)
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return {
      success: false,
      status: "blocked",
      channel: "future_voice",
      reviewReasons: rules.reviewReasons,
      recommendedAssignment: recommendedSummary,
      messageForAgent: "No he podido guardar la reserva. Vuelve a intentarlo, por favor.",
      blockingReason: insertErr?.message ?? "insert_failed",
    };
  }
  const reservationId = inserted.id as string;

  if (tableIds.length > 0) {
    await supabase
      .from("reservation_tables")
      .insert(tableIds.map((tid) => ({ reservation_id: reservationId, table_id: tid })));
  }

  if (status === "requires_human") {
    await supabase.from("human_handoff_requests").insert({
      restaurant_id: p.restaurantId,
      reservation_id: reservationId,
      customer_name: p.customerName,
      customer_phone: p.phone ?? null,
      source_channel: "future_voice",
      reason: "voice_reservation_review",
      customer_message: rules.reviewReasons.join(" "),
      status: "pending",
    });
  }

  // 7) Construir respuesta
  const assignedTables: AssignedTable[] = willInsertTable
    ? recommendation.recommended.type === "individual_table"
      ? [
          {
            id: recommendation.recommended.table.id,
            label: recommendation.recommended.table.label,
            zoneName: recommendation.recommended.zone?.name ?? null,
          },
        ]
      : recommendation.recommended.type === "table_combination"
        ? recommendation.recommended.combo.tables.map((t) => ({
            id: t.id,
            label: t.label,
            zoneName: recommendation.recommended.type === "table_combination" ? (recommendation.recommended.combo.zone?.name ?? null) : null,
          }))
        : []
    : [];

  const dateLabel = formatDateEs(p.date);
  let messageForAgent: string;
  if (status === "requires_human") {
    messageForAgent = "He tomado nota de la solicitud. El restaurante la revisará y confirmará.";
  } else if (willInsertTable && preferredZoneId && recommendation.inPreferredZone) {
    const zone = recommendedSummary.zoneName ?? preferredZoneName ?? "la zona preferida";
    messageForAgent = `Reserva confirmada en ${zone} para ${personas(p.partySize)} el ${dateLabel} a las ${time}.`;
  } else {
    messageForAgent = `Reserva confirmada para ${personas(p.partySize)} el ${dateLabel} a las ${time}.`;
  }

  const response: VoiceReservationResponse = {
    success: true,
    reservationId,
    status,
    channel: "future_voice",
    assignedTables: assignedTables.length > 0 ? assignedTables : undefined,
    recommendedAssignment: recommendedSummary,
    messageForAgent,
    reviewReasons: rules.reviewReasons,
  };
  console.log("[create-voice-reservation] result", {
    callId: callId || null,
    reservationId,
    status,
    assignedTableIds: assignedTables.map((t) => t.id),
    reviewReasons: rules.reviewReasons,
    blockingReason: null,
  });
  return response;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedToken = Deno.env.get("RETELL_WEBHOOK_TOKEN");
  if (expectedToken) {
    const token = req.headers.get("x-webhook-token");
    if (token !== expectedToken) {
      return json({ error: "unauthorized" }, 401);
    }
  }

  let rawPayload: Record<string, unknown>;
  try {
    rawPayload = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const payload = normalizePayload(rawPayload);
  const receivedPayloadKeys = Object.keys(rawPayload);
  const env = Deno.env.get("ENV");
  const isDev = !env || env === "development" || env === "dev";

  try {
    const result = await handle(payload);
    if (isDev) {
      (result as any).debug = {
        receivedPayloadKeys,
        normalizedPayload: payload,
      };
    }
    if (result.status === "blocked" || (!result.success && !result.reservationId)) {
      console.log("[create-voice-reservation] blocked", {
        callId: payload.callId ?? null,
        status: result.status,
        blockingReason: result.blockingReason ?? null,
        reviewReasons: result.reviewReasons,
      });
    }
    return json(result, result.success ? 200 : 200);
  } catch (err) {
    const errorResponse: VoiceReservationResponse = {
      success: false,
      status: "requires_human",
      channel: "future_voice",
      reviewReasons: [],
      messageForAgent:
        "He tomado nota de la solicitud. El restaurante la revisará y confirmará.",
      blockingReason: String((err as Error)?.message ?? err),
    };
    if (isDev) {
      (errorResponse as any).debug = {
        receivedPayloadKeys,
        normalizedPayload: payload,
      };
    }
    return json(errorResponse, 500);
  }
});