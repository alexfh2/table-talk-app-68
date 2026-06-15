import { useEffect, useMemo, useRef, useState } from "react";
import type { RestaurantTable, Zone, TableCombination } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, X, Pencil, RotateCw } from "lucide-react";

type ComboRow = { combination: TableCombination; tableIds: string[] };

type Draft = {
  visual_x: number;
  visual_y: number;
  visual_width: number;
  visual_height: number;
  visual_shape: "round" | "square" | "rectangle";
  visual_rotation: number;
};

const DEFAULT_BY_SHAPE: Record<Draft["visual_shape"], { w: number; h: number }> = {
  round: { w: 11, h: 16 },
  square: { w: 11, h: 16 },
  rectangle: { w: 18, h: 11 },
};

/** Pure helper: place tables missing a saved position into a tidy grid. */
function autoLayout(
  tables: RestaurantTable[],
): Record<string, Draft> {
  const drafts: Record<string, Draft> = {};
  const needAuto = tables.filter(
    (t) => t.visual_x == null || t.visual_y == null,
  );
  const placed = tables.filter(
    (t) => t.visual_x != null && t.visual_y != null,
  );

  for (const t of placed) {
    const def = DEFAULT_BY_SHAPE[t.visual_shape ?? "round"];
    drafts[t.id] = {
      visual_x: Number(t.visual_x),
      visual_y: Number(t.visual_y),
      visual_width: Number(t.visual_width ?? def.w),
      visual_height: Number(t.visual_height ?? def.h),
      visual_shape: (t.visual_shape as Draft["visual_shape"]) ?? "round",
      visual_rotation: Number(t.visual_rotation ?? 0),
    };
  }

  if (needAuto.length > 0) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(needAuto.length)));
    const rows = Math.max(1, Math.ceil(needAuto.length / cols));
    const padX = 12;
    const padY = 14;
    const stepX = cols === 1 ? 0 : (100 - padX * 2) / (cols - 1);
    const stepY = rows === 1 ? 0 : (100 - padY * 2) / (rows - 1);
    needAuto.forEach((t, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const def = DEFAULT_BY_SHAPE[t.visual_shape ?? "round"];
      drafts[t.id] = {
        visual_x: cols === 1 ? 50 : padX + c * stepX,
        visual_y: rows === 1 ? 50 : padY + r * stepY,
        visual_width: Number(t.visual_width ?? def.w),
        visual_height: Number(t.visual_height ?? def.h),
        visual_shape: (t.visual_shape as Draft["visual_shape"]) ?? "round",
        visual_rotation: Number(t.visual_rotation ?? 0),
      };
    });
  }

  return drafts;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function ZoneFloorPlan({
  zone,
  zoneTables,
  combos,
  onTableClick,
  onSaved,
}: {
  zone: Zone;
  zoneTables: RestaurantTable[];
  combos: ComboRow[];
  onTableClick: (table: RestaurantTable) => void;
  /** Called after saving the layout so the parent can refresh state. */
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => autoLayout(zoneTables));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Reset drafts when zone tables change or when leaving edit mode
  useEffect(() => {
    setDrafts(autoLayout(zoneTables));
    setSelectedId(null);
  }, [zoneTables, editing]);

  /** Tables that share at least one combination with `id`. */
  const partnerMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const t of zoneTables) map.set(t.id, new Set());
    for (const row of combos) {
      if (row.combination.zone_id !== zone.id) continue;
      if (!row.combination.is_active) continue;
      const ids = row.tableIds;
      for (const id of ids) {
        const set = map.get(id);
        if (!set) continue;
        for (const other of ids) if (other !== id) set.add(other);
      }
    }
    return map;
  }, [combos, zoneTables, zone.id]);

  const focusId = selectedId ?? hoverId;
  const highlighted = focusId ? partnerMap.get(focusId) ?? new Set<string>() : new Set<string>();

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  function startDrag(e: React.PointerEvent, id: string) {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(id);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const onMove = (ev: PointerEvent) => {
      const x = clamp(((ev.clientX - rect.left) / rect.width) * 100, 3, 97);
      const y = clamp(((ev.clientY - rect.top) / rect.height) * 100, 5, 95);
      updateDraft(id, { visual_x: x, visual_y: y });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  async function save() {
    setSaving(true);
    const updates = zoneTables.map((t) => {
      const d = drafts[t.id];
      return supabase
        .from("restaurant_tables")
        .update({
          visual_x: d.visual_x,
          visual_y: d.visual_y,
          visual_width: d.visual_width,
          visual_height: d.visual_height,
          visual_shape: d.visual_shape,
          visual_rotation: d.visual_rotation,
        })
        .eq("id", t.id);
    });
    const results = await Promise.all(updates);
    setSaving(false);
    const err = results.find((r) => r.error)?.error;
    if (err) return toast.error(err.message);
    toast.success("Plano guardado.");
    setEditing(false);
    onSaved();
  }

  const selectedDraft = selectedId ? drafts[selectedId] : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {editing
            ? "Arrastra las mesas para colocarlas dentro de la zona."
            : "Haz click en una mesa para ver su detalle."}
        </p>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                <X className="h-4 w-4 mr-1" /> Cancelar cambios
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> Guardar plano
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={zoneTables.length === 0}>
              <Pencil className="h-4 w-4 mr-1" /> Editar plano
            </Button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full rounded-2xl border border-border bg-[hsl(var(--secondary))] overflow-hidden"
        style={{
          aspectRatio: "16 / 10",
          backgroundImage:
            "radial-gradient(circle at 1px 1px, hsl(var(--muted-foreground) / 0.18) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
        onPointerDown={() => editing && setSelectedId(null)}
      >
        {zoneTables.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-muted-foreground italic">Esta zona aún no tiene mesas.</p>
          </div>
        )}

        {zoneTables.map((t) => {
          const d = drafts[t.id];
          if (!d) return null;
          const isSelected = selectedId === t.id;
          const isHighlight = focusId && focusId !== t.id && highlighted.has(t.id);
          const inactive = !t.is_active;
          const radius =
            d.visual_shape === "round" ? "9999px" : d.visual_shape === "square" ? "10px" : "8px";
          const tCombos = combos.filter((c) => c.tableIds.includes(t.id));

          return (
            <button
              key={t.id}
              type="button"
              onPointerDown={(e) => editing && startDrag(e, t.id)}
              onMouseEnter={() => setHoverId(t.id)}
              onMouseLeave={() => setHoverId((h) => (h === t.id ? null : h))}
              onClick={(e) => {
                e.stopPropagation();
                if (editing) {
                  setSelectedId(t.id);
                } else {
                  onTableClick(t);
                }
              }}
              className={[
                "absolute flex flex-col items-center justify-center text-center select-none transition-shadow",
                "border bg-card",
                editing ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                inactive ? "opacity-50 border-dashed" : "",
                isSelected
                  ? "border-primary ring-2 ring-primary/40 shadow-md z-10"
                  : isHighlight
                  ? "border-primary/60 ring-1 ring-primary/30"
                  : "border-border hover:border-primary/40",
              ].join(" ")}
              style={{
                left: `${d.visual_x}%`,
                top: `${d.visual_y}%`,
                width: `${d.visual_width}%`,
                height: `${d.visual_height}%`,
                minWidth: 44,
                minHeight: 44,
                borderRadius: radius,
                transform: `translate(-50%, -50%) rotate(${d.visual_rotation}deg)`,
              }}
              aria-label={`Mesa ${t.label}`}
            >
              <span className="text-sm font-semibold leading-none">{t.label}</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">
                {t.min_capacity}–{t.max_capacity}
              </span>
              {tCombos.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary/10 text-primary text-[10px] font-bold border border-primary/30">
                  ↔
                </span>
              )}
            </button>
          );
        })}
      </div>

      {editing && selectedDraft && selectedId && (
        <div className="rounded-xl border border-border bg-background p-3 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Forma y tamaño · {zoneTables.find((t) => t.id === selectedId)?.label}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs">Forma</label>
              <Select
                value={selectedDraft.visual_shape}
                onValueChange={(v) => {
                  const shape = v as Draft["visual_shape"];
                  const def = DEFAULT_BY_SHAPE[shape];
                  updateDraft(selectedId, {
                    visual_shape: shape,
                    visual_width: def.w,
                    visual_height: def.h,
                    visual_rotation: shape === "rectangle" ? selectedDraft.visual_rotation : 0,
                  });
                }}
              >
                <SelectTrigger>
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
              <label className="text-xs">Tamaño</label>
              <Slider
                min={6}
                max={30}
                step={1}
                value={[selectedDraft.visual_width]}
                onValueChange={([v]) => {
                  if (selectedDraft.visual_shape === "rectangle") {
                    updateDraft(selectedId, {
                      visual_width: v,
                      visual_height: Math.max(6, Math.round(v * 0.6)),
                    });
                  } else {
                    updateDraft(selectedId, { visual_width: v, visual_height: v });
                  }
                }}
              />
            </div>
            {selectedDraft.visual_shape === "rectangle" && (
              <div className="space-y-1.5">
                <label className="text-xs inline-flex items-center gap-1">
                  <RotateCw className="h-3 w-3" /> Rotación
                </label>
                <Slider
                  min={0}
                  max={180}
                  step={5}
                  value={[selectedDraft.visual_rotation]}
                  onValueChange={([v]) => updateDraft(selectedId, { visual_rotation: v })}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}