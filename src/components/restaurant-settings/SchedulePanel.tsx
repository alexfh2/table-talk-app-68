import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listSchedule, listSeasons, listExceptions } from "@/lib/queries";
import type { ScheduleRow, ScheduleSeason, ScheduleException } from "@/lib/types";
import { DAY_NAMES } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, X, Sun, Moon, Pencil } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { SeasonDrawer } from "./SeasonDrawer";
import { ExceptionDrawer } from "./ExceptionDrawer";
import { ExceptionsList } from "./ExceptionsList";

type Period = "lunch" | "dinner";
const PERIOD_LABEL: Record<Period, string> = { lunch: "Mediodía", dinner: "Noche" };
const PERIOD_DEFAULTS: Record<Period, { opening: string; closing: string }> = {
  lunch: { opening: "13:00", closing: "16:00" },
  dinner: { opening: "20:00", closing: "23:30" },
};

export function SchedulePanel({ restaurantId }: { restaurantId: string }) {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [seasons, setSeasons] = useState<ScheduleSeason[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  // null = base schedule, string = season id
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [seasonDrawer, setSeasonDrawer] = useState<{ open: boolean; editing: ScheduleSeason | null }>({ open: false, editing: null });
  const [exDrawer, setExDrawer] = useState<{ open: boolean; editing: ScheduleException | null }>({ open: false, editing: null });

  async function reload() {
    const [s, se, ex] = await Promise.all([
      listSchedule(restaurantId),
      listSeasons(restaurantId),
      listExceptions(restaurantId),
    ]);
    setRows(s);
    setSeasons(se);
    setExceptions(ex);
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const visibleRows = useMemo(
    () => rows.filter((r) => (r.season_id ?? null) === selectedSeasonId),
    [rows, selectedSeasonId],
  );
  const selectedSeason = seasons.find((s) => s.id === selectedSeasonId) ?? null;

  function update(id: string, patch: Partial<ScheduleRow>) {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function enableService(day: number, period: Period) {
    const def = PERIOD_DEFAULTS[period];
    const { data, error } = await supabase
      .from("restaurant_schedule")
      .insert({
        restaurant_id: restaurantId,
        day_of_week: day,
        is_open: true,
        opening_time: def.opening,
        closing_time: def.closing,
        service_name: PERIOD_LABEL[period],
        max_guests_per_slot: 30,
        max_reservations_per_slot: 10,
        slot_duration_minutes: 30,
        booking_mode: "shifts",
        shift_times: period === "lunch" ? ["13:30", "15:00"] : ["20:30", "22:30"],
        service_period: period,
        season_id: selectedSeasonId,
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
    // Warn about future reservations potentially affected by this schedule
    try {
      const today = new Date().toISOString().slice(0, 10);
      let q = supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .gte("reservation_date", today);
      const { count } = await q;
      if ((count ?? 0) > 0) {
        toast.warning("Hay reservas futuras en este periodo. Revisa si necesitan cambios.");
      }
    } catch {
      // ignore
    }
    for (const r of visibleRows) {
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
          service_period: r.service_period,
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

  function renderServiceBlock(r: ScheduleRow) {
    return (
      <div key={r.id} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
          <div className="space-y-1.5"><Label className="text-xs">Apertura</Label><Input type="time" value={r.opening_time?.slice(0,5) ?? ""} onChange={(e) => update(r.id, { opening_time: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Cierre</Label><Input type="time" value={r.closing_time?.slice(0,5) ?? ""} onChange={(e) => update(r.id, { closing_time: e.target.value })} /></div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Switch checked={r.is_open} onCheckedChange={(c) => update(r.id, { is_open: c })} />
              <span className="text-xs">Activo</span>
            </div>
            <Button size="icon" variant="ghost" onClick={() => removeRow(r.id)} title="Eliminar servicio"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        </div>

        <Tabs value={r.booking_mode ?? "slots"} onValueChange={(v) => update(r.id, { booking_mode: v as "slots" | "shifts" })}>
          <TabsList>
            <TabsTrigger value="shifts">Por turnos</TabsTrigger>
            <TabsTrigger value="slots">Por franjas</TabsTrigger>
          </TabsList>

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
                <p className="text-[11px] text-muted-foreground">Las reservas solo se aceptarán a las horas exactas marcadas (ej: 13:30 y 15:00).</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">
                <div className="space-y-1.5"><Label className="text-xs">Máximo de personas por turno</Label><Input type="number" value={r.max_guests_per_slot ?? 0} onChange={(e) => update(r.id, { max_guests_per_slot: Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Máximo de reservas por turno</Label><Input type="number" value={r.max_reservations_per_slot ?? 0} onChange={(e) => update(r.id, { max_reservations_per_slot: Number(e.target.value) })} /></div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="slots">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
              <div className="space-y-1.5"><Label className="text-xs">Cada cuánto aceptas reservas (min)</Label><Input type="number" value={r.slot_duration_minutes ?? 30} onChange={(e) => update(r.id, { slot_duration_minutes: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Máximo de personas por intervalo</Label><Input type="number" value={r.max_guests_per_slot ?? 0} onChange={(e) => update(r.id, { max_guests_per_slot: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Máximo de reservas por intervalo</Label><Input type="number" value={r.max_reservations_per_slot ?? 0} onChange={(e) => update(r.id, { max_reservations_per_slot: Number(e.target.value) })} /></div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  function renderPeriodSection(day: number, period: Period) {
    const row = visibleRows.find((r) => r.day_of_week === day && (r.service_period ?? "lunch") === period);
    const Icon = period === "lunch" ? Sun : Moon;
    return (
      <div className="border rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">{PERIOD_LABEL[period]}</span>
          </div>
          {!row && (
            <Button size="sm" variant="outline" onClick={() => enableService(day, period)}>
              <Plus className="h-4 w-4 mr-1" />Activar
            </Button>
          )}
        </div>
        {row ? renderServiceBlock(row) : (
          <p className="text-xs text-muted-foreground">Sin servicio de {PERIOD_LABEL[period].toLowerCase()}.</p>
        )}
      </div>
    );
  }

  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lunes a Domingo

  async function deleteSeason(s: ScheduleSeason) {
    if (!confirm(`¿Eliminar la temporada “${s.name}”? Se borrarán sus horarios.`)) return;
    const { error } = await supabase.from("schedule_seasons").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Temporada eliminada");
    if (selectedSeasonId === s.id) setSelectedSeasonId(null);
    reload();
  }

  async function deleteException(e: ScheduleException) {
    if (!confirm("¿Eliminar esta excepción?")) return;
    const { error } = await supabase.from("blocked_dates").delete().eq("id", e.id);
    if (error) return toast.error(error.message);
    toast.success("Excepción eliminada");
    reload();
  }

  const selectorValue = selectedSeasonId ?? "base";

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5 min-w-[220px] flex-1">
              <Label className="text-xs">Horario que estás editando</Label>
              <Select
                value={selectorValue}
                onValueChange={(v) => setSelectedSeasonId(v === "base" ? null : v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">Horario base</SelectItem>
                  {seasons.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      Temporada: {s.name} ({s.start_date} → {s.end_date})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" onClick={() => setSeasonDrawer({ open: true, editing: null })}>
              <Plus className="h-4 w-4 mr-1" /> Añadir temporada
            </Button>
            <Button size="sm" variant="outline" onClick={() => setExDrawer({ open: true, editing: null })}>
              <Plus className="h-4 w-4 mr-1" /> Añadir excepción
            </Button>
          </div>
          {!selectedSeason ? (
            <p className="text-xs text-muted-foreground">
              Estás editando el horario base. Se usa cuando no hay una temporada o excepción activa.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Esta temporada se aplicará entre las fechas seleccionadas.</span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setSeasonDrawer({ open: true, editing: selectedSeason })}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Editar fechas
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteSeason(selectedSeason)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" /> Eliminar temporada
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {DAY_ORDER.map((dayIdx) => (
        <Card key={dayIdx}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{DAY_NAMES[dayIdx]}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {renderPeriodSection(dayIdx, "lunch")}
            {renderPeriodSection(dayIdx, "dinner")}
          </CardContent>
        </Card>
      ))}
      <div className="flex justify-end">
        <Button onClick={saveAll} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Button>
      </div>

      <ExceptionsList
        exceptions={exceptions}
        onAdd={() => setExDrawer({ open: true, editing: null })}
        onEdit={(e) => setExDrawer({ open: true, editing: e })}
        onDelete={deleteException}
      />

      <SeasonDrawer
        open={seasonDrawer.open}
        onOpenChange={(v) => setSeasonDrawer((s) => ({ ...s, open: v }))}
        restaurantId={restaurantId}
        seasons={seasons}
        scheduleRows={rows}
        editing={seasonDrawer.editing}
        onSaved={(id) => {
          setSelectedSeasonId(id);
          reload();
        }}
      />
      <ExceptionDrawer
        open={exDrawer.open}
        onOpenChange={(v) => setExDrawer((s) => ({ ...s, open: v }))}
        restaurantId={restaurantId}
        editing={exDrawer.editing}
        onSaved={reload}
      />
    </div>
  );
}