import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Sparkles,
  AlertCircle,
  Users,
  Pencil,
  ChevronDown,
  Phone,
  Mic,
  Hand,
  Check,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { listReservations, listSchedule } from "@/lib/queries";
import type { Reservation, ScheduleRow } from "@/lib/types";
import { ReservationDrawer, type DrawerMode } from "@/components/ReservationDrawer";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  modified: "Modificada",
  cancelled: "Cancelada",
  requires_human: "Requiere revisión",
  no_show: "No-show",
  seated: "Sentada",
};

const STATUS_CHIP: Record<string, string> = {
  confirmed: "bg-success/15 text-success border-success/30",
  pending: "bg-warning/25 text-foreground border-warning/40",
  requires_human: "bg-terracotta/15 text-terracotta border-terracotta/30",
  seated: "bg-info/15 text-info border-info/30",
  modified: "bg-info/15 text-info border-info/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  no_show: "bg-destructive/10 text-destructive border-destructive/25",
};

function StatusChip({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide",
        STATUS_CHIP[value] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {STATUS_LABEL[value] ?? value}
    </span>
  );
}

function formatHeaderDate(d: Date) {
  const s = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  return "Hoy, " + s.charAt(0).toUpperCase() + s.slice(1);
}

function nextSlots(schedule: ScheduleRow[], dayOfWeek: number) {
  const todays = schedule.filter((s) => s.day_of_week === dayOfWeek && s.is_open && s.opening_time && s.closing_time);
  if (todays.length === 0) return null;
  const now = new Date();
  const hour = now.getHours();
  const target = hour < 17 ? "lunch" : "dinner";
  const svc = todays.find((s) => s.service_period === target) ?? todays[0];
  return svc;
}

function buildSlotList(svc: ScheduleRow | null) {
  if (!svc || !svc.opening_time || !svc.closing_time) return [] as string[];
  const [oh, om] = svc.opening_time.split(":").map(Number);
  const [ch, cm] = svc.closing_time.split(":").map(Number);
  const start = oh * 60 + om;
  const end = ch * 60 + cm;
  const step = svc.slot_duration_minutes ?? 30;
  const out: string[] = [];
  for (let m = start; m <= end - step; m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

export default function RestaurantDashboard() {
  const { profile } = useAuth();
  const rid = profile?.restaurant_id;
  const [res, setRes] = useState<Reservation[]>([]);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [seatedLocal, setSeatedLocal] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerInitial, setDrawerInitial] = useState<Reservation | null>(null);

  async function reload() {
    if (!rid) return;
    const [r, s] = await Promise.all([listReservations(rid), listSchedule(rid)]);
    setRes(r);
    setSchedule(s);
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [rid]);

  const today = useMemo(() => new Date(), []);
  const todayISO = today.toISOString().slice(0, 10);
  const dow = today.getDay();

  const todayRes = useMemo(
    () => res
      .filter((r) => r.reservation_date === todayISO && r.status !== "cancelled")
      .sort((a, b) => a.reservation_time.localeCompare(b.reservation_time)),
    [res, todayISO],
  );

  const svc = useMemo(() => nextSlots(schedule, dow), [schedule, dow]);
  const slotList = useMemo(() => buildSlotList(svc), [svc]);
  const capacityPerSlot = svc?.max_guests_per_slot ?? 20;

  const occupancy = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of todayRes) {
      const key = r.reservation_time.slice(0, 5);
      map.set(key, (map.get(key) ?? 0) + r.party_size);
    }
    return map;
  }, [todayRes]);

  const totalGuests = todayRes.reduce((acc, r) => acc + r.party_size, 0);
  const pendingCount = todayRes.filter((r) => r.status === "pending").length;
  const reviewCount = todayRes.filter((r) => r.status === "requires_human").length;

  const reviewItems = todayRes.filter((r) => r.status === "requires_human");
  const voiceItems = res
    .filter((r) => r.channel === "future_voice")
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 3);

  function openCreate() {
    setDrawerMode("create"); setDrawerInitial(null); setDrawerOpen(true);
  }
  function openEdit(r: Reservation) {
    setDrawerMode("edit"); setDrawerInitial(r); setDrawerOpen(true);
  }
  function openReview(r: Reservation) {
    setDrawerMode("review"); setDrawerInitial(r); setDrawerOpen(true);
  }

  function markSeated(r: Reservation) {
    setSeatedLocal((s) => new Set(s).add(r.id));
    toast.success(`${r.customer_name} sentada`);
  }

  async function cancelReservation(r: Reservation) {
    const { error } = await supabase.from("reservations").update({ status: "cancelled" }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Reserva cancelada");
    reload();
  }

  if (!rid) {
    return (
      <AppShell variant="restaurant" title="Hoy">
        <p className="text-muted-foreground">Tu cuenta no está asociada a ningún restaurante.</p>
      </AppShell>
    );
  }

  // Group reservations by hour
  const grouped = new Map<string, Reservation[]>();
  for (const r of todayRes) {
    const hk = r.reservation_time.slice(0, 2) + ":00";
    if (!grouped.has(hk)) grouped.set(hk, []);
    grouped.get(hk)!.push(r);
  }
  const groupKeys = Array.from(grouped.keys()).sort();

  return (
    <AppShell variant="restaurant" title="Hoy">
      <div className="grid xl:grid-cols-[1fr_340px] gap-6 max-w-[1500px]">
        {/* MAIN COLUMN */}
        <div className="space-y-6 min-w-0">
          {/* Header */}
          <header className="flex flex-wrap items-end justify-between gap-4 pb-2">
            <div className="min-w-0">
              <h1 className="font-serif text-3xl sm:text-4xl tracking-tight text-foreground">
                {formatHeaderDate(today)}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {svc
                  ? `Servicio de ${svc.service_period === "lunch" ? "mediodía" : "noche"} · ${svc.opening_time?.slice(0, 5)}–${svc.closing_time?.slice(0, 5)}`
                  : "Restaurante cerrado hoy"}
                <span className="mx-2 text-border">·</span>
                <span className="inline-flex items-center gap-1.5 text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" /> Agente conectado
                </span>
              </p>
            </div>
            <Button onClick={openCreate} className="rounded-full px-5 shadow-none">
              <Plus className="h-4 w-4 mr-1.5" /> Nueva reserva
            </Button>
          </header>

          {/* Service summary */}
          <div className="rounded-2xl border border-border bg-card">
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border">
              {[
                { v: todayRes.length, l: "reservas" },
                { v: totalGuests, l: "comensales" },
                { v: pendingCount, l: "pendientes" },
                { v: reviewCount, l: "requieren revisión" },
              ].map((m, i) => (
                <div key={i} className="px-5 py-4">
                  <div className="font-serif text-3xl text-foreground tabular-nums">{m.v}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{m.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Occupancy line */}
          {slotList.length > 0 && (
            <div className="rounded-2xl border border-border bg-card px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ocupación del servicio</h2>
                <span className="text-[11px] text-muted-foreground">Capacidad {capacityPerSlot} pax / franja</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {slotList.map((t) => {
                  const used = occupancy.get(t) ?? 0;
                  const free = Math.max(0, capacityPerSlot - used);
                  const full = free === 0;
                  const tight = free > 0 && free <= 4;
                  return (
                    <div
                      key={t}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs flex items-center gap-2",
                        full && "border-terracotta/40 bg-terracotta/10 text-terracotta",
                        tight && "border-warning/40 bg-warning/15 text-foreground",
                        !full && !tight && "border-border bg-secondary/40 text-foreground",
                      )}
                    >
                      <span className="font-medium tabular-nums">{t}</span>
                      <span className="text-muted-foreground">·</span>
                      <span>{full ? "Completo" : `${free} plazas libres`}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Agenda */}
          <section className="rounded-2xl border border-border bg-card">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-serif text-lg">Agenda de reservas</h2>
              <span className="text-xs text-muted-foreground">{todayRes.length} en total</span>
            </div>
            {groupKeys.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                Aún no hay reservas para hoy.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {groupKeys.map((hk) => (
                  <div key={hk} className="grid grid-cols-[64px_1fr] gap-4 px-5 py-4">
                    <div className="pt-1.5">
                      <div className="font-serif text-2xl tabular-nums text-foreground/90">{hk}</div>
                    </div>
                    <div className="space-y-2">
                      {grouped.get(hk)!.map((r) => {
                        const seated = seatedLocal.has(r.id);
                        const review = r.status === "requires_human";
                        const note = review && !r.customer_phone ? "Falta teléfono" : r.customer_notes;
                        return (
                          <div
                            key={r.id}
                            className={cn(
                              "group rounded-xl border border-border bg-background/40 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2",
                              review && "border-terracotta/30 bg-terracotta/5",
                              seated && "border-info/30 bg-info/5",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs tabular-nums text-muted-foreground">{r.reservation_time.slice(0, 5)}</span>
                                <span className="font-medium text-foreground truncate">{r.customer_name}</span>
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Users className="h-3.5 w-3.5" /> {r.party_size} pax
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  {r.channel === "future_voice" ? <Mic className="h-3.5 w-3.5" /> : <Hand className="h-3.5 w-3.5" />}
                                  {r.channel === "future_voice" ? "Voz" : "Manual"}
                                </span>
                                {r.customer_phone && (
                                  <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <Phone className="h-3.5 w-3.5" /> {r.customer_phone}
                                  </span>
                                )}
                              </div>
                              {note && (
                                <p className={cn("mt-1 text-xs", review ? "text-terracotta" : "text-muted-foreground")}>
                                  {review && <AlertCircle className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />}
                                  {note}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusChip value={seated ? "seated" : r.status} />
                              {review && (
                                <Button size="sm" variant="outline" className="rounded-full border-terracotta/40 text-terracotta hover:bg-terracotta/10" onClick={() => openReview(r)}>
                                  Revisar
                                </Button>
                              )}
                              {!seated && !review && (
                                <Button size="sm" variant="outline" className="rounded-full" onClick={() => markSeated(r)}>
                                  <Check className="h-3.5 w-3.5 mr-1" /> Sentar
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="rounded-full" onClick={() => openEdit(r)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost" className="rounded-full px-2">
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEdit(r)}>Editar reserva</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => cancelReservation(r)} className="text-destructive">
                                    Cancelar reserva
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT PANEL */}
        <aside className="space-y-4">
          {/* Requiere revisión */}
          <div className="rounded-2xl border border-border bg-card">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-terracotta" />
              <h3 className="font-medium text-sm">Requiere revisión</h3>
              <span className="ml-auto text-xs text-muted-foreground">{reviewItems.length}</span>
            </div>
            <div className="p-3 space-y-2">
              {reviewItems.length === 0 && (
                <p className="px-2 py-3 text-xs text-muted-foreground">Sin reservas para revisar.</p>
              )}
              {reviewItems.map((r) => (
                <div key={r.id} className="rounded-xl border border-terracotta/30 bg-terracotta/5 px-3 py-2.5">
                  <p className="text-sm font-medium">{r.customer_name} <span className="text-muted-foreground font-normal">· {r.party_size} pax · {r.reservation_time.slice(0, 5)}</span></p>
                  <p className="text-xs text-terracotta mt-0.5">{!r.customer_phone ? "Falta teléfono" : (r.customer_notes ?? "Datos por confirmar")}</p>
                  <Button size="sm" variant="outline" className="mt-2 h-7 rounded-full border-terracotta/40 text-terracotta hover:bg-terracotta/10" onClick={() => openReview(r)}>
                    Revisar
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Disponibilidad rápida */}
          {slotList.length > 0 && (
            <div className="rounded-2xl border border-border bg-card">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="font-medium text-sm">Disponibilidad rápida</h3>
              </div>
              <div className="p-3 space-y-1">
                {slotList.slice(0, 6).map((t) => {
                  const used = occupancy.get(t) ?? 0;
                  const free = Math.max(0, capacityPerSlot - used);
                  const full = free === 0;
                  return (
                    <div key={t} className="flex items-center justify-between px-2 py-1.5 text-sm">
                      <span className="tabular-nums text-foreground">{t}</span>
                      <span className={cn("text-xs", full ? "text-terracotta" : free <= 4 ? "text-foreground" : "text-muted-foreground")}>
                        {full ? "Completo" : `${free} plazas libres`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Últimas reservas por voz */}
          <div className="rounded-2xl border border-border bg-card">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-medium text-sm">Últimas por voz</h3>
            </div>
            <div className="p-3 space-y-2">
              {voiceItems.length === 0 && (
                <p className="px-2 py-3 text-xs text-muted-foreground">El asistente aún no ha creado reservas.</p>
              )}
              {voiceItems.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openEdit(r)}
                  className="w-full text-left rounded-xl border border-border bg-background/30 px-3 py-2 hover:bg-secondary/50 transition"
                >
                  <p className="text-sm font-medium truncate">{r.customer_name}</p>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{r.reservation_date.slice(5)} · {r.reservation_time.slice(0, 5)}</span>
                    <StatusChip value={r.status} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <ReservationDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        restaurantId={rid}
        initial={drawerInitial}
        mode={drawerMode}
        onSaved={reload}
      />
    </AppShell>
  );
}