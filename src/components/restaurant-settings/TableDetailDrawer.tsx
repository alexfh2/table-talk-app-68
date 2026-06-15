import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { RestaurantTable, Zone, TableCombination } from "@/lib/types";
import { Link2, Plus, X, RotateCw, Minus, Plus as PlusIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ComboRow = {
  combination: TableCombination;
  tableIds: string[];
};

type Shape = "round" | "square" | "rectangle";

const SIZE_PRESETS: Record<Shape, { sm: number; md: number; lg: number }> = {
  round: { sm: 8, md: 11, lg: 15 },
  square: { sm: 8, md: 11, lg: 15 },
  rectangle: { sm: 14, md: 18, lg: 24 },
};

function heightFor(shape: Shape, width: number) {
  if (shape === "rectangle") return Math.max(6, Math.round(width * 0.6));
  return Math.round(width * 1.45);
}

function sizeLabel(shape: Shape, width: number): "sm" | "md" | "lg" {
  const p = SIZE_PRESETS[shape];
  const distances: Array<["sm" | "md" | "lg", number]> = [
    ["sm", Math.abs(width - p.sm)],
    ["md", Math.abs(width - p.md)],
    ["lg", Math.abs(width - p.lg)],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0][0];
}

export function TableDetailDrawer({
  open,
  onOpenChange,
  table,
  zone,
  tables,
  combos,
  onEditCombo,
  onCreateComboWithTable,
  onUpdateVisual,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  table: RestaurantTable | null;
  zone: Zone | null;
  tables: RestaurantTable[];
  combos: ComboRow[];
  onEditCombo: (c: ComboRow) => void;
  onCreateComboWithTable: (t: RestaurantTable) => void;
  onUpdateVisual?: (id: string, patch: Partial<RestaurantTable>) => void;
}) {
  const [saving, setSaving] = useState(false);

  if (!table) return null;

  const shape = (table.visual_shape as Shape) ?? "round";
  const currentSize = sizeLabel(shape, table.visual_width ?? SIZE_PRESETS[shape].md);
  const presets = SIZE_PRESETS[shape];

  const applySize = (key: "sm" | "md" | "lg") => {
    const w = presets[key];
    onUpdateVisual?.(table.id, {
      visual_shape: shape,
      visual_width: w,
      visual_height: heightFor(shape, w),
    });
  };

  const nudge = (delta: number) => {
    const w = Math.min(30, Math.max(6, (table.visual_width ?? presets.md) + delta));
    onUpdateVisual?.(table.id, {
      visual_shape: shape,
      visual_width: w,
      visual_height: heightFor(shape, w),
    });
  };

  const rotateBy = (delta: number) => {
    if (shape !== "rectangle") return;
    const r = (((table.visual_rotation ?? 0) + delta) % 360 + 360) % 360;
    onUpdateVisual?.(table.id, { visual_rotation: r });
  };

  const tableById = new Map(tables.map((t) => [t.id, t]));
  const myCombos = combos.filter((c) => c.tableIds.includes(table.id));

  const radius =
    shape === "round" ? "9999px" : shape === "square" ? "10px" : "8px";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:min-w-[420px] sm:max-w-[460px] bg-card p-0 flex flex-col gap-0">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-6 py-4">
          <div>
            <h2 className="text-2xl tracking-tight leading-tight">Mesa {table.label}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {(zone?.name ? `${zone.name} · ` : "")}{table.min_capacity}–{table.max_capacity} personas
              {!table.is_active && " · Inactiva"}
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {table.internal_notes && (
            <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm text-muted-foreground">
              {table.internal_notes}
            </div>
          )}

          {/* Visual preview */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Apariencia en el plano
            </h3>
            <div className="flex items-center gap-4">
              <div
                className="shrink-0 border bg-card flex items-center justify-center"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: radius,
                  transform: `rotate(${shape === "rectangle" ? (table.visual_rotation ?? 0) : 0}deg)`,
                }}
              >
                <span className="text-xs font-medium">{table.label}</span>
              </div>
              <div className="flex-1 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Forma</label>
                  <Select
                    value={shape}
                    onValueChange={(v) => {
                      const next = v as Shape;
                      const w = SIZE_PRESETS[next][currentSize];
                      onUpdateVisual?.(table.id, {
                        visual_shape: next,
                        visual_width: w,
                        visual_height: heightFor(next, w),
                        visual_rotation: next === "rectangle" ? (table.visual_rotation ?? 0) : 0,
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="round">Redonda</SelectItem>
                      <SelectItem value="square">Cuadrada</SelectItem>
                      <SelectItem value="rectangle">Rectangular</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Tamaño</label>
                  <div className="flex items-center gap-1">
                    <div className="inline-flex rounded-md border border-border overflow-hidden">
                      {(["sm", "md", "lg"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => applySize(k)}
                          className={[
                            "px-2.5 py-1.5 text-xs transition-colors",
                            currentSize === k
                              ? "bg-primary text-primary-foreground"
                              : "bg-background hover:bg-muted",
                          ].join(" ")}
                        >
                          {k === "sm" ? "Pequeña" : k === "md" ? "Media" : "Grande"}
                        </button>
                      ))}
                    </div>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => nudge(-1)} aria-label="Reducir">
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => nudge(1)} aria-label="Aumentar">
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {shape === "rectangle" && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <RotateCw className="h-3 w-3" /> Girar
                    </label>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => rotateBy(-15)}>−15°</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => rotateBy(15)}>+15°</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => rotateBy(90)}>90°</Button>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {Math.round(table.visual_rotation ?? 0)}°
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Puede unirse con
              </h3>
              {table.is_active && (
                <Button size="sm" variant="ghost" onClick={() => onCreateComboWithTable(table)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Crear combinación con esta mesa
                </Button>
              )}
            </div>
            {myCombos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Esta mesa todavía no forma parte de ninguna combinación.
              </p>
            ) : (
              <ul className="space-y-2">
                {myCombos.map((row) => {
                  const partners = row.tableIds
                    .filter((id) => id !== table.id)
                    .map((id) => tableById.get(id)?.label)
                    .filter(Boolean)
                    .join(", ");
                  const cap =
                    row.combination.min_capacity != null
                      ? `${row.combination.min_capacity}–${row.combination.max_capacity} personas`
                      : `${row.combination.max_capacity} personas`;
                  return (
                    <li
                      key={row.combination.id}
                      className="rounded-lg border border-border bg-background/40 px-3 py-2 flex items-center gap-3"
                    >
                      <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {partners || "—"} · {row.combination.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {cap}
                          {!row.combination.is_active && " · Inactiva"}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => onEditCombo(row)}>
                        Editar
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
