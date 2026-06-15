import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Loader2,
  List,
  LayoutGrid,
  Wine,
  DoorOpen,
  ChefHat,
  Bath,
  Bell,
  Square as SquareIcon,
  Shapes,
  Sparkles,
} from "lucide-react";
import {
  getAvailableTableOptions,
  type AvailableTableOptions,
} from "@/lib/getAvailableTableOptions";
import {
  computeRecommendation,
  type RecommendedAssignment,
} from "@/lib/getRecommendedTableAssignment";
import { supabase } from "@/integrations/supabase/client";
import type {
  RestaurantTable,
  Zone,
  TableCombination,
  ZoneElement,
  ZoneElementType,
} from "@/lib/types";
import { ZONE_ELEMENT_LABELS } from "@/lib/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type TableSelection =
  | { kind: "none" }
  | { kind: "table"; tableId: string }
  | { kind: "combo"; combinationId: string; tableIds: string[] };

function selectionKey(s: TableSelection): string {
  if (s.kind === "none") return "none";
  if (s.kind === "table") return `t:${s.tableId}`;
  return `c:${s.combinationId}`;
}

/**
 * Reusable table assignment picker. Loads available individual tables and
 * combinations for the supplied slot, and exposes the selection as a
 * `TableSelection` value.
 *
 * Pass `currentSelection` so that, in edit mode, the existing assignment
 * stays visible even if it is no longer "available" for the new slot.
 */
export function TableAssignmentPicker({
  restaurantId,
  date,
  time,
  partySize,
  excludeReservationId,
  value,
  onChange,
  /** Used to render and keep the current assignment visible in edit mode. */
  currentAssignmentLabel,
  preferredZoneId,
}: {
  restaurantId: string;
  date: string | undefined;
  time: string | undefined;
  partySize: number;
  excludeReservationId?: string;
  value: TableSelection;
  onChange: (s: TableSelection) => void;
  currentAssignmentLabel?: string | null;
  preferredZoneId?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AvailableTableOptions | null>(null);
  const [view, setView] = useState<"list" | "plan">("list");

  const ready = !!(restaurantId && date && time && partySize > 0);

  useEffect(() => {
    if (!ready) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getAvailableTableOptions({
      restaurantId,
      date: date!,
      time: time!,
      partySize,
      excludeReservationId,
    })
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, restaurantId, date, time, partySize, excludeReservationId]);

  const currentStillAvailable = useMemo(() => {
    if (!result || value.kind === "none") return true;
    if (value.kind === "table") return result.individualTables.some((t) => t.id === value.tableId);
    return result.combinations.some((c) => c.combination.id === value.combinationId);
  }, [result, value]);

  const recommendation: RecommendedAssignment | null = useMemo(() => {
    if (!result) return null;
    return computeRecommendation(result, partySize, preferredZoneId ?? null);
  }, [result, partySize, preferredZoneId]);

  if (!ready) {
    return (
      <p className="text-xs text-muted-foreground">
        Introduce fecha, hora y número de personas para ver mesas disponibles.
      </p>
    );
  }

  const selectedKey = selectionKey(value);
  const hasOptions =
    !!result && (result.individualTables.length > 0 || result.combinations.length > 0);

  const recommendedKey = recommendationSelectionKey(recommendation);
  const matchesRecommendation =
    recommendedKey !== null && recommendedKey === selectedKey;

  const applyRecommendation = () => {
    if (!recommendation) return;
    const opt = recommendation.recommendedOption;
    if (opt.type === "individual_table") {
      onChange({ kind: "table", tableId: opt.table.id });
    } else if (opt.type === "table_combination") {
      onChange({
        kind: "combo",
        combinationId: opt.combination.combination.id,
        tableIds: opt.combination.tables.map((t) => t.id),
      });
    }
  };

  return (
    <div className="space-y-3">
      {recommendation && (
        <RecommendationCard
          recommendation={recommendation}
          matchesSelection={matchesRecommendation}
          onApply={applyRecommendation}
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setView("list")}
            className={[
              "px-2.5 py-1 text-xs inline-flex items-center gap-1.5 transition-colors",
              view === "list" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
            ].join(" ")}
          >
            <List className="h-3.5 w-3.5" /> Lista
          </button>
          <button
            type="button"
            onClick={() => setView("plan")}
            className={[
              "px-2.5 py-1 text-xs inline-flex items-center gap-1.5 transition-colors border-l border-border",
              view === "plan" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
            ].join(" ")}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Plano
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando mesas…
        </p>
      )}

      {!currentStillAvailable && value.kind !== "none" && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            La asignación actual{currentAssignmentLabel ? ` (${currentAssignmentLabel})` : ""} puede
            no estar disponible para esta nueva hora.
          </span>
        </div>
      )}

      {view === "plan" && (
        <FloorPlanPicker
          restaurantId={restaurantId}
          result={result}
          partySize={partySize}
          value={value}
          onChange={onChange}
        />
      )}

      {view === "list" && result && result.individualTables.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Mesas individuales
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {result.individualTables.map((t) => {
              const key = `t:${t.id}`;
              const selected = selectedKey === key;
              return (
                <OptionCard
                  key={t.id}
                  selected={selected}
                  onClick={() => onChange({ kind: "table", tableId: t.id })}
                  title={t.label}
                  subtitle={`${t.min_capacity}–${t.max_capacity} personas`}
                />
              );
            })}
          </div>
        </div>
      )}

      {view === "list" && result && result.combinations.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Mesas unidas
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {result.combinations.map((c) => {
              const key = `c:${c.combination.id}`;
              const selected = selectedKey === key;
              const tablesLabel = c.tables.map((t) => t.label).join(" + ");
              const zoneLabel = c.zone ? c.zone.name : "";
              const cap = `${c.combination.min_capacity ?? 1}–${c.combination.max_capacity} personas`;
              return (
                <OptionCard
                  key={c.combination.id}
                  selected={selected}
                  onClick={() =>
                    onChange({
                      kind: "combo",
                      combinationId: c.combination.id,
                      tableIds: c.tables.map((t) => t.id),
                    })
                  }
                  title={tablesLabel}
                  subtitle={[zoneLabel, cap].filter(Boolean).join(" · ")}
                />
              );
            })}
          </div>
        </div>
      )}

      {view === "list" && result && !hasOptions && (
        <p className="text-xs text-terracotta">
          No hay mesas disponibles para esta hora.
        </p>
      )}

      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sin asignar
        </p>
        <OptionCard
          selected={selectedKey === "none"}
          onClick={() => onChange({ kind: "none" })}
          title="Decidir más tarde"
          subtitle={hasOptions ? "Guardar sin mesa" : "Guardar sin mesa"}
        />
      </div>
    </div>
  );
}

function OptionCard({
  selected,
  onClick,
  title,
  subtitle,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "text-left rounded-xl border px-3 py-2 transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
          : "border-border bg-background hover:bg-secondary/50",
      ].join(" ")}
    >
      <div className="text-sm font-medium text-foreground">{title}</div>
      {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
    </button>
  );
}

function recommendationSelectionKey(
  rec: RecommendedAssignment | null,
): string | null {
  if (!rec) return null;
  const opt = rec.recommendedOption;
  if (opt.type === "individual_table") return `t:${opt.table.id}`;
  if (opt.type === "table_combination")
    return `c:${opt.combination.combination.id}`;
  return null;
}

function RecommendationCard({
  recommendation,
  matchesSelection,
  onApply,
}: {
  recommendation: RecommendedAssignment;
  matchesSelection: boolean;
  onApply: () => void;
}) {
  const opt = recommendation.recommendedOption;
  const none = opt.type === "none";

  let title = "";
  let subtitle = "";
  if (opt.type === "individual_table") {
    const t = opt.table;
    title = t.label;
    subtitle = `${t.min_capacity}–${t.max_capacity} personas`;
  } else if (opt.type === "table_combination") {
    const c = opt.combination;
    const labels = c.tables.map((tt) => tt.label).join(" + ");
    const zone = c.zone?.name;
    title = labels;
    subtitle = [
      zone,
      `${c.combination.min_capacity ?? 1}–${c.combination.max_capacity} personas`,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return (
    <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            Recomendado
          </div>
          {none ? (
            <p className="mt-1 text-sm text-foreground">
              No hay una mesa recomendada para esta hora.
            </p>
          ) : (
            <>
              <div className="mt-0.5 text-sm font-medium text-foreground truncate">
                {title}
              </div>
              {subtitle && (
                <div className="text-xs text-muted-foreground truncate">
                  {subtitle}
                </div>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {recommendation.reason}
              </p>
            </>
          )}
        </div>
        {!none && (
          <button
            type="button"
            onClick={onApply}
            disabled={matchesSelection}
            className={[
              "shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              matchesSelection
                ? "border-border bg-muted text-muted-foreground cursor-default"
                : "border-primary/40 bg-background text-primary hover:bg-primary/5",
            ].join(" ")}
          >
            {matchesSelection ? "Aplicada" : "Usar recomendación"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Build the initial selection from existing reservation data. */
export function selectionFromExisting(opts: {
  tableIds: string[]; // from reservation_tables, primary
  fallbackTableId: string | null;
}): TableSelection {
  const ids = opts.tableIds.length > 0
    ? opts.tableIds
    : (opts.fallbackTableId ? [opts.fallbackTableId] : []);
  if (ids.length === 0) return { kind: "none" };
  if (ids.length === 1) return { kind: "table", tableId: ids[0] };
  // Multi-table without a matching combination row; we represent it as a synthetic combo selection.
  return { kind: "combo", combinationId: `manual:${ids.join("+")}`, tableIds: ids };
}

/** Resolve a selection into the data needed to persist a reservation. */
export function persistFromSelection(selection: TableSelection): {
  tableId: string | null;
  tableIds: string[];
} {
  if (selection.kind === "none") return { tableId: null, tableIds: [] };
  if (selection.kind === "table") return { tableId: selection.tableId, tableIds: [selection.tableId] };
  const first = selection.tableIds[0] ?? null;
  return { tableId: first, tableIds: selection.tableIds };
}

const DEFAULT_BY_SHAPE: Record<string, { w: number; h: number }> = {
  round: { w: 11, h: 16 },
  square: { w: 11, h: 16 },
  rectangle: { w: 18, h: 11 },
};

const ELEMENT_ICONS: Record<ZoneElementType, React.ComponentType<{ className?: string }>> = {
  bar: Wine,
  door: DoorOpen,
  kitchen: ChefHat,
  bathroom: Bath,
  reception: Bell,
  column: SquareIcon,
  custom: Shapes,
};

function FloorPlanPicker({
  restaurantId,
  result,
  partySize,
  value,
  onChange,
}: {
  restaurantId: string;
  result: AvailableTableOptions | null;
  partySize: number;
  value: TableSelection;
  onChange: (s: TableSelection) => void;
}) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [elements, setElements] = useState<ZoneElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [popoverFor, setPopoverFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.from("restaurant_zones").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
      supabase.from("restaurant_tables").select("*").eq("restaurant_id", restaurantId),
      supabase.from("restaurant_zone_elements").select("*").eq("restaurant_id", restaurantId),
    ]).then(([z, t, e]) => {
      if (cancelled) return;
      setZones(((z.data ?? []) as Zone[]).filter((zz) => zz.is_active));
      setTables((t.data ?? []) as RestaurantTable[]);
      setElements(((e.data ?? []) as unknown as ZoneElement[]).filter((el) => el.is_visible));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const availableIndividualIds = useMemo(
    () => new Set((result?.individualTables ?? []).map((t) => t.id)),
    [result],
  );
  const occupiedIds = useMemo(
    () => new Set(result?.debug.occupiedTableIds ?? []),
    [result],
  );

  /** Combinations available for this slot grouped per member table. */
  const combosByTable = useMemo(() => {
    const map = new Map<string, Array<{ comboId: string; tableIds: string[]; label: string; cap: string }>>();
    for (const c of result?.combinations ?? []) {
      const ids = c.tables.map((t) => t.id);
      const entry = {
        comboId: c.combination.id,
        tableIds: ids,
        label: c.tables.map((t) => t.label).join(" + "),
        cap: `${c.combination.min_capacity ?? 1}–${c.combination.max_capacity} personas`,
      };
      for (const id of ids) {
        const arr = map.get(id) ?? [];
        arr.push(entry);
        map.set(id, arr);
      }
    }
    return map;
  }, [result]);

  const selectedTableIds = useMemo(() => {
    if (value.kind === "table") return new Set([value.tableId]);
    if (value.kind === "combo") return new Set(value.tableIds);
    return new Set<string>();
  }, [value]);

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando plano…
      </p>
    );
  }

  const zonesToShow = zones.filter((z) => tables.some((t) => t.zone_id === z.id));
  if (zonesToShow.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No hay zonas configuradas.</p>;
  }

  return (
    <div className="space-y-4">
      {zonesToShow.map((zone) => {
        const zTables = tables.filter((t) => t.zone_id === zone.id);
        return (
          <div key={zone.id} className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {zone.name}
            </p>
            <div
              className="relative w-full rounded-2xl border border-border bg-[hsl(var(--secondary))] overflow-hidden"
              style={{
                aspectRatio: "16 / 10",
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, hsl(var(--muted-foreground) / 0.18) 1px, transparent 0)",
                backgroundSize: "22px 22px",
              }}
            >
              {elements
                .filter((el) => el.zone_id === zone.id)
                .map((el) => {
                  const radius =
                    el.shape === "circle"
                      ? "9999px"
                      : el.shape === "square"
                      ? "6px"
                      : "4px";
                  const Icon = ELEMENT_ICONS[el.element_type];
                  return (
                    <div
                      key={el.id}
                      aria-hidden
                      className="absolute flex items-center justify-center gap-1.5 border border-dashed border-muted-foreground/40 bg-muted/40 text-muted-foreground pointer-events-none"
                      style={{
                        left: `${el.visual_x}%`,
                        top: `${el.visual_y}%`,
                        width: `${el.visual_width}%`,
                        height: `${el.visual_height}%`,
                        minWidth: 32,
                        minHeight: 24,
                        borderRadius: radius,
                        transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
                        zIndex: 0,
                      }}
                    >
                      <Icon className="h-3 w-3 shrink-0" />
                      <span className="text-[10px] font-medium uppercase tracking-wide truncate px-1">
                        {el.label || ZONE_ELEMENT_LABELS[el.element_type]}
                      </span>
                    </div>
                  );
                })}

              {zTables.map((t, idx) => {
                const shape = (t.visual_shape ?? "round") as "round" | "square" | "rectangle";
                const def = DEFAULT_BY_SHAPE[shape];
                const w = Number(t.visual_width ?? def.w);
                const h = Number(t.visual_height ?? def.h);
                const x = t.visual_x != null ? Number(t.visual_x) : 15 + (idx % 5) * 17;
                const y = t.visual_y != null ? Number(t.visual_y) : 20 + Math.floor(idx / 5) * 30;
                const rot = Number(t.visual_rotation ?? 0);
                const radius =
                  shape === "round" ? "9999px" : shape === "square" ? "10px" : "8px";

                const inactive = !t.is_active;
                const occupied = occupiedIds.has(t.id);
                const isAvailable = availableIndividualIds.has(t.id);
                const tCombos = combosByTable.get(t.id) ?? [];
                const isSelected = selectedTableIds.has(t.id);
                const fitsCapacity =
                  partySize >= t.min_capacity && partySize <= t.max_capacity;
                const isPartOfAvailableCombo = tCombos.length > 0;
                const clickable = !inactive && !occupied && (isAvailable || isPartOfAvailableCombo);

                // Color state
                let stateClass = "";
                if (isSelected) {
                  stateClass = "border-primary bg-primary/15 ring-2 ring-primary/40 text-primary";
                } else if (inactive) {
                  stateClass = "border-dashed border-border bg-muted/40 text-muted-foreground opacity-60";
                } else if (occupied) {
                  stateClass = "border-terracotta/40 bg-terracotta/10 text-terracotta";
                } else if (isAvailable) {
                  stateClass = "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:border-primary";
                } else if (isPartOfAvailableCombo) {
                  stateClass = "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:border-primary";
                } else if (!fitsCapacity) {
                  stateClass = "border-border bg-card text-muted-foreground opacity-70";
                } else {
                  stateClass = "border-border bg-card text-muted-foreground";
                }

                const buttonContent = (
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!clickable) return;
                      if (tCombos.length > 0) {
                        // open popover to choose individual vs combo(s)
                        setPopoverFor(t.id);
                      } else if (isAvailable) {
                        onChange({ kind: "table", tableId: t.id });
                      }
                    }}
                    className={[
                      "absolute flex flex-col items-center justify-center text-center select-none transition-colors border",
                      clickable ? "cursor-pointer" : "cursor-not-allowed",
                      stateClass,
                    ].join(" ")}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      width: `${w}%`,
                      height: `${h}%`,
                      minWidth: 44,
                      minHeight: 44,
                      borderRadius: radius,
                      transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                    }}
                    aria-label={`Mesa ${t.label}`}
                  >
                    <span className="text-sm font-semibold leading-none">{t.label}</span>
                    <span className="text-[10px] mt-0.5 opacity-80">
                      {t.min_capacity}–{t.max_capacity}
                    </span>
                  </button>
                );

                if (tCombos.length === 0) return <div key={t.id}>{buttonContent}</div>;

                return (
                  <Popover
                    key={t.id}
                    open={popoverFor === t.id}
                    onOpenChange={(o) => setPopoverFor(o ? t.id : null)}
                  >
                    <PopoverTrigger asChild>{buttonContent}</PopoverTrigger>
                    <PopoverContent className="w-64 p-2 space-y-1" align="center">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground px-2 pt-1">
                        Opciones para {t.label}
                      </p>
                      {isAvailable && (
                        <button
                          type="button"
                          onClick={() => {
                            onChange({ kind: "table", tableId: t.id });
                            setPopoverFor(null);
                          }}
                          className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                        >
                          <div className="font-medium">Solo {t.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {t.min_capacity}–{t.max_capacity} personas
                          </div>
                        </button>
                      )}
                      {tCombos.map((c) => (
                        <button
                          key={c.comboId}
                          type="button"
                          onClick={() => {
                            onChange({
                              kind: "combo",
                              combinationId: c.comboId,
                              tableIds: c.tableIds,
                            });
                            setPopoverFor(null);
                          }}
                          className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                        >
                          <div className="font-medium">Usar {c.label}</div>
                          <div className="text-xs text-muted-foreground">{c.cap}</div>
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <LegendDot className="bg-emerald-500/60" label="Disponible" />
        <LegendDot className="bg-amber-500/60" label="Disponible unida" />
        <LegendDot className="bg-terracotta/60" label="Ocupada" />
        <LegendDot className="bg-muted-foreground/40" label="No válida / inactiva" />
        <LegendDot className="bg-primary" label="Seleccionada" />
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={["inline-block h-2.5 w-2.5 rounded-full", className].join(" ")} />
      {label}
    </span>
  );
}