import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Zone, RestaurantTable, TableCombination } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Wand2, Link2, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { TableCombinationDrawer } from "./TableCombinationDrawer";
import { TableDetailDrawer } from "./TableDetailDrawer";
import { ZoneFloorPlan } from "./ZoneFloorPlan";

type ComboRow = {
  combination: TableCombination;
  tableIds: string[];
};

const DEMO_ZONES = [
  { name: "Interior", count: 8, min: 2, max: 6, prefix: "I" },
  { name: "Terraza", count: 6, min: 2, max: 4, prefix: "T" },
  { name: "Porche playa", count: 4, min: 4, max: 8, prefix: "P" },
];

export function TablesPanel({ restaurantId }: { restaurantId: string }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [saving, setSaving] = useState(false);
  const [combos, setCombos] = useState<ComboRow[]>([]);
  const [comboDrawer, setComboDrawer] = useState<{
    open: boolean;
    zoneId?: string;
    initial: ComboRow | null;
    defaultSelectedTableIds?: string[];
  }>({ open: false, initial: null });
  const [tableDrawer, setTableDrawer] = useState<{ open: boolean; tableId: string | null }>({
    open: false,
    tableId: null,
  });
  const [confirmDeleteCombo, setConfirmDeleteCombo] = useState<ComboRow | null>(null);
  const [zoneView, setZoneView] = useState<Record<string, "visual" | "list">>({});

  async function reload() {
    const [{ data: z }, { data: t }] = await Promise.all([
      supabase.from("restaurant_zones").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
      supabase.from("restaurant_tables").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
    ]);
    setZones((z as Zone[]) ?? []);
    setTables((t as RestaurantTable[]) ?? []);
    await reloadCombos();
  }

  async function reloadCombos() {
    const { data: combosData } = await supabase
      .from("table_combinations")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: true });
    const ids = (combosData ?? []).map((c: any) => c.id);
    const memberMap = new Map<string, string[]>();
    if (ids.length > 0) {
      const { data: members } = await supabase
        .from("table_combination_tables")
        .select("combination_id, table_id, sort_order")
        .in("combination_id", ids)
        .order("sort_order", { ascending: true });
      for (const m of (members ?? []) as any[]) {
        const arr = memberMap.get(m.combination_id) ?? [];
        arr.push(m.table_id);
        memberMap.set(m.combination_id, arr);
      }
    }
    setCombos(
      ((combosData ?? []) as TableCombination[]).map((c) => ({
        combination: c,
        tableIds: memberMap.get(c.id) ?? [],
      })),
    );
  }

  useEffect(() => { if (restaurantId) reload(); /* eslint-disable-next-line */ }, [restaurantId]);

  async function addZone() {
    const { data, error } = await supabase.from("restaurant_zones").insert({
      restaurant_id: restaurantId, name: "Nueva zona", sort_order: zones.length,
    }).select().single();
    if (error) return toast.error(error.message);
    setZones((p) => [...p, data as Zone]);
  }

  async function updateZone(id: string, patch: Partial<Zone>) {
    setZones((p) => p.map(z => z.id === id ? { ...z, ...patch } : z));
    const { error } = await supabase.from("restaurant_zones").update(patch).eq("id", id);
    if (error) toast.error(error.message);
  }

  async function deleteZone(id: string) {
    await supabase.from("restaurant_tables").delete().eq("zone_id", id);
    const { error } = await supabase.from("restaurant_zones").delete().eq("id", id);
    if (error) return toast.error(error.message);
    reload();
  }

  async function addTable(zoneId: string) {
    const zoneTables = tables.filter(t => t.zone_id === zoneId);
    const { data, error } = await supabase.from("restaurant_tables").insert({
      restaurant_id: restaurantId, zone_id: zoneId,
      label: `M${zoneTables.length + 1}`, min_capacity: 2, max_capacity: 4,
      sort_order: zoneTables.length,
    }).select().single();
    if (error) return toast.error(error.message);
    setTables((p) => [...p, data as RestaurantTable]);
  }

  function patchTable(id: string, patch: Partial<RestaurantTable>) {
    setTables((p) => p.map(t => t.id === id ? { ...t, ...patch } : t));
  }

  async function saveTable(t: RestaurantTable) {
    const { error } = await supabase.from("restaurant_tables").update({
      label: t.label, min_capacity: t.min_capacity, max_capacity: t.max_capacity,
      is_active: t.is_active, internal_notes: t.internal_notes,
    }).eq("id", t.id);
    if (error) toast.error(error.message);
  }

  async function deleteTable(id: string) {
    const { error } = await supabase.from("restaurant_tables").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setTables((p) => p.filter(t => t.id !== id));
    reloadCombos();
  }

  async function deleteCombo(row: ComboRow) {
    const { error } = await supabase
      .from("table_combinations")
      .delete()
      .eq("id", row.combination.id);
    if (error) return toast.error(error.message);
    toast.success("Combinación eliminada.");
    reloadCombos();
  }

  async function saveAll() {
    setSaving(true);
    for (const t of tables) await saveTable(t);
    setSaving(false);
    toast.success("Mesas guardadas");
  }

  async function generateDemo() {
    setSaving(true);
    await supabase.from("restaurant_tables").delete().eq("restaurant_id", restaurantId);
    await supabase.from("restaurant_zones").delete().eq("restaurant_id", restaurantId);
    for (let zi = 0; zi < DEMO_ZONES.length; zi++) {
      const dz = DEMO_ZONES[zi];
      const { data: zone, error: ze } = await supabase.from("restaurant_zones").insert({
        restaurant_id: restaurantId, name: dz.name, sort_order: zi,
      }).select().single();
      if (ze || !zone) { toast.error(ze?.message ?? "Error"); setSaving(false); return; }
      const rows = Array.from({ length: dz.count }, (_, i) => ({
        restaurant_id: restaurantId, zone_id: zone.id,
        label: `${dz.prefix}${i + 1}`,
        min_capacity: dz.min, max_capacity: dz.max, sort_order: i,
      }));
      await supabase.from("restaurant_tables").insert(rows);
    }
    setSaving(false);
    toast.success("Mapa de mesas demo generado");
    reload();
  }

  function combosForZone(zoneId: string) {
    return combos.filter((c) => c.combination.zone_id === zoneId);
  }
  function combosForTable(tableId: string) {
    return combos.filter((c) => c.tableIds.includes(tableId));
  }

  const activeTable =
    tableDrawer.tableId ? tables.find((t) => t.id === tableDrawer.tableId) ?? null : null;
  const activeTableZone =
    activeTable ? zones.find((z) => z.id === activeTable.zone_id) ?? null : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <p className="font-medium text-sm">Zonas y mesas</p>
            <p className="text-xs text-muted-foreground">Define las zonas del restaurante y las mesas disponibles para asignar reservas.</p>
          </div>
          <div className="flex gap-2">
            {zones.length === 0 && tables.length === 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm"><Wand2 className="h-4 w-4 mr-1" />Generar mapa demo</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Generar mapa de ejemplo</AlertDialogTitle>
                    <AlertDialogDescription>
                      Se creará un mapa de ejemplo (Interior 8, Terraza 6, Porche playa 4) que después puedes editar libremente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={generateDemo}>Generar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button size="sm" onClick={addZone}><Plus className="h-4 w-4 mr-1" />Añadir zona</Button>
          </div>
        </CardContent>
      </Card>

      {zones.length === 0 && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">
          Aún no hay zonas. Crea una zona o genera un mapa demo para empezar.
        </CardContent></Card>
      )}

      {zones.map(z => {
        const zt = tables.filter(t => t.zone_id === z.id);
        const total = zt.reduce((s, t) => s + (t.max_capacity ?? 0), 0);
        const zoneCombos = combosForZone(z.id);
        return (
          <Card key={z.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3 gap-2">
              <div className="flex items-center gap-3 flex-1">
                <Input className="max-w-xs" value={z.name} onChange={e => patchZoneLocal(z.id, { name: e.target.value })} onBlur={e => updateZone(z.id, { name: e.target.value })} />
                <div className="flex items-center gap-2">
                  <Switch checked={z.is_active} onCheckedChange={c => updateZone(z.id, { is_active: c })} />
                  <span className="text-xs text-muted-foreground">Activa</span>
                </div>
                <span className="text-xs text-muted-foreground">{zt.length} mesas · {total} personas máx.</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => addTable(z.id)}><Plus className="h-4 w-4 mr-1" />Añadir mesa</Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminar zona "{z.name}"</AlertDialogTitle>
                      <AlertDialogDescription>Se eliminarán también todas las mesas de esta zona.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteZone(z.id)}>Eliminar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-end -mt-1">
                <div className="inline-flex rounded-md border border-border bg-background p-0.5 text-xs">
                  {(["visual", "list"] as const).map((v) => {
                    const active = (zoneView[z.id] ?? "visual") === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setZoneView((s) => ({ ...s, [z.id]: v }))}
                        className={[
                          "px-2.5 py-1 rounded-[5px] transition-colors",
                          active
                            ? "bg-secondary text-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground",
                        ].join(" ")}
                      >
                        {v === "visual" ? "Vista visual" : "Vista lista"}
                      </button>
                    );
                  })}
                </div>
              </div>

              {(zoneView[z.id] ?? "visual") === "visual" ? (
                <ZoneFloorPlan
                  zone={z}
                  zoneTables={zt}
                  combos={combos}
                  onTableClick={(t) => setTableDrawer({ open: true, tableId: t.id })}
                  onSaved={reload}
                />
              ) : (
                <>
              {zt.length === 0 && <p className="text-sm text-muted-foreground">Sin mesas en esta zona.</p>}
              {zt.map(t => {
                const tCombos = combosForTable(t.id);
                let indicator: string | null = null;
                if (tCombos.length === 1) {
                  const partner = tCombos[0].tableIds
                    .filter((id) => id !== t.id)
                    .map((id) => tables.find((x) => x.id === id)?.label)
                    .filter(Boolean)
                    .join(" + ");
                  indicator = partner ? `↔ ${partner}` : null;
                } else if (tCombos.length > 1) {
                  indicator = `↔ ${tCombos.length} combinaciones`;
                }
                return (
                  <div key={t.id} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end border rounded-lg p-3">
                    <div className="space-y-1.5 md:col-span-1">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="text-xs">Etiqueta</Label>
                        <button
                          type="button"
                          onClick={() => setTableDrawer({ open: true, tableId: t.id })}
                          className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        >
                          {indicator ?? "Ver detalle"}
                        </button>
                      </div>
                      <Input value={t.label} onChange={e => patchTable(t.id, { label: e.target.value })} />
                    </div>
                    <div className="space-y-1.5"><Label className="text-xs">Mín. personas</Label><Input type="number" min={1} value={t.min_capacity} onChange={e => patchTable(t.id, { min_capacity: Number(e.target.value) })} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Máx. personas</Label><Input type="number" min={1} value={t.max_capacity} onChange={e => patchTable(t.id, { max_capacity: Number(e.target.value) })} /></div>
                    <div className="space-y-1.5 md:col-span-2"><Label className="text-xs">Notas</Label><Input value={t.internal_notes ?? ""} onChange={e => patchTable(t.id, { internal_notes: e.target.value })} placeholder="Junto a ventana…" /></div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Switch checked={t.is_active} onCheckedChange={c => patchTable(t.id, { is_active: c })} />
                        <span className="text-xs">Activa</span>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => deleteTable(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                );
              })}
                </>
              )}

              {/* Combinaciones de la zona */}
              <div className="pt-4 mt-2 border-t border-border space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="text-sm font-medium">Mesas que se pueden unir</p>
                    <p className="text-xs text-muted-foreground">
                      Define qué mesas de esta zona pueden juntarse para reservas grandes.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setComboDrawer({ open: true, zoneId: z.id, initial: null })
                    }
                    disabled={zt.filter((t) => t.is_active).length < 2}
                  >
                    <Link2 className="h-4 w-4 mr-1" /> Crear combinación en esta zona
                  </Button>
                </div>

                {zoneCombos.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Esta zona aún no tiene combinaciones.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {zoneCombos.map((row) => {
                      const c = row.combination;
                      const labels = row.tableIds
                        .map((id) => tables.find((x) => x.id === id)?.label)
                        .filter(Boolean) as string[];
                      const capacity =
                        c.min_capacity != null
                          ? `${c.min_capacity}–${c.max_capacity} personas`
                          : `${c.max_capacity} personas`;
                      return (
                        <div
                          key={c.id}
                          className="rounded-lg border border-border bg-background/40 p-3 space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-foreground truncate">{c.name}</p>
                              <p className="text-xs text-muted-foreground">{capacity}</p>
                            </div>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                                c.is_active
                                  ? "bg-success/10 text-success border-success/30"
                                  : "bg-muted text-muted-foreground border-border"
                              }`}
                            >
                              {c.is_active ? "Activa" : "Inactiva"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Mesas: <span className="text-foreground">{labels.join(", ") || "—"}</span>
                          </p>
                          <div className="flex items-center justify-end gap-1 pt-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setComboDrawer({ open: true, zoneId: z.id, initial: row })
                              }
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setConfirmDeleteCombo(row)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {zones.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={saveAll} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Button>
        </div>
      )}

      <TableCombinationDrawer
        open={comboDrawer.open}
        onOpenChange={(b) => setComboDrawer((d) => ({ ...d, open: b }))}
        restaurantId={restaurantId}
        zones={zones}
        tables={tables}
        initial={comboDrawer.initial}
        existingCombos={combos}
        lockedZoneId={comboDrawer.zoneId}
        defaultSelectedTableIds={comboDrawer.defaultSelectedTableIds}
        onSaved={reloadCombos}
      />

      <TableDetailDrawer
        open={tableDrawer.open}
        onOpenChange={(b) => setTableDrawer((d) => ({ ...d, open: b }))}
        table={activeTable}
        zone={activeTableZone}
        tables={tables}
        combos={combos}
        onEditCombo={(row) => {
          setTableDrawer({ open: false, tableId: null });
          setComboDrawer({ open: true, zoneId: row.combination.zone_id ?? undefined, initial: row });
        }}
        onCreateComboWithTable={(t) => {
          setTableDrawer({ open: false, tableId: null });
          setComboDrawer({
            open: true,
            zoneId: t.zone_id,
            initial: null,
            defaultSelectedTableIds: [t.id],
          });
        }}
      />

      <AlertDialog open={!!confirmDeleteCombo} onOpenChange={(b) => !b && setConfirmDeleteCombo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar combinación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar la combinación "{confirmDeleteCombo?.combination.name}"? Las mesas individuales no se borran.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteCombo) deleteCombo(confirmDeleteCombo);
                setConfirmDeleteCombo(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  function patchZoneLocal(id: string, patch: Partial<Zone>) {
    setZones(p => p.map(z => z.id === id ? { ...z, ...patch } : z));
  }
}