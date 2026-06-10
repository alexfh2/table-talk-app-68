import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { ScheduleSeason, ScheduleRow } from "@/lib/types";
import { findOverlappingSeason } from "@/lib/effectiveSchedule";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  restaurantId: string;
  seasons: ScheduleSeason[];
  scheduleRows: ScheduleRow[]; // all rows, to allow duplicating from base or another season
  editing?: ScheduleSeason | null;
  onSaved: (newSeasonId: string) => void;
}

export function SeasonDrawer({ open, onOpenChange, restaurantId, seasons, scheduleRows, editing, onSaved }: Props) {
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dupSource, setDupSource] = useState<string>("none"); // 'base' | seasonId | 'none'
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setStart(editing?.start_date ?? "");
    setEnd(editing?.end_date ?? "");
    setDupSource("none");
  }, [open, editing]);

  async function handleSave() {
    if (!name.trim() || !start || !end) {
      toast.error("Completa nombre, fecha inicio y fecha fin.");
      return;
    }
    if (end < start) {
      toast.error("La fecha fin debe ser posterior o igual a la de inicio.");
      return;
    }
    const conflict = findOverlappingSeason(seasons, start, end, editing?.id);
    if (conflict) {
      toast.error("Ya existe una temporada para parte de estas fechas. Ajusta el rango antes de guardar.");
      return;
    }
    setSaving(true);
    try {
      let seasonId = editing?.id ?? "";
      if (editing) {
        const { error } = await supabase
          .from("schedule_seasons")
          .update({ name, start_date: start, end_date: end })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("schedule_seasons")
          .insert({ restaurant_id: restaurantId, name, start_date: start, end_date: end, priority: 0 })
          .select()
          .single();
        if (error) throw error;
        seasonId = (data as ScheduleSeason).id;

        // Duplicate schedule rows if requested
        if (dupSource !== "none") {
          const sourceId = dupSource === "base" ? null : dupSource;
          const sourceRows = scheduleRows.filter((r) => (r.season_id ?? null) === sourceId);
          if (sourceRows.length) {
            const clones = sourceRows.map((r) => ({
              restaurant_id: restaurantId,
              day_of_week: r.day_of_week,
              is_open: r.is_open,
              opening_time: r.opening_time,
              closing_time: r.closing_time,
              service_name: r.service_name,
              max_guests_per_slot: r.max_guests_per_slot,
              max_reservations_per_slot: r.max_reservations_per_slot,
              slot_duration_minutes: r.slot_duration_minutes,
              booking_mode: r.booking_mode,
              shift_times: r.shift_times,
              service_period: r.service_period,
              season_id: seasonId,
            }));
            const { error: insErr } = await supabase.from("restaurant_schedule").insert(clones);
            if (insErr) throw insErr;
          }
        }
      }
      toast.success(editing ? "Temporada actualizada" : "Temporada creada");
      onSaved(seasonId);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar la temporada");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? "Editar temporada" : "Añadir temporada"}</SheetTitle>
          <SheetDescription>Esta temporada se aplicará entre las fechas seleccionadas.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Nombre de temporada</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Verano, Navidad…" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha inicio</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha fin</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {!editing && (
            <div className="space-y-1.5">
              <Label className="text-xs">Punto de partida</Label>
              <Select value={dupSource} onValueChange={setDupSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Empezar vacío</SelectItem>
                  <SelectItem value="base">Duplicar horario base</SelectItem>
                  {seasons.map((s) => (
                    <SelectItem key={s.id} value={s.id}>Duplicar de “{s.name}”</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Podrás editar los horarios después de crearla.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}