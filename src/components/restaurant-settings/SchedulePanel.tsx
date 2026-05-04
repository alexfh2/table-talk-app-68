import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listSchedule } from "@/lib/queries";
import type { ScheduleRow } from "@/lib/types";
import { DAY_NAMES } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export function SchedulePanel({ restaurantId }: { restaurantId: string }) {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listSchedule(restaurantId).then(setRows);
  }, [restaurantId]);

  function update(id: string, patch: Partial<ScheduleRow>) {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function addService(day: number) {
    const { data, error } = await supabase
      .from("restaurant_schedule")
      .insert({
        restaurant_id: restaurantId,
        day_of_week: day,
        is_open: true,
        opening_time: "13:00",
        closing_time: "16:00",
        service_name: "Servicio",
        max_guests_per_slot: 30,
        max_reservations_per_slot: 10,
        slot_duration_minutes: 30,
        booking_mode: "slots",
        shift_times: null,
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setRows((p) => [...p, data as ScheduleRow]);
  }

  async function removeRow(id: string) {
    const { error } = await supabase.from("restaurant_schedule").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows((p) => p.filter((r) => r.id !== id));
  }

  async function saveAll() {
    setSaving(true);
    for (const r of rows) {
      await supabase
        .from("restaurant_schedule")
        .update({
          is_open: r.is_open,
          opening_time: r.opening_time,
          closing_time: r.closing_time,
          service_name: r.service_name,
          max_guests_per_slot: r.max_guests_per_slot,
          max_reservations_per_slot: r.max_reservations_per_slot,
          slot_duration_minutes: r.slot_duration_minutes,
          booking_mode: r.booking_mode,
          shift_times: r.shift_times,
        })
        .eq("id", r.id);
    }
    setSaving(false);
    toast.success("Horarios guardados");
  }

  function addShiftTime(id: string) {
    setRows((p) => p.map((r) => r.id === id ? { ...r, shift_times: [...(r.shift_times ?? []), "13:00"] } : r));
  }
  function updateShiftTime(id: string, idx: number, value: string) {
    setRows((p) => p.map((r) => {
      if (r.id !== id) return r;
      const arr = [...(r.shift_times ?? [])];
      arr[idx] = value;
      return { ...r, shift_times: arr };
    }));
  }
  function removeShiftTime(id: string, idx: number) {
    setRows((p) => p.map((r) => {
      if (r.id !== id) return r;
      const arr = [...(r.shift_times ?? [])];
      arr.splice(idx, 1);
      return { ...r, shift_times: arr };
    }));
  }

  return (
    <div className="space-y-4">
      {DAY_NAMES.map((name, idx) => {
        const dayRows = rows.filter((r) => r.day_of_week === idx);
        return (
          <Card key={idx}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">{name}</CardTitle>
              <Button size="sm" variant="outline" onClick={() => addService(idx)}>
                <Plus className="h-4 w-4 mr-1" />Añadir servicio
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {dayRows.length === 0 && <p className="text-sm text-muted-foreground">Cerrado todo el día.</p>}
              {dayRows.map((r) => (
                <div key={r.id} className="border rounded-lg p-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                    <div className="space-y-1.5"><Label className="text-xs">Servicio</Label><Input value={r.service_name ?? ""} onChange={(e) => update(r.id, { service_name: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Apertura</Label><Input type="time" value={r.opening_time?.slice(0,5) ?? ""} onChange={(e) => update(r.id, { opening_time: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label className="text-xs">Cierre</Label><Input type="time" value={r.closing_time?.slice(0,5) ?? ""} onChange={(e) => update(r.id, { closing_time: e.target.value })} /></div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Switch checked={r.is_open} onCheckedChange={(c) => update(r.id, { is_open: c })} />
                        <span className="text-xs">Abierto</span>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => removeRow(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>

                  <Tabs value={r.booking_mode ?? "slots"} onValueChange={(v) => update(r.id, { booking_mode: v as "slots" | "shifts" })}>
                    <TabsList>
                      <TabsTrigger value="slots">Por franjas</TabsTrigger>
                      <TabsTrigger value="shifts">Por turnos</TabsTrigger>
                    </TabsList>

                    <TabsContent value="slots">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                        <div className="space-y-1.5"><Label className="text-xs">Franja (min)</Label><Input type="number" value={r.slot_duration_minutes ?? 30} onChange={(e) => update(r.id, { slot_duration_minutes: Number(e.target.value) })} /></div>
                        <div className="space-y-1.5"><Label className="text-xs">Máx. comensales/franja</Label><Input type="number" value={r.max_guests_per_slot ?? 0} onChange={(e) => update(r.id, { max_guests_per_slot: Number(e.target.value) })} /></div>
                        <div className="space-y-1.5"><Label className="text-xs">Máx. reservas/franja</Label><Input type="number" value={r.max_reservations_per_slot ?? 0} onChange={(e) => update(r.id, { max_reservations_per_slot: Number(e.target.value) })} /></div>
                      </div>
                    </TabsContent>

                    <TabsContent value="shifts">
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Horas de los turnos</Label>
                          <div className="flex flex-wrap gap-2">
                            {(r.shift_times ?? []).map((t, idx) => (
                              <div key={idx} className="flex items-center gap-1 border rounded-md pl-2 pr-1 py-1 bg-muted/40">
                                <span className="text-xs text-muted-foreground">Turno {idx + 1}</span>
                                <Input type="time" value={t?.slice(0,5) ?? ""} onChange={(e) => updateShiftTime(r.id, idx, e.target.value)} className="h-7 w-28 border-0 bg-transparent px-1" />
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeShiftTime(r.id, idx)}><X className="h-3.5 w-3.5" /></Button>
                              </div>
                            ))}
                            <Button size="sm" variant="outline" onClick={() => addShiftTime(r.id)}>
                              <Plus className="h-4 w-4 mr-1" />Añadir turno
                            </Button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">Las reservas solo se aceptarán a las horas exactas marcadas (ej: 13:00 y 15:00).</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">
                          <div className="space-y-1.5"><Label className="text-xs">Máx. comensales/turno</Label><Input type="number" value={r.max_guests_per_slot ?? 0} onChange={(e) => update(r.id, { max_guests_per_slot: Number(e.target.value) })} /></div>
                          <div className="space-y-1.5"><Label className="text-xs">Máx. reservas/turno</Label><Input type="number" value={r.max_reservations_per_slot ?? 0} onChange={(e) => update(r.id, { max_reservations_per_slot: Number(e.target.value) })} /></div>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
      <div className="flex justify-end">
        <Button onClick={saveAll} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Button>
      </div>
    </div>
  );
}