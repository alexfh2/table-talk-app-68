import {
  getAvailableTableOptions,
  type AvailableCombination,
  type AvailableTableOptions,
} from "@/lib/getAvailableTableOptions";
import type { RestaurantTable } from "@/lib/types";

export type RecommendedOptionType =
  | "individual_table"
  | "table_combination"
  | "none";

export interface RecommendedIndividual {
  type: "individual_table";
  table: RestaurantTable;
  waste: number;
  inPreferredZone: boolean;
}

export interface RecommendedCombination {
  type: "table_combination";
  combination: AvailableCombination;
  waste: number;
  inPreferredZone: boolean;
}

export interface RecommendedNone {
  type: "none";
}

export type RecommendedOption =
  | RecommendedIndividual
  | RecommendedCombination
  | RecommendedNone;

export interface RecommendedAssignment {
  recommendedOption: RecommendedOption;
  alternativeOptions: Array<RecommendedIndividual | RecommendedCombination>;
  reason: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Recommends the best table or combination for a reservation without
 * applying any changes. Pure suggestion layer on top of
 * `getAvailableTableOptions`.
 */
export async function getRecommendedTableAssignment(opts: {
  restaurantId: string;
  date: string;
  time: string;
  partySize: number;
  preferredZoneId?: string | null;
  excludeReservationId?: string;
  slotMinutes?: number;
  /** Optional injection of pre-computed options (tests / shared calls). */
  options?: AvailableTableOptions;
}): Promise<RecommendedAssignment> {
  const partySize = opts.partySize;
  const preferredZoneId = opts.preferredZoneId ?? null;

  const available =
    opts.options ??
    (await getAvailableTableOptions({
      restaurantId: opts.restaurantId,
      date: opts.date,
      time: opts.time,
      partySize,
      excludeReservationId: opts.excludeReservationId,
      slotMinutes: opts.slotMinutes,
    }));

  return computeRecommendation(available, partySize, preferredZoneId);
}

/** Pure scoring function — exported for testing. */
export function computeRecommendation(
  available: AvailableTableOptions,
  partySize: number,
  preferredZoneId: string | null,
): RecommendedAssignment {
  const indivs: RecommendedIndividual[] = available.individualTables.map((t) => ({
    type: "individual_table",
    table: t,
    waste: Math.max(0, t.max_capacity - partySize),
    inPreferredZone: !!preferredZoneId && t.zone_id === preferredZoneId,
  }));

  const combos: RecommendedCombination[] = available.combinations.map((c) => ({
    type: "table_combination",
    combination: c,
    waste: Math.max(0, c.combination.max_capacity - partySize),
    inPreferredZone:
      !!preferredZoneId && c.tables.every((t) => t.zone_id === preferredZoneId),
  }));

  if (indivs.length === 0 && combos.length === 0) {
    return {
      recommendedOption: { type: "none" },
      alternativeOptions: [],
      reason: "No hay mesas disponibles para esta hora.",
      confidence: "low",
    };
  }

  // Score: lower is better.
  // Individual tables get a bonus over combinations of equal waste so we
  // prefer single tables when they fit similarly.
  const score = (o: RecommendedIndividual | RecommendedCombination) => {
    const zonePenalty = preferredZoneId && !o.inPreferredZone ? 100 : 0;
    const typePenalty = o.type === "table_combination" ? 0.5 : 0;
    return o.waste + typePenalty + zonePenalty;
  };

  const all = [...indivs, ...combos].sort((a, b) => score(a) - score(b));
  const recommended = all[0];
  const alternatives = all.slice(1, 4);

  // Confidence:
  // - high: waste <= 1 and individual table (or perfect-fit combination).
  // - medium: waste <= 3.
  // - low: anything else.
  let confidence: "high" | "medium" | "low";
  if (recommended.waste === 0) confidence = "high";
  else if (recommended.waste <= 1 && recommended.type === "individual_table")
    confidence = "high";
  else if (recommended.waste <= 3) confidence = "medium";
  else confidence = "low";

  // If preferred zone requested but recommendation is outside it, lower confidence.
  if (preferredZoneId && !recommended.inPreferredZone) {
    confidence = confidence === "high" ? "medium" : "low";
  }

  const reason = buildReason(recommended, partySize, preferredZoneId);

  return {
    recommendedOption: recommended,
    alternativeOptions: alternatives,
    reason,
    confidence,
  };
}

function buildReason(
  o: RecommendedIndividual | RecommendedCombination,
  partySize: number,
  preferredZoneId: string | null,
): string {
  const personas = `${partySize} ${partySize === 1 ? "persona" : "personas"}`;
  if (o.type === "individual_table") {
    const cap = o.table.max_capacity;
    if (o.waste === 0)
      return `Mesa ${o.table.label} encaja exacta para ${personas}.`;
    if (o.waste <= 1)
      return `Mesa ${o.table.label} (hasta ${cap}) es la más ajustada para ${personas}.`;
    const zoneNote =
      preferredZoneId && !o.inPreferredZone
        ? " Fuera de la zona preferida."
        : "";
    return `Mesa ${o.table.label} disponible para ${personas} (capacidad ${cap}).${zoneNote}`;
  }
  const labels = o.combination.tables.map((t) => t.label).join(" + ");
  if (o.waste === 0)
    return `Combinación ${labels} encaja exacta para ${personas}.`;
  return `Combinación ${labels} (hasta ${o.combination.combination.max_capacity}) recomendada para ${personas}.`;
}