import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { ScheduleException, ExceptionKind, ExceptionServicePeriod } from "@/lib/types";
import { EXCEPTION_KIND_LABELS } from "@/lib/types";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  restaurantId: string;
  editing?: ScheduleException | null;
  onSaved: () => void;
}

export function ExceptionDrawer({ open, onOpenChange, restaurantId, editing, onSaved }: Props) {
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<ExceptionKind>("closed");
  const [period, setPeriod] = useState<ExceptionServicePeriod>("both");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [maxGuests, setMaxGuests] = useState<string>("");
  const [maxRes, setMaxRes] = useState<string>("");
  const [slot, setSlot] = useState<string>("30");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(editing?.date ?? "");
    setKind((editing?.kind as ExceptionKind) ?? "closed");
    setPeriod((editing?.service_period as ExceptionServicePeriod) ?? "both");
    setStart(editing?.start_time?.slice(0, 5) ?? "");
    setEnd(editing?.end_time?.slice(0, 5) ?? "");
    setMaxGuests(editing?.max_guests_per_slot?.toString() ?? "");
    setMaxRes(editing?.max_reservations_per_slot?.toString() ?? "");
    setSlot(editing?.slot_duration_minutes?.toString() ?? "30");
    setNote(editing?.reason ?? "");
  }, [open, editing]);

  const needsHours = kind === "special_hours" || kind === "extra_service";

  async function handleSave() {
    if (!date) {
      toast.error("Selecciona una fecha.");
      return;
    }
    if (needsHours && (!start || !end)) {
      toast.error("Indica horario de apertura y cierre.");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        restaurant_id: restaurantId,
        date,
        kind,
        service_period: period,
        reason: note || null,
        is_full_day: kind === "closed" && period === "both",
        start_time: needsHours ? start : null,
        end_time: needsHours ? end : null,
        max_guests_per_slot: needsHours && maxGuests ? Number(maxGuests) : null,
        max_reservations_per_slot: needsHours && maxRes ? Number(maxRes) : null,
        slot_duration_minutes: needsHours && slot ? Number(slot) : null,
        booking_mode: needsHours ? "slots" : null,
      };

      // Warn about future reservations potentially affected
      const { data: futureRes } = await supabase
        .from("reservations")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("reservation_date", date)
        .limit(1);
      if ((futureRes ?? []).length > 0) {
        toast.warning("Hay reservas futuras en este periodo. Revisa si necesitan cambios.");
      }

      if (editing) {
        const { error } = await supabase.from("blocked_dates").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("blocked_dates").insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Excepción actualizada" : "Excepción creada");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar la excepción");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? "Editar excepción" : "Añadir excepción"}</SheetTitle>
          <SheetDescription>Las excepciones tienen prioridad sobre las temporadas.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Fecha</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ExceptionKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(EXCEPTION_KIND_LABELS) as ExceptionKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{EXCEPTION_KIND_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Servicios afectados</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as ExceptionServicePeriod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Mediodía y noche</SelectItem>
                <SelectItem value="lunch">Solo mediodía</SelectItem>
                <SelectItem value="dinner">Solo noche</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {needsHours && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Apertura</Label>
                  <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cierre</Label>
                  <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Personas/intervalo</Label>
                  <Input type="number" value={maxGuests} onChange={(e) => setMaxGuests(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Reservas/intervalo</Label>
                  <Input type="number" value={maxRes} onChange={(e) => setMaxRes(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Intervalo (min)</Label>
                  <Input type="number" value={slot} onChange={(e) => setSlot(e.target.value)} />
                </div>
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Nota interna</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Motivo, contexto…" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}