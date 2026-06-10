import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Reservation, Zone, RestaurantTable, ReservationStatus, ReservationChannel, ScheduleRow } from "@/lib/types";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Clock, Minus, Plus, X } from "lucide-react";

export type DrawerMode = "create" | "edit" | "review";

export function ReservationDrawer({
  open, onOpenChange, restaurantId, initial, mode, onSaved,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  restaurantId: string;
  initial?: Reservation | null;
  mode: DrawerMode;
  onSaved: () => void;
}) {
  const [v, setV] = useState<Partial<Reservation>>({});
  const [saving, setSaving] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [dayReservations, setDayReservations] = useState<Pick<Reservation, "reservation_time" | "party_size" | "status" | "id">[]>([]);

  useEffect(() => {
    if (!open || !restaurantId) return;
    supabase.from("restaurant_zones").select("*").eq("restaurant_id", restaurantId).order("sort_order")
      .then(({ data }) => setZones((data as Zone[]) ?? []));
    supabase.from("restaurant_tables").select("*").eq("restaurant_id", restaurantId).order("sort_order")
      .then(({ data }) => setTables((data as RestaurantTable[]) ?? []));
    supabase.from("restaurant_schedules").select("*").eq("restaurant_id", restaurantId)
      .then(({ data }) => setSchedules((data as ScheduleRow[]) ?? []));
  }, [open, restaurantId]);

  useEffect(() => {
    setV(initial ?? {
      customer_name: "", customer_phone: "",
      reservation_date: new Date().toISOString().slice(0, 10),
      reservation_time: "20:00", party_size: 2,
      status: "confirmed" as ReservationStatus,
      channel: "manual" as ReservationChannel,
      customer_notes: "", internal_notes: "", table_id: null,
    });
  }, [initial, open]);

  // Load same-day reservations to compute availability
  useEffect(() => {
    if (!open || !restaurantId || !v.reservation_date) return;
    supabase
      .from("reservations")
      .select("id, reservation_time, party_size, status")
      .eq("restaurant_id", restaurantId)
      .eq("reservation_date", v.reservation_date)
      .then(({ data }) => setDayReservations((data as any) ?? []));
  }, [open, restaurantId, v.reservation_date]);

  const time = (v.reservation_time ?? "20:00").slice(0, 5);
  const service = time < "17:00" ? "Mediodía" : "Noche";

  // Compute capacity for the selected slot
  const availability = useMemo(() => {
    if (!v.reservation_date || !time) return null;
    const dow = new Date(v.reservation_date + "T00:00:00").getDay();
    const candidates = schedules.filter(
      (s) => s.day_of_week === dow && s.is_open && s.opening_time && s.closing_time,
    );
    const row = candidates.find((s) => {
      const open = s.opening_time!.slice(0, 5);
      const close = s.closing_time!.slice(0, 5);
      return time >= open && time < close;
    });
    if (!row || !row.max_guests_per_slot) return null;
    const step = row.slot_duration_minutes ?? 30;
    const [h, m] = time.split(":").map(Number);
    const start = h * 60 + m;
    const slotStart = Math.floor((start - (row.opening_time ? Number(row.opening_time.slice(0, 2)) * 60 + Number(row.opening_time.slice(3, 5)) : 0)) / step) * step
      + (row.opening_time ? Number(row.opening_time.slice(0, 2)) * 60 + Number(row.opening_time.slice(3, 5)) : 0);
    const slotEnd = slotStart + step;
    const active = new Set(["pending", "confirmed", "modified", "requires_human"]);
    const occupied = dayReservations
      .filter((r) => {
        if (initial?.id && r.id === initial.id) return false;
        if (!active.has(r.status as string)) return false;
        const [rh, rm] = r.reservation_time.slice(0, 5).split(":").map(Number);
        const mins = rh * 60 + rm;
        return mins >= slotStart && mins < slotEnd;
      })
      .reduce((acc, r) => acc + (r.party_size ?? 0), 0);
    const free = Math.max(0, row.max_guests_per_slot - occupied);
    return { free, capacity: row.max_guests_per_slot, service };
  }, [schedules, dayReservations, v.reservation_date, time, initial?.id, service]);

  const partySize = Number(v.party_size ?? 0);
  const overCapacity = availability ? partySize > availability.free : false;

  async function save(extra?: Partial<Reservation>) {
    // Validation
    if (!v.customer_name || !v.customer_name.trim()) {
      toast.error("Introduce el nombre del cliente.");
      return;
    }
    if (!partySize || partySize < 1) {
      toast.error("Indica el número de personas.");
      return;
    }
    if (!v.reservation_date || !v.reservation_time) {
      toast.error("Selecciona fecha y hora.");
      return;
    }
    if (!initial && overCapacity) {
      toast.error("Esta franja no tiene plazas suficientes.");
      return;
    }
    setSaving(true);
    const payload = {
      ...v,
      ...extra,
      restaurant_id: restaurantId,
      // Defaults for manual creation
      status: (extra?.status ?? v.status ?? "confirmed") as ReservationStatus,
      channel: (v.channel ?? "manual") as ReservationChannel,
    } as any;
    const res = initial?.id
      ? await supabase.from("reservations").update(payload).eq("id", initial.id)
      : await supabase.from("reservations").insert(payload);
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(initial ? "Reserva actualizada." : "Reserva guardada.");
    onOpenChange(false);
    onSaved();
  }

  const isReview = mode === "review";
  const title = isReview ? "Revisar reserva creada por voz" : initial ? "Editar reserva" : "Nueva reserva";
  const subtitle = isReview ? "Pendiente de confirmación" : initial ? "Editar datos" : "Reserva manual";

  const missingPhone = !v.customer_phone || v.customer_phone.trim().length < 6;
  const canSubmit =
    !!(v.customer_name && v.customer_name.trim()) &&
    partySize >= 1 &&
    !!v.reservation_date &&
    !!v.reservation_time &&
    (initial ? true : !overCapacity);

  function bumpParty(delta: number) {
    const next = Math.min(30, Math.max(1, partySize + delta));
    setV({ ...v, party_size: next });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl bg-card p-0 flex flex-col gap-0"
      >
        {/* Fixed header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-6 py-4">
          <div>
            <h2 className="font-serif text-2xl tracking-tight leading-tight">{title}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

        {isReview && (
          <div className="mb-5 rounded-2xl border border-border bg-secondary/40 p-4 space-y-1.5 text-sm">
            <p><span className="text-muted-foreground">Nombre · </span><span className="font-medium">{v.customer_name || "—"}</span></p>
            <p><span className="text-muted-foreground">Personas · </span>{v.party_size}</p>
            <p><span className="text-muted-foreground">Fecha · </span>{v.reservation_date}</p>
            <p><span className="text-muted-foreground">Hora · </span>{(v.reservation_time ?? "").slice(0, 5)}</p>
            <p><span className="text-muted-foreground">Teléfono · </span>{v.customer_phone || <span className="text-terracotta">no facilitado</span>}</p>
            {v.customer_notes && <p><span className="text-muted-foreground">Nota · </span>{v.customer_notes}</p>}
          </div>
        )}

        {isReview && missingPhone && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-terracotta/30 bg-terracotta/10 px-3 py-2 text-sm text-terracotta">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <span>Falta teléfono del cliente.</span>
          </div>
        )}

        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datos esenciales</h3>
            <div className="space-y-1.5">
              <Label>Nombre del cliente <span className="text-terracotta">*</span></Label>
              <Input value={v.customer_name ?? ""} onChange={(e) => setV({ ...v, customer_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Personas <span className="text-terracotta">*</span></Label>
                <div className="flex items-stretch rounded-md border border-input bg-background overflow-hidden focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/15 transition-shadow">
                  <button
                    type="button"
                    onClick={() => bumpParty(-1)}
                    disabled={partySize <= 1}
                    className="px-3 text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 transition-colors"
                    aria-label="Restar persona"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={partySize || ""}
                    onChange={(e) => {
                      const n = Math.min(30, Math.max(1, Number(e.target.value) || 1));
                      setV({ ...v, party_size: n });
                    }}
                    className="flex-1 w-full text-center bg-transparent outline-none text-sm font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => bumpParty(1)}
                    disabled={partySize >= 30}
                    className="px-3 text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-40 transition-colors"
                    aria-label="Sumar persona"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input value={v.customer_phone ?? ""} onChange={(e) => setV({ ...v, customer_phone: e.target.value })} />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fecha y hora</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha <span className="text-terracotta">*</span></Label>
                <Input type="date" value={v.reservation_date ?? ""} onChange={(e) => setV({ ...v, reservation_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Hora <span className="text-terracotta">*</span></Label>
                <Input type="time" value={(v.reservation_time ?? "").slice(0, 5)} onChange={(e) => setV({ ...v, reservation_time: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Servicio detectado: <span className="font-medium text-foreground">{service}</span>
              </p>
              {availability ? (
                overCapacity ? (
                  <p className="text-xs text-terracotta font-medium">
                    Esta franja está completa. Elige otra hora.
                  </p>
                ) : availability.free <= Math.max(2, Math.ceil(availability.capacity * 0.1)) ? (
                  <p className="text-xs text-warning-foreground">
                    Quedan pocas plazas en esta franja ({availability.free} libres).
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {service} · <span className="text-foreground font-medium">{availability.free} plazas libres</span> en esta franja
                  </p>
                )
              ) : null}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Asignación</h3>
            <div className="space-y-1.5">
              <Label>Zona o mesa</Label>
              <Select value={v.table_id ?? "none"} onValueChange={(x) => setV({ ...v, table_id: x === "none" ? null : x })}>
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {zones.map(z => {
                    const zt = tables.filter(t => t.zone_id === z.id && t.is_active);
                    if (zt.length === 0) return null;
                    return (
                      <div key={z.id}>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{z.name}</div>
                        {zt.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.label} · {t.min_capacity}-{t.max_capacity} personas</SelectItem>
                        ))}
                      </div>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notas</h3>
            <div className="space-y-1.5">
              <Label>Notas del cliente</Label>
              <Textarea
                rows={2}
                placeholder="Ej. Prefiere terraza, sin gluten, carrito de bebé…"
                className="min-h-[72px]"
                value={v.customer_notes ?? ""}
                onChange={(e) => setV({ ...v, customer_notes: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notas internas</Label>
              <Textarea
                rows={2}
                placeholder="Ej. Cliente habitual, confirmar teléfono…"
                className="min-h-[72px]"
                value={v.internal_notes ?? ""}
                onChange={(e) => setV({ ...v, internal_notes: e.target.value })}
              />
            </div>
          </section>
        </div>
        </div>

        {/* Fixed footer */}
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {isReview ? (
            <>
              <Button variant="outline" onClick={() => save({ status: "pending" })}>Mantener pendiente</Button>
              <Button onClick={() => save({ status: "confirmed" })} disabled={saving}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirmar reserva
              </Button>
            </>
          ) : (
            <Button onClick={() => save()} disabled={saving || !canSubmit}>
              {saving ? "Guardando…" : "Guardar reserva"}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}