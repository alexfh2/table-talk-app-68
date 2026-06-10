import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Reservation, Zone, RestaurantTable, ReservationStatus, ReservationChannel } from "@/lib/types";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";

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

  useEffect(() => {
    if (!open || !restaurantId) return;
    supabase.from("restaurant_zones").select("*").eq("restaurant_id", restaurantId).order("sort_order")
      .then(({ data }) => setZones((data as Zone[]) ?? []));
    supabase.from("restaurant_tables").select("*").eq("restaurant_id", restaurantId).order("sort_order")
      .then(({ data }) => setTables((data as RestaurantTable[]) ?? []));
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

  const service = (v.reservation_time ?? "20:00") < "17:00" ? "Mediodía" : "Noche";

  async function save(extra?: Partial<Reservation>) {
    setSaving(true);
    const payload = { ...v, ...extra, restaurant_id: restaurantId } as any;
    const res = initial?.id
      ? await supabase.from("reservations").update(payload).eq("id", initial.id)
      : await supabase.from("reservations").insert(payload);
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(initial ? "Reserva actualizada" : "Reserva creada");
    onOpenChange(false);
    onSaved();
  }

  const isReview = mode === "review";
  const title = isReview ? "Revisar reserva creada por voz" : initial ? "Editar reserva" : "Nueva reserva";

  const missingPhone = !v.customer_phone || v.customer_phone.trim().length < 6;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto bg-card">
        <SheetHeader className="text-left">
          <SheetTitle className="font-serif text-2xl tracking-tight">{title}</SheetTitle>
          {isReview && (
            <SheetDescription>El agente entendió los siguientes datos. Revisa y confirma.</SheetDescription>
          )}
        </SheetHeader>

        {isReview && (
          <div className="mt-4 rounded-2xl border border-border bg-secondary/40 p-4 space-y-1.5 text-sm">
            <p><span className="text-muted-foreground">Nombre · </span><span className="font-medium">{v.customer_name || "—"}</span></p>
            <p><span className="text-muted-foreground">Personas · </span>{v.party_size}</p>
            <p><span className="text-muted-foreground">Fecha · </span>{v.reservation_date}</p>
            <p><span className="text-muted-foreground">Hora · </span>{(v.reservation_time ?? "").slice(0, 5)}</p>
            <p><span className="text-muted-foreground">Teléfono · </span>{v.customer_phone || <span className="text-terracotta">no facilitado</span>}</p>
            {v.customer_notes && <p><span className="text-muted-foreground">Nota · </span>{v.customer_notes}</p>}
          </div>
        )}

        {isReview && missingPhone && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-terracotta/30 bg-terracotta/10 px-3 py-2 text-sm text-terracotta">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <span>Falta teléfono del cliente.</span>
          </div>
        )}

        <div className="mt-6 space-y-5">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datos esenciales</h3>
            <div className="space-y-1.5">
              <Label>Nombre del cliente</Label>
              <Input value={v.customer_name ?? ""} onChange={(e) => setV({ ...v, customer_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Personas</Label>
                <Input type="number" min={1} value={v.party_size ?? 2} onChange={(e) => setV({ ...v, party_size: Number(e.target.value) })} />
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
                <Label>Fecha</Label>
                <Input type="date" value={v.reservation_date ?? ""} onChange={(e) => setV({ ...v, reservation_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Hora</Label>
                <Input type="time" value={(v.reservation_time ?? "").slice(0, 5)} onChange={(e) => setV({ ...v, reservation_time: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Servicio detectado: <span className="font-medium text-foreground">{service}</span>
            </p>
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
                          <SelectItem key={t.id} value={t.id}>{t.label} · {t.min_capacity}-{t.max_capacity} pax</SelectItem>
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
              <Textarea rows={2} value={v.customer_notes ?? ""} onChange={(e) => setV({ ...v, customer_notes: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Notas internas</Label>
              <Textarea rows={2} value={v.internal_notes ?? ""} onChange={(e) => setV({ ...v, internal_notes: e.target.value })} />
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-end gap-2 border-t bg-card px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {isReview ? (
            <>
              <Button variant="outline" onClick={() => save({ status: "pending" })}>Mantener pendiente</Button>
              <Button onClick={() => save({ status: "confirmed" })} disabled={saving}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirmar reserva
              </Button>
            </>
          ) : (
            <Button onClick={() => save()} disabled={saving}>{saving ? "Guardando…" : "Guardar reserva"}</Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}