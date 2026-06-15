import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { X, Trash2, RotateCw, Minus, Plus } from "lucide-react";
import type {
  ZoneElement,
  ZoneElementShape,
  ZoneElementType,
} from "@/lib/types";
import { ZONE_ELEMENT_LABELS } from "@/lib/types";

const SIZE_PRESETS: Record<ZoneElementShape, { sm: number; md: number; lg: number }> = {
  rectangle: { sm: 12, md: 18, lg: 28 },
  square: { sm: 8, md: 12, lg: 18 },
  circle: { sm: 8, md: 12, lg: 18 },
};

function heightFor(shape: ZoneElementShape, width: number) {
  if (shape === "rectangle") return Math.max(5, Math.round(width * 0.45));
  return width;
}

function sizeLabel(shape: ZoneElementShape, width: number): "sm" | "md" | "lg" {
  const p = SIZE_PRESETS[shape];
  const d: Array<["sm" | "md" | "lg", number]> = [
    ["sm", Math.abs(width - p.sm)],
    ["md", Math.abs(width - p.md)],
    ["lg", Math.abs(width - p.lg)],
  ];
  d.sort((a, b) => a[1] - b[1]);
  return d[0][0];
}

export function ZoneElementDetailDrawer({
  open,
  onOpenChange,
  element,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  element: ZoneElement | null;
  onUpdate: (id: string, patch: Partial<ZoneElement>) => void;
  onDelete: (id: string) => void;
}) {
  if (!element) return null;

  const shape = element.shape;
  const presets = SIZE_PRESETS[shape];
  const currentSize = sizeLabel(shape, element.visual_width);

  const applySize = (k: "sm" | "md" | "lg") => {
    const w = presets[k];
    onUpdate(element.id, { visual_width: w, visual_height: heightFor(shape, w) });
  };
  const nudge = (delta: number) => {
    const w = Math.min(60, Math.max(4, element.visual_width + delta));
    onUpdate(element.id, { visual_width: w, visual_height: heightFor(shape, w) });
  };
  const rotateBy = (delta: number) => {
    if (shape === "circle") return;
    const r = (((element.rotation ?? 0) + delta) % 360 + 360) % 360;
    onUpdate(element.id, { rotation: r });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:min-w-[420px] sm:max-w-[460px] bg-card p-0 flex flex-col gap-0"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-6 py-4">
          <div>
            <h2 className="text-2xl tracking-tight leading-tight">
              {element.label || ZONE_ELEMENT_LABELS[element.element_type]}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Elemento del plano · no reservable
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
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tipo y nombre
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Tipo</label>
                <Select
                  value={element.element_type}
                  onValueChange={(v) =>
                    onUpdate(element.id, { element_type: v as ZoneElementType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ZONE_ELEMENT_LABELS) as ZoneElementType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {ZONE_ELEMENT_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Nombre visible</label>
                <Input
                  value={element.label}
                  onChange={(e) => onUpdate(element.id, { label: e.target.value })}
                  placeholder={ZONE_ELEMENT_LABELS[element.element_type]}
                />
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Apariencia en el plano
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Forma</label>
                <Select
                  value={shape}
                  onValueChange={(v) => {
                    const next = v as ZoneElementShape;
                    const w = SIZE_PRESETS[next][currentSize];
                    onUpdate(element.id, {
                      shape: next,
                      visual_width: w,
                      visual_height: heightFor(next, w),
                      rotation: next === "circle" ? 0 : element.rotation,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rectangle">Rectángulo</SelectItem>
                    <SelectItem value="square">Cuadrado</SelectItem>
                    <SelectItem value="circle">Círculo</SelectItem>
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
                        {k === "sm" ? "Pequeño" : k === "md" ? "Mediano" : "Grande"}
                      </button>
                    ))}
                  </div>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => nudge(-1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => nudge(1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {shape !== "circle" && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <RotateCw className="h-3 w-3" /> Girar
                  </label>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => rotateBy(-15)}>−15°</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => rotateBy(15)}>+15°</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => rotateBy(90)}>90°</Button>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {Math.round(element.rotation ?? 0)}°
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Visibilidad
            </h3>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm">Mostrar en el plano</p>
                <p className="text-xs text-muted-foreground">
                  Si lo ocultas, no aparece en la vista visual.
                </p>
              </div>
              <Switch
                checked={element.is_visible}
                onCheckedChange={(c) => onUpdate(element.id, { is_visible: c })}
              />
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2 border-t border-border bg-card px-6 py-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-1" /> Eliminar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar elemento</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    onDelete(element.id);
                    onOpenChange(false);
                  }}
                >
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}