import { describe, it, expect } from "vitest";
import { computeRecommendation } from "@/lib/getRecommendedTableAssignment";
import type { AvailableTableOptions } from "@/lib/getAvailableTableOptions";
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
});