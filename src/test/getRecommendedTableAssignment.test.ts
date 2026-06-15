import { describe, it, expect } from "vitest";
import {
  computeRecommendation,
  type CombinationContext,
} from "@/lib/getRecommendedTableAssignment";
import type {
  AvailableTableOptions,
  AvailableCombination,
} from "@/lib/getAvailableTableOptions";
import type { RestaurantTable, TableCombination, Zone } from "@/lib/types";

function table(over: Partial<RestaurantTable> & { id: string; label: string; max_capacity: number; zone_id: string }): RestaurantTable {
  return {
    id: over.id,
    restaurant_id: "r",
    zone_id: over.zone_id,
    label: over.label,
    min_capacity: over.min_capacity ?? 1,
    max_capacity: over.max_capacity,
    is_active: true,
    internal_notes: null,
    sort_order: 0,
    visual_x: null,
    visual_y: null,
    visual_width: null,
    visual_height: null,
    visual_shape: "round",
    visual_rotation: 0,
    ...over,
  } as RestaurantTable;
}

const zoneA: Zone = { id: "zA", restaurant_id: "r", name: "Interior", sort_order: 0, is_active: true };
const zoneB: Zone = { id: "zB", restaurant_id: "r", name: "Terraza", sort_order: 1, is_active: true };

function options(partial: Partial<AvailableTableOptions>): AvailableTableOptions {
  return {
    individualTables: [],
    combinations: [],
    debug: {
      activeTables: 0,
      freeTables: 0,
      occupiedTableIds: [],
      candidatesIndividual: 0,
      candidatesCombinations: 0,
    },
    ...partial,
  };
}

function ctx(partial: Partial<CombinationContext> = {}): CombinationContext {
  return {
    combinations: [],
    occupiedTableIds: new Set(),
    ...partial,
  };
}

function combo(
  id: string,
  tables: RestaurantTable[],
  zone: Zone,
  maxCap: number,
  minCap = 2,
): AvailableCombination {
  const c: TableCombination = {
    id,
    restaurant_id: "r",
    zone_id: zone.id,
    name: tables.map((t) => t.label).join(" + "),
    min_capacity: minCap,
    max_capacity: maxCap,
    is_active: true,
    internal_notes: null,
  };
  return { combination: c, tables, zone };
}

describe("computeRecommendation", () => {
  it("returns none when no options", () => {
    const r = computeRecommendation(options({}), 2, null);
    expect(r.recommendedOption.type).toBe("none");
    expect(r.confidence).toBe("low");
  });

  it("prefers the tightest individual table", () => {
    const t2 = table({ id: "t2", label: "T2", max_capacity: 2, zone_id: zoneA.id });
    const t8 = table({ id: "t8", label: "T8", max_capacity: 8, zone_id: zoneA.id });
    const r = computeRecommendation(
      options({ individualTables: [t8, t2] }),
      2,
      null,
    );
    expect(r.recommendedOption.type).toBe("individual_table");
    if (r.recommendedOption.type === "individual_table") {
      expect(r.recommendedOption.table.id).toBe("t2");
    }
    expect(r.confidence).toBe("high");
  });

  it("prefers individual over combination on equal waste", () => {
    const t4 = table({ id: "t4", label: "T4", max_capacity: 4, zone_id: zoneA.id });
    const combo: TableCombination = {
      id: "c1", restaurant_id: "r", zone_id: zoneA.id, name: "T1+T2",
      min_capacity: 3, max_capacity: 4, is_active: true, internal_notes: null,
    };
    const r = computeRecommendation(
      options({
        individualTables: [t4],
        combinations: [{ combination: combo, tables: [t4, t4], zone: zoneA }],
      }),
      4,
      null,
    );
    expect(r.recommendedOption.type).toBe("individual_table");
  });

  it("uses combination when no individual fits", () => {
    const t1 = table({ id: "t1", label: "T1", max_capacity: 2, zone_id: zoneA.id });
    const t2 = table({ id: "t2", label: "T2", max_capacity: 2, zone_id: zoneA.id });
    const combo: TableCombination = {
      id: "c1", restaurant_id: "r", zone_id: zoneA.id, name: "T1+T2",
      min_capacity: 3, max_capacity: 4, is_active: true, internal_notes: null,
    };
    const r = computeRecommendation(
      options({ combinations: [{ combination: combo, tables: [t1, t2], zone: zoneA }] }),
      4,
      null,
    );
    expect(r.recommendedOption.type).toBe("table_combination");
    expect(r.confidence).toBe("high");
  });

  it("respects preferred zone but does not block other zones", () => {
    const tA = table({ id: "tA", label: "A1", max_capacity: 2, zone_id: zoneA.id });
    const tB = table({ id: "tB", label: "B1", max_capacity: 2, zone_id: zoneB.id });
    const r = computeRecommendation(
      options({ individualTables: [tA, tB] }),
      2,
      zoneB.id,
    );
    expect(r.recommendedOption.type).toBe("individual_table");
    if (r.recommendedOption.type === "individual_table") {
      expect(r.recommendedOption.table.id).toBe("tB");
    }
  });

  it("falls back outside preferred zone and lowers confidence", () => {
    const tA = table({ id: "tA", label: "A1", max_capacity: 2, zone_id: zoneA.id });
    const r = computeRecommendation(
      options({ individualTables: [tA] }),
      2,
      zoneB.id,
    );
    expect(r.recommendedOption.type).toBe("individual_table");
    expect(r.confidence).toBe("medium");
  });

  it("prefers a table that is already part of a broken combo over breaking a fresh one", () => {
    // M1+M2, M3+M4, M5+M6. M1 occupied → M1+M2 already broken.
    // Small reservation (2p) on tables of capacity 2.
    const m2 = table({ id: "m2", label: "M2", max_capacity: 2, zone_id: zoneA.id });
    const m3 = table({ id: "m3", label: "M3", max_capacity: 2, zone_id: zoneA.id });
    const m4 = table({ id: "m4", label: "M4", max_capacity: 2, zone_id: zoneA.id });
    const m5 = table({ id: "m5", label: "M5", max_capacity: 2, zone_id: zoneA.id });
    const m6 = table({ id: "m6", label: "M6", max_capacity: 2, zone_id: zoneA.id });
    const r = computeRecommendation(
      options({ individualTables: [m2, m3, m4, m5, m6] }),
      2,
      null,
      ctx({
        combinations: [
          { id: "c12", tableIds: ["m1", "m2"], max_capacity: 4 },
          { id: "c34", tableIds: ["m3", "m4"], max_capacity: 4 },
          { id: "c56", tableIds: ["m5", "m6"], max_capacity: 4 },
        ],
        occupiedTableIds: new Set(["m1"]),
      }),
    );
    expect(r.recommendedOption.type).toBe("individual_table");
    if (r.recommendedOption.type === "individual_table") {
      expect(r.recommendedOption.table.id).toBe("m2");
    }
  });

  it("with all combos free, picks any small table but penalizes equally", () => {
    // 3 small free tables each belonging to a free combo. Any pick breaks one combo.
    // We just check that a valid individual is recommended and not crashes.
    const m1 = table({ id: "m1", label: "M1", max_capacity: 2, zone_id: zoneA.id });
    const m3 = table({ id: "m3", label: "M3", max_capacity: 2, zone_id: zoneA.id });
    const r = computeRecommendation(
      options({ individualTables: [m1, m3] }),
      2,
      null,
      ctx({
        combinations: [
          { id: "c12", tableIds: ["m1", "m2"], max_capacity: 4 },
          { id: "c34", tableIds: ["m3", "m4"], max_capacity: 4 },
        ],
      }),
    );
    expect(r.recommendedOption.type).toBe("individual_table");
  });

  it("penalizes high-combinability tables vs equivalent less-strategic ones", () => {
    // tHub belongs to 3 combos. tSolo belongs to none. Equal capacity & waste.
    const tHub = table({ id: "tHub", label: "H", max_capacity: 2, zone_id: zoneA.id });
    const tSolo = table({ id: "tSolo", label: "S", max_capacity: 2, zone_id: zoneA.id });
    const r = computeRecommendation(
      options({ individualTables: [tHub, tSolo] }),
      2,
      null,
      ctx({
        combinations: [
          { id: "cA", tableIds: ["tHub", "x1"], max_capacity: 4 },
          { id: "cB", tableIds: ["tHub", "x2"], max_capacity: 4 },
          { id: "cC", tableIds: ["tHub", "x3"], max_capacity: 4 },
        ],
        // x1..x3 occupied so cA/cB/cC are already broken — eliminates break penalty
        // and isolates the high-combinability penalty.
        occupiedTableIds: new Set(["x1", "x2", "x3"]),
      }),
    );
    expect(r.recommendedOption.type).toBe("individual_table");
    if (r.recommendedOption.type === "individual_table") {
      expect(r.recommendedOption.table.id).toBe("tSolo");
    }
  });

  it("recommends a combination for a large party when it fits best", () => {
    const t2 = table({ id: "t2", label: "T2", max_capacity: 2, zone_id: zoneA.id });
    const t1 = table({ id: "t1", label: "T1", max_capacity: 2, zone_id: zoneA.id });
    const c = combo("c1", [t1, t2], zoneA, 4, 3);
    const r = computeRecommendation(
      options({ individualTables: [], combinations: [c] }),
      4,
      null,
    );
    expect(r.recommendedOption.type).toBe("table_combination");
  });

  it("includes debug breakdown when requested", () => {
    const t = table({ id: "t", label: "T", max_capacity: 2, zone_id: zoneA.id });
    const r = computeRecommendation(
      options({ individualTables: [t] }),
      2,
      null,
      ctx(),
      { withDebug: true },
    );
    expect(r.debug).toBeTruthy();
    expect(r.debug!.scored[0].score).toBeTruthy();
  });
});