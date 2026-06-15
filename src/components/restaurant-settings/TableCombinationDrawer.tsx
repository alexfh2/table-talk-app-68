import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Zone, RestaurantTable, TableCombination } from "@/lib/types";
import { toast } from "sonner";
import { AlertCircle, X } from "lucide-react";

type ExistingCombo = {
  combination: TableCombination;
  tableIds: string[];
};

export function TableCombinationDrawer({
  open,
  onOpenChange,
  restaurantId,
  zones,
  tables,
  initial,
  existingCombos,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  restaurantId: string;
  zones: Zone[];
  tables: RestaurantTable[];
  initial: ExistingCombo | null;
  existingCombos: ExistingCombo[];
  onSaved: () => void;
}) {
  const [zoneId, setZoneId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [minCap, setMinCap] = useState<string>("");
  const [maxCap, setMaxCap] = useState<string>("");
  const [minTouched, setMinTouched] = useState(false);
  const [maxTouched, setMaxTouched] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setZoneId(initial.combination.zone_id ?? "");
      setSelected(new Set(initial.tableIds));
      setName(initial.combination.name);
      setNameTouched(true);
      setMinCap(initial.combination.min_capacity != null ? String(initial.combination.min_capacity) : "");
      setMaxCap(String(initial.combination.max_capacity));
      setMinTouched(true);
      setMaxTouched(true);
      setIsActive(initial.combination.is_active);
      setNotes(initial.combination.internal_notes ?? "");
    } else {
      setZoneId("");
      setSelected(new Set());
      setName("");
      setNameTouched(false);
      setMinCap("");
      setMaxCap("");
      setMinTouched(false);
      setMaxTouched(false);
      setIsActive(true);
      setNotes("");
    }
  }, [open, initial]);

  const zoneTables = useMemo(
    () =>
      tables
        .filter((t) => t.zone_id === zoneId && (t.is_active || selected.has(t.id)))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [tables, zoneId, selected],
  );

  const selectedTables = useMemo(
    () =>
      tables
        .filter((t) => selected.has(t.id))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [tables, selected],
  );

  // Auto-suggest name and capacities when selection changes.
  useEffect(() => {
    if (!nameTouched) {
      setName(selectedTables.map((t) => t.label).join(" + "));
    }
    if (!minTouched) {
      const m = selectedTables.reduce((s, t) => s + (t.min_capacity ?? 0), 0);
      setMinCap(m ? String(m) : "");
    }
    if (!maxTouched) {
      const m = selectedTables.reduce((s, t) => s + (t.max_capacity ?? 0), 0);
      setMaxCap(m ? String(m) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTables.map((t) => t.id).join(",")]);

  function toggleTable(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function onZoneChange(z: string) {
    if (z !== zoneId) {
      setZoneId(z);
      setSelected(new Set()); // reset selection when zone changes
    }
  }

  const minNum = minCap.trim() === "" ? null : Number(minCap);
  const maxNum = maxCap.trim() === "" ? NaN : Number(maxCap);

  const duplicateOfActive = useMemo(() => {
    if (selected.size < 2) return null;
    const key = Array.from(selected).sort().join("|");
    return existingCombos.find((c) => {
      if (initial && c.combination.id === initial.combination.id) return false;
      if (!c.combination.is_active && !isActive) return false;
      if (!c.combination.is_active) return false;
      const k = [...c.tableIds].sort().join("|");
      return k === key;
    });
  }, [selected, existingCombos, initial, isActive]);

  function validate(): string | null {
    if (!zoneId) return "Selecciona una zona.";
    if (selected.size < 2) return "Selecciona al menos 2 mesas.";
    const zonesSelected = new Set(selectedTables.map((t) => t.zone_id));
    if (zonesSelected.size > 1) return "No puedes combinar mesas de zonas distintas.";
    if (!name.trim()) return "Pon un nombre a la combinación.";
    if (!maxCap.trim() || Number.isNaN(maxNum) || maxNum <= 0)
      return "Indica el máximo de personas.";
    if (minNum != null && minNum > maxNum)
      return "El mínimo no puede ser mayor que el máximo.";
    return null;
  }

  async function save() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        zone_id: zoneId || null,
        name: name.trim(),
        min_capacity: minNum,
        max_capacity: maxNum,
        is_active: isActive,
        internal_notes: notes.trim() || null,
      };
      let comboId = initial?.combination.id ?? null;
      if (comboId) {
        const { error } = await supabase
          .from("table_combinations")
          .update(payload)
          .eq("id", comboId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("table_combinations")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        comboId = (data as { id: string }).id;
      }

      // Replace member tables.
      await supabase.from("table_combination_tables").delete().eq("combination_id", comboId);
      const rows = selectedTables.map((t, i) => ({
        combination_id: comboId!,
        table_id: t.id,
        sort_order: i,
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from("table_combination_tables").insert(rows);
        if (error) throw error;
      }
      toast.success(initial ? "Combinación actualizada." : "Combinación creada.");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar la combinación.");
    } finally {
      setSaving(false);
    }
  }

  const activeZones = zones.filter((z) => z.is_active);
  const validationErr = open ? validate() : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:min-w-[460px] sm:max-w-[500px] bg-card p-0 flex flex-col gap-0">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-6 py-4">
          <div>
            <h2 className="text-2xl tracking-tight leading-tight">
              {initial ? "Editar combinación" : "Nueva combinación"}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Une varias mesas para reservas grandes.
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
          <div className="space-y-1.5">
            <Label>Zona <span className="text-terracotta">*</span></Label>
            <Select value={zoneId} onValueChange={onZoneChange}>
              <SelectTrigger><SelectValue placeholder="Selecciona una zona" /></SelectTrigger>
              <SelectContent>
                {activeZones.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No hay zonas activas.</div>
                )}
                {activeZones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {zoneId && (
            <div className="space-y-2">
              <Label>Mesas incluidas <span className="text-terracotta">*</span></Label>
              {zoneTables.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay mesas activas en esta zona.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {zoneTables.map((t) => {
                    const checked = selected.has(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors ${
                          checked ? "border-primary/60 bg-primary/5" : "border-border hover:bg-secondary/40"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleTable(t.id)}
                        />
                        <span className="font-medium">{t.label}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {t.min_capacity}-{t.max_capacity}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Selecciona 2 o más mesas de la misma zona.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
              placeholder="T1 + T2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mín. personas</Label>
              <Input
                type="number"
                min={1}
                value={minCap}
                onChange={(e) => { setMinCap(e.target.value); setMinTouched(true); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Máx. personas <span className="text-terracotta">*</span></Label>
              <Input
                type="number"
                min={1}
                value={maxCap}
                onChange={(e) => { setMaxCap(e.target.value); setMaxTouched(true); }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Activa</p>
              <p className="text-xs text-muted-foreground">Solo las combinaciones activas estarán disponibles para reservas.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="space-y-1.5">
            <Label>Notas internas</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. solo para grupos grandes, requiere mover sillas…"
            />
          </div>

          {duplicateOfActive && (
            <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Ya existe una combinación activa con las mismas mesas: <b>{duplicateOfActive.combination.name}</b>.
              </span>
            </div>
          )}

          {validationErr && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{validationErr}</span>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !!validationErr}>
            {saving ? "Guardando…" : initial ? "Guardar cambios" : "Crear combinación"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}