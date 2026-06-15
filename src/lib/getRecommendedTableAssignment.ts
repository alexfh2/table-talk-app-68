import {
  getAvailableTableOptions,
  type AvailableCombination,
  type AvailableTableOptions,
} from "@/lib/getAvailableTableOptions";
import { supabase } from "@/integrations/supabase/client";
import type { RestaurantTable, TableCombination } from "@/lib/types";

export type RecommendedOptionType =
  | "individual_table"
  | "table_combination"
  | "none";

export interface ScoreBreakdown {
  total: number;
  waste: number;
  combinationBreakPenalty: number;
  alreadyBrokenCombinationBonus: number;
  highCombinabilityPenalty: number;
  preferredZonePenalty: number;
  typePenalty: number;
}

export interface RecommendedIndividual {
  type: "individual_table";
  table: RestaurantTable;
  waste: number;
  inPreferredZone: boolean;
  score?: ScoreBreakdown;
}

export interface RecommendedCombination {
  type: "table_combination";
  combination: AvailableCombination;
  waste: number;
  inPreferredZone: boolean;
  score?: ScoreBreakdown;
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
  debug?: {
    scored: Array<RecommendedIndividual | RecommendedCombination>;
    context: CombinationContext;
  };
}

/**
 * Context describing every active combination + which tables are
 * currently occupied, used to compute "preservation" penalties so we
 * avoid breaking large combos for small reservations.
 */
export interface CombinationContext {
  /** Active combinations with their member table ids. */
  combinations: Array<{
    id: string;
    tableIds: string[];
    max_capacity: number;
  }>;
  /** Set of table ids currently occupied at this slot. */
  occupiedTableIds: Set<string>;
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
  /** Optional pre-computed combination context (tests). */
  context?: CombinationContext;
  /** When true, includes scoring debug per option. */
  withDebug?: boolean;
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

  const context =
    opts.context ??
    (await loadCombinationContext(opts.restaurantId, available));

  return computeRecommendation(available, partySize, preferredZoneId, context, {
    withDebug: opts.withDebug,
  });
}

/** Loads all active combinations + occupancy for the slot. */
async function loadCombinationContext(
  restaurantId: string,
  available: AvailableTableOptions,
): Promise<CombinationContext> {
  const [{ data: combosData }, { data: comboTablesData }] = await Promise.all([
    supabase
      .from("table_combinations")
      .select("*")
      .eq("restaurant_id", restaurantId),
    supabase.from("table_combination_tables").select("*"),
  ]);
  const combos = ((combosData ?? []) as TableCombination[]).filter(
    (c) => c.is_active,
  );
  const byCombo = new Map<string, string[]>();
  for (const ct of (comboTablesData ?? []) as Array<{
    combination_id: string;
    table_id: string;
  }>) {
    const arr = byCombo.get(ct.combination_id) ?? [];
    arr.push(ct.table_id);
    byCombo.set(ct.combination_id, arr);
  }
  return {
    combinations: combos.map((c) => ({
      id: c.id,
      tableIds: byCombo.get(c.id) ?? [],
      max_capacity: c.max_capacity,
    })),
    occupiedTableIds: new Set(available.debug.occupiedTableIds),
  };
}

/** Pure scoring function — exported for testing. */
export function computeRecommendation(
  available: AvailableTableOptions,
  partySize: number,
  preferredZoneId: string | null,
  context: CombinationContext = { combinations: [], occupiedTableIds: new Set() },
  flags: { withDebug?: boolean } = {},
): RecommendedAssignment {
  // Pre-compute combination membership data per table.
  const combosByTable = new Map<string, typeof context.combinations>();
  for (const c of context.combinations) {
    for (const tid of c.tableIds) {
      const arr = combosByTable.get(tid) ?? [];
      arr.push(c);
      combosByTable.set(tid, arr);
    }
  }

  const indivs: RecommendedIndividual[] = available.individualTables.map((t) => {
    const waste = Math.max(0, t.max_capacity - partySize);
    const inPreferredZone = !!preferredZoneId && t.zone_id === preferredZoneId;
    const memberCombos = combosByTable.get(t.id) ?? [];

    let breaksFullyFree = 0;
    let belongsToBroken = false;
    for (const c of memberCombos) {
      const others = c.tableIds.filter((id) => id !== t.id);
      if (others.length === 0) continue;
      const anyOccupied = others.some((id) =>
        context.occupiedTableIds.has(id),
      );
      if (anyOccupied) belongsToBroken = true;
      else breaksFullyFree += 1;
    }

    const combinationBreakPenalty = breaksFullyFree * 2;
    const alreadyBrokenCombinationBonus = belongsToBroken ? -1.5 : 0;
    const highCombinabilityPenalty =
      memberCombos.length > 1 ? (memberCombos.length - 1) * 0.5 : 0;
    const preferredZonePenalty =
      preferredZoneId && !inPreferredZone ? 3 : 0;
    const typePenalty = 0;

    const total =
      waste +
      combinationBreakPenalty +
      alreadyBrokenCombinationBonus +
      highCombinabilityPenalty +
      preferredZonePenalty +
      typePenalty;

    return {
      type: "individual_table",
      table: t,
      waste,
      inPreferredZone,
      score: {
        total,
        waste,
        combinationBreakPenalty,
        alreadyBrokenCombinationBonus,
        highCombinabilityPenalty,
        preferredZonePenalty,
        typePenalty,
      },
    } satisfies RecommendedIndividual;
  });

  const combos: RecommendedCombination[] = available.combinations.map((c) => {
    const waste = Math.max(0, c.combination.max_capacity - partySize);
    const inPreferredZone =
      !!preferredZoneId && c.tables.every((t) => t.zone_id === preferredZoneId);
    const preferredZonePenalty =
      preferredZoneId && !inPreferredZone ? 3 : 0;
    // Slight tie-breaker preference for individual tables on equal waste.
    const typePenalty = 0.5;
    const total = waste + typePenalty + preferredZonePenalty;
    return {
      type: "table_combination",
      combination: c,
      waste,
      inPreferredZone,
      score: {
        total,
        waste,
        combinationBreakPenalty: 0,
        alreadyBrokenCombinationBonus: 0,
        highCombinabilityPenalty: 0,
        preferredZonePenalty,
        typePenalty,
      },
    } satisfies RecommendedCombination;
  });

  if (indivs.length === 0 && combos.length === 0) {
    return {
      recommendedOption: { type: "none" },
      alternativeOptions: [],
      reason: "No hay mesas disponibles para esta hora.",
      confidence: "low",
    };
  }

  const all = [...indivs, ...combos].sort(
    (a, b) => (a.score?.total ?? 0) - (b.score?.total ?? 0),
  );
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

  const result: RecommendedAssignment = {
    recommendedOption: recommended,
    alternativeOptions: alternatives,
    reason,
    confidence,
  };
  if (flags.withDebug) {
    result.debug = { scored: all, context };
  }
  // Strip score from non-debug callers' option objects to keep types clean.
  if (!flags.withDebug) {
    for (const o of all) delete (o as { score?: ScoreBreakdown }).score;
  }
  return result;
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