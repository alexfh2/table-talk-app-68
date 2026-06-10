import type { AgentSettings, Reservation } from "./types";

export interface RulesInput {
  customer_name?: string | null;
  customer_phone?: string | null;
  reservation_date?: string | null;
  reservation_time?: string | null;
  party_size?: number | null;
  id?: string | null;
}

export interface AvailabilityInfo {
  outOfService: boolean;
  free: number | null;
  capacity: number | null;
  service: "lunch" | "dinner" | null;
}

export interface RulesEvaluation {
  canSave: boolean;
  suggestedStatus: "confirmed" | "requires_human" | "pending" | null;
  blockingReason: string | null;
  reviewReasons: string[];
  warnings: string[];
  servicePeriod: "lunch" | "dinner" | null;
  availableSeats: number | null;
}

const DEFAULTS = {
  max_party_size_auto: 8,
  low_capacity_threshold: 4,
  require_phone_for_auto_confirm: false,
};

export function evaluateReservationRules(
  input: RulesInput,
  settings: AgentSettings | null,
  availability: AvailabilityInfo | null,
  sameDayReservations: Pick<Reservation, "id" | "customer_name" | "reservation_time">[] = [],
): RulesEvaluation {
  const reviewReasons: string[] = [];
  const warnings: string[] = [];
  const maxAuto = settings?.max_party_size_auto ?? DEFAULTS.max_party_size_auto;
  const lowThreshold = settings?.slot_almost_full_threshold ?? DEFAULTS.low_capacity_threshold;
  const requirePhone = settings?.missing_phone_policy === "requires_review";

  // Blocking
  if (!input.customer_name || !input.customer_name.trim()) {
    return blocked("Introduce el nombre del cliente.", availability);
  }
  const party = Number(input.party_size ?? 0);
  if (!party || party < 1) {
    return blocked("Indica el número de personas.", availability);
  }
  if (!input.reservation_date || !input.reservation_time) {
    return blocked("Selecciona fecha y hora.", availability);
  }
  if (availability?.outOfService) {
    return blocked("No hay servicio configurado para esta hora.", availability);
  }
  if (availability && availability.free != null && party > availability.free) {
    return blocked("Esta franja no tiene plazas suficientes.", availability);
  }

  // Review reasons
  if (party > maxAuto) {
    reviewReasons.push("Reserva grande: supera el límite de confirmación automática.");
  }
  const phoneMissing = !input.customer_phone || input.customer_phone.trim().length < 6;
  if (phoneMissing && requirePhone) {
    reviewReasons.push("Falta teléfono.");
  }
  // Duplicate detection: same customer name + time on the same date
  const name = input.customer_name.trim().toLowerCase();
  const time = (input.reservation_time ?? "").slice(0, 5);
  const dup = sameDayReservations.some((r) => {
    if (input.id && r.id === input.id) return false;
    return (
      (r.customer_name ?? "").trim().toLowerCase() === name &&
      (r.reservation_time ?? "").slice(0, 5) === time
    );
  });
  if (dup) reviewReasons.push("Posible duplicado.");

  // Warnings (non-blocking)
  if (availability && availability.free != null && availability.free > 0 && availability.free - party <= lowThreshold) {
    warnings.push("Quedan pocas plazas en esta franja.");
  }

  const suggested = reviewReasons.length > 0 ? "requires_human" : "confirmed";
  return {
    canSave: true,
    suggestedStatus: suggested,
    blockingReason: null,
    reviewReasons,
    warnings,
    servicePeriod: availability?.service ?? null,
    availableSeats: availability?.free ?? null,
  };
}

function blocked(reason: string, availability: AvailabilityInfo | null): RulesEvaluation {
  return {
    canSave: false,
    suggestedStatus: null,
    blockingReason: reason,
    reviewReasons: [],
    warnings: [],
    servicePeriod: availability?.service ?? null,
    availableSeats: availability?.free ?? null,
  };
}

export function appendReviewReasonsToNotes(existing: string | null | undefined, reasons: string[]): string {
  if (reasons.length === 0) return existing ?? "";
  const line = `Requiere revisión: ${reasons.map((r) => r.replace(/\.$/, "")).join("; ")}.`;
  const base = (existing ?? "").trim();
  return base ? `${base}\n${line}` : line;
}

/** Extract review reasons previously appended to internal_notes by appendReviewReasonsToNotes. */
export function parseReviewReasonsFromNotes(notes: string | null | undefined): string[] {
  if (!notes) return [];
  const out: string[] = [];
  for (const line of notes.split(/\r?\n/)) {
    const m = line.match(/^Requiere revisión:\s*(.+?)\.?\s*$/i);
    if (m) {
      m[1].split(";").map((s) => s.trim()).filter(Boolean).forEach((r) => out.push(r.endsWith(".") ? r : r + "."));
    }
  }
  return out;
}