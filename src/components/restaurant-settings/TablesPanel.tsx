import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Zone, RestaurantTable } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const DEMO_ZONES = [
  { name: "Interior", count: 8, min: 2, max: 6, prefix: "I" },
  { name: "Terraza", count: 6, min: 2, max: 4, prefix: "T" },
  { name: "Porche playa", count: 4, min: 4, max: 8, prefix: "P" },
];

export function TablesPanel({ restaurantId }: { restaurantId: string }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [saving, setSaving] = useState(false);

  async function reload() {
    const [{ data: z }, { data: t }] = await Promise.all([
      supabase.from("restaurant_zones").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
      supabase.from("restaurant_tables").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
    ]);
    setZones((z as Zone[]) ?? []);
    setTables((t as RestaurantTable[]) ?? []);
  }

  useEffect(() => { if (restaurantId) reload(); }, [restaurantId]);

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
              {zt.length === 0 && <p className="text-sm text-muted-foreground">Sin mesas en esta zona.</p>}
              {zt.map(t => (
                <div key={t.id} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end border rounded-lg p-3">
                  <div className="space-y-1.5"><Label className="text-xs">Etiqueta</Label><Input value={t.label} onChange={e => patchTable(t.id, { label: e.target.value })} /></div>
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
              ))}
            </CardContent>
          </Card>
        );
      })}

      {zones.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={saveAll} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Button>
        </div>
      )}
    </div>
  );

  function patchZoneLocal(id: string, patch: Partial<Zone>) {
    setZones(p => p.map(z => z.id === id ? { ...z, ...patch } : z));
  }
}