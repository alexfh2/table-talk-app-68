import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Plus,
  AlertCircle,
  Users,
  Pencil,
  ChevronDown,
  Phone,
  Mic,
  Hand,
  Check,
  CheckCircle2,
  Activity,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { listReservations } from "@/lib/queries";
import { loadScheduleContext, effectiveDay, type ScheduleContext } from "@/lib/effectiveSchedule";
import type { Reservation, ScheduleRow, Zone, RestaurantTable } from "@/lib/types";
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
  return "Hoy, " + s.charAt(0).toUpperCase() + s.slice(1).replace(",", "");
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

type ServiceFilter = "all" | "lunch" | "dinner";

function inService(time: string, kind: "lunch" | "dinner") {
  const t = time.slice(0, 5);
  if (kind === "lunch") return t >= "12:00" && t < "17:00";
  return t >= "17:00" || t < "06:00";
}

export default function RestaurantDashboard() {
  const { profile } = useAuth();
  const rid = profile?.restaurant_id;
  const [res, setRes] = useState<Reservation[]>([]);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [scheduleCtx, setScheduleCtx] = useState<ScheduleContext>({ schedule: [], seasons: [], exceptions: [] });
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [seatedLocal, setSeatedLocal] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerInitial, setDrawerInitial] = useState<Reservation | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  async function reload() {
    if (!rid) return;
    const [r, ctx, tRes, zRes] = await Promise.all([
      listReservations(rid),
      loadScheduleContext(rid),
      supabase.from("restaurant_tables").select("*").eq("restaurant_id", rid).order("sort_order"),
      supabase.from("restaurant_zones").select("*").eq("restaurant_id", rid).order("sort_order"),
    ]);
    setRes(r);
    setScheduleCtx(ctx);
    setSchedule(ctx.schedule);
    setTables((tRes.data as RestaurantTable[]) ?? []);
    setZones((zRes.data as Zone[]) ?? []);
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

  const todaySchedule = useMemo(
    () => effectiveDay(scheduleCtx, todayISO).services,
    [scheduleCtx, todayISO],
  );
  const lunchSvc = todaySchedule.find((s) => s.service_period === "lunch") ?? null;
  const dinnerSvc = todaySchedule.find((s) => s.service_period === "dinner") ?? null;

  const [filter, setFilter] = useState<ServiceFilter>("all");
  // Default to current service when both exist
  useEffect(() => {
    if (!lunchSvc && !dinnerSvc) return;
    // keep "all" — let the user choose
  }, [lunchSvc, dinnerSvc]);

  const visibleRes = useMemo(() => {
    if (filter === "all") return todayRes;
    return todayRes.filter((r) => inService(r.reservation_time, filter));
  }, [todayRes, filter]);

  const occupancy = useMemo(() => {
    const map = new Map<string, number>();
    // Helper: a reservation only counts if it falls within an active service today
    const inActiveService = (t: string) => {
      const time = t.slice(0, 5);
      return todaySchedule.some((s) => {
        const o = s.opening_time!.slice(0, 5);
        const c = s.closing_time!.slice(0, 5);
        return time >= o && time < c;
      });
    };
    for (const r of todayRes) {
      if (r.status === "requires_human" && !inActiveService(r.reservation_time)) continue;
      const key = r.reservation_time.slice(0, 5);
      map.set(key, (map.get(key) ?? 0) + r.party_size);
    }
    return map;
  }, [todayRes, todaySchedule]);

  const totalGuests = visibleRes.reduce((acc, r) => acc + r.party_size, 0);
  const pendingCount = visibleRes.filter((r) => r.status === "pending").length;
  const reviewCount = visibleRes.filter((r) => r.status === "requires_human").length;

  const reviewItems = todayRes.filter((r) => r.status === "requires_human");
  const activityItems = res
    .filter((r) =>
      r.channel === "future_voice" || r.status === "cancelled" || r.status === "requires_human",
    )
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 6);

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

  // ---- Helpers ----
  function groupByExactTime(list: Reservation[]) {
    const m = new Map<string, Reservation[]>();
    for (const r of list) {
      const hk = r.reservation_time.slice(0, 5);
      if (!m.has(hk)) m.set(hk, []);
      m.get(hk)!.push(r);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }

  function canSeat(r: Reservation) {
    if (r.status === "requires_human" || r.status === "cancelled" || r.status === "no_show") return false;
    const isToday = r.reservation_date === todayISO;
    if (!isToday) return false;
    const [h, m] = r.reservation_time.split(":").map(Number);
    const resMins = h * 60 + m;
    const nowMins = now.getHours() * 60 + now.getMinutes();
    // within service: lunch 12:00–17:00 / dinner 17:00–02:00
    const inLunch = nowMins >= 12 * 60 && nowMins < 17 * 60 && inService(r.reservation_time, "lunch");
    const inDinner = (nowMins >= 17 * 60 || nowMins < 6 * 60) && inService(r.reservation_time, "dinner");
    return resMins - nowMins <= 30 || inLunch || inDinner;
  }

  async function confirmAndCancel(r: Reservation) {
    if (!window.confirm(`¿Cancelar la reserva de ${r.customer_name}?`)) return;
    await cancelReservation(r);
  }

  function ReservationRow({ r }: { r: Reservation }) {
    const seated = seatedLocal.has(r.id);
    const review = r.status === "requires_human";
    const reviewReason = review
      ? (r.internal_notes || (!r.customer_phone ? "Falta teléfono" : "Revisar antes de confirmar"))
      : null;
    const isExpanded = expanded.has(r.id);
    const hasSecondary = !!(r.customer_phone || r.customer_notes || (r.internal_notes && !review));
    function toggle() {
      setExpanded((s) => {
        const n = new Set(s);
        n.has(r.id) ? n.delete(r.id) : n.add(r.id);
        return n;
      });
    }

    const CHANNEL_LABEL_SHORT: Record<string, string> = {
      manual: "Manual",
      whatsapp: "WhatsApp",
      future_voice: "Voz",
      external_calendar: "Externo",
    };

    const table = r.table_id ? tables.find((t) => t.id === r.table_id) : null;
    const zone = table?.zone_id ? zones.find((z) => z.id === table.zone_id) : null;
    const channelLabel = CHANNEL_LABEL_SHORT[r.channel] ?? r.channel;

    let assignmentText: string;
    if (table && zone) {
      assignmentText = `${table.label} · ${zone.name} · ${channelLabel}`;
    } else if (table) {
      assignmentText = `${table.label} · ${channelLabel}`;
    } else {
      assignmentText = `Sin asignar · ${channelLabel}`;
    }

    function isUpcomingUnassigned() {
      if (r.table_id) return false;
      const [h, m] = r.reservation_time.split(":").map(Number);
      const resMins = h * 60 + m;
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const diff = resMins - nowMins;
      return diff >= 0 && diff <= 60;
    }

    return (
      <div
        className={cn(
          "rounded-xl border border-border bg-background/30 px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5",
          review && "border-terracotta/30 bg-terracotta/5",
          seated && "border-info/30 bg-info/5",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs tabular-nums font-medium text-foreground">{r.reservation_time.slice(0, 5)}</span>
            <span className="font-medium text-foreground truncate">{r.customer_name}</span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> {r.party_size} {r.party_size === 1 ? "persona" : "personas"}
            </span>
          </div>
          <p className={cn(
            "text-xs mt-0.5",
            isUpcomingUnassigned() ? "text-warning-foreground" : "text-muted-foreground"
          )}>
            {assignmentText}
          </p>
          {review && reviewReason && (
            <p className="mt-1 text-xs text-terracotta">
              <AlertCircle className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
              {reviewReason}
            </p>
          )}
          {isExpanded && (
            <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
              {r.customer_phone && (
                <p className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {r.customer_phone}</p>
              )}
              {r.customer_notes && <p>Nota cliente: {r.customer_notes}</p>}
              {r.internal_notes && !review && <p>Nota interna: {r.internal_notes}</p>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusChip value={seated ? "seated" : r.status} />
          {review ? (
            <Button size="sm" variant="outline" className="rounded-full border-terracotta/40 text-terracotta hover:bg-terracotta/10" onClick={() => openReview(r)}>
              Revisar
            </Button>
          ) : !seated && canSeat(r) ? (
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => markSeated(r)}>
              <Check className="h-3.5 w-3.5 mr-1.5" /> Marcar sentado
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" className="rounded-full" onClick={() => openEdit(r)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="rounded-full px-2">
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {hasSecondary && (
                <DropdownMenuItem onClick={toggle}>
                  {isExpanded ? "Ocultar detalles" : "Ver detalles"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => openEdit(r)}>Editar reserva</DropdownMenuItem>
              <DropdownMenuItem onClick={() => confirmAndCancel(r)} className="text-destructive">
                Cancelar reserva
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  function ServiceBlock({
    label,
    kind,
    svc,
    items,
  }: {
    label: string;
    kind: "lunch" | "dinner";
    svc: ScheduleRow | null;
    items: Reservation[];
  }) {
    const groups = groupByExactTime(items);
    const range = svc?.opening_time && svc?.closing_time
      ? `${svc.opening_time.slice(0, 5)}–${svc.closing_time.slice(0, 5)}`
      : kind === "lunch" ? "13:00–16:00" : "20:00–23:30";
    const guests = items.reduce((a, r) => a + r.party_size, 0);
    return (
      <div>
        <div className="px-5 py-3 flex items-baseline justify-between bg-secondary/30 border-y border-border">
          <h3 className="font-serif text-base">{label}</h3>
          <span className="text-[11px] text-muted-foreground tabular-nums">{range} · {items.length} reservas · {guests} personas</span>
        </div>
        {groups.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-medium text-foreground">Sin reservas para el {label.toLowerCase()}</p>
            <p className="text-xs text-muted-foreground mt-1">Todavía no hay reservas entre {range}.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {groups.map(([hk, list]) => (
              <div key={hk} className="px-5 py-3 space-y-2">
                {list.map((r) => <ReservationRow key={r.id} r={r} />)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function OccupancyBlock({ svc, kind, label }: { svc: ScheduleRow | null; kind: "lunch" | "dinner"; label: string }) {
    const slots = buildSlotList(svc);
    if (slots.length === 0) return null;
    const cap = svc?.max_guests_per_slot ?? 20;
    const anyBooked = slots.some((t) => (occupancy.get(t) ?? 0) > 0);
    const allFull = slots.every((t) => cap - (occupancy.get(t) ?? 0) <= 0);
    let headline = label === "Noche" ? "Ocupación de la noche" : `Ocupación del ${label.toLowerCase()}`;
    let sub = "Todas las franjas disponibles.";
    if (allFull) { headline = `${label} completo`; sub = "Sin franjas libres."; }
    else if (anyBooked) { sub = "Disponibilidad por franja."; }
    else { headline = `${label} tranquilo`; }
    return (
      <div className="rounded-2xl border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div>
            <p className="font-serif text-base text-foreground">{headline}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
          <span className="text-[11px] text-muted-foreground">Capacidad: {cap} personas por franja</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {slots.map((t) => {
            const free = Math.max(0, cap - (occupancy.get(t) ?? 0));
            const full = free === 0;
            const tight = free > 0 && free <= 4;
            return (
              <span
                key={t}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] tabular-nums",
                  full && "border-terracotta/40 bg-terracotta/10 text-terracotta",
                  tight && "border-warning/40 bg-warning/15 text-foreground",
                  !full && !tight && "border-border bg-secondary/30 text-muted-foreground",
                )}
              >
                <span className="text-foreground/80 font-medium">{t}</span>
                <span className="mx-1.5 opacity-50">·</span>
                {full ? "Completo" : `${free} libres`}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  function DayStatusBlock() {
    const lunchGuests = lunchItems.reduce((a, r) => a + r.party_size, 0);
    const dinnerGuests = dinnerItems.reduce((a, r) => a + r.party_size, 0);
    return (
      <div className="rounded-2xl border border-border bg-card px-5 py-4">
        <p className="font-serif text-base text-foreground mb-2">Estado del día</p>
        <div className="space-y-1 text-sm">
          <p className="flex items-baseline gap-2">
            <span className="text-muted-foreground w-20">Mediodía</span>
            <span className="tabular-nums">{lunchItems.length} reservas</span>
            <span className="text-muted-foreground">·</span>
            <span className="tabular-nums">{lunchGuests} personas</span>
          </p>
          <p className="flex items-baseline gap-2">
            <span className="text-muted-foreground w-20">Noche</span>
            <span className="tabular-nums">{dinnerItems.length} reservas</span>
            <span className="text-muted-foreground">·</span>
            <span className="tabular-nums">{dinnerGuests} personas</span>
          </p>
        </div>
      </div>
    );
  }

  const summary = [
    { v: visibleRes.length, l: visibleRes.length === 1 ? "reserva" : "reservas" },
    { v: totalGuests, l: totalGuests === 1 ? "persona" : "personas" },
    { v: pendingCount, l: pendingCount === 1 ? "pendiente" : "pendientes" },
  ];

  const lunchItems = todayRes.filter((r) => inService(r.reservation_time, "lunch"));
  const dinnerItems = todayRes.filter((r) => inService(r.reservation_time, "dinner"));

  const filterOptions: { v: ServiceFilter; label: string }[] = [
    { v: "all", label: "Todo el día" },
    { v: "lunch", label: "Mediodía" },
    { v: "dinner", label: "Noche" },
  ];

  return (
    <AppShell variant="restaurant" title="Hoy">
      <div className="grid xl:grid-cols-[1fr_340px] gap-6 max-w-[1500px]">
        {/* MAIN COLUMN */}
        <div className="space-y-5 min-w-0">
          {/* Header */}
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <h1 className="font-serif text-[28px] sm:text-[32px] leading-tight tracking-tight text-foreground">
                {formatHeaderDate(today)}
              </h1>
              <div className="flex flex-wrap items-center gap-3">
                <div role="tablist" className="inline-flex rounded-full border border-border bg-secondary/30 p-0.5">
                  {filterOptions.map((o) => (
                    <button
                      key={o.v}
                      role="tab"
                      aria-selected={filter === o.v}
                      onClick={() => setFilter(o.v)}
                      className={cn(
                        "px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors",
                        filter === o.v
                          ? "bg-card text-foreground shadow-[0_1px_0_hsl(var(--border))]"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs text-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" /> Agente conectado
                </span>
              </div>
            </div>
            <Button onClick={openCreate} className="rounded-full px-5 shadow-none">
              <Plus className="h-4 w-4 mr-1.5" /> Nueva reserva
            </Button>
          </header>

          {/* Editorial summary */}
          <div className="rounded-2xl border border-border bg-card px-5 py-4">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              {summary.map((m, i) => (
                <div key={i} className="flex items-baseline gap-2">
                  <span className="font-serif text-3xl tabular-nums text-foreground leading-none">{m.v}</span>
                  <span className="text-xs text-muted-foreground">{m.l}</span>
                </div>
              ))}
              <div className="flex items-baseline gap-2 ml-auto">
                {reviewCount === 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Hoy revisado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-terracotta">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {reviewCount === 1 ? "1 requiere revisión" : `${reviewCount} requieren revisión`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Occupancy */}
          {filter === "all" && (lunchSvc || dinnerSvc) && <DayStatusBlock />}
          {filter === "lunch" && lunchSvc && (
            <OccupancyBlock svc={lunchSvc} kind="lunch" label="Mediodía" />
          )}
          {filter === "dinner" && dinnerSvc && (
            <OccupancyBlock svc={dinnerSvc} kind="dinner" label="Noche" />
          )}

          {/* Agenda */}
          <section className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between">
              <h2 className="font-serif text-lg">Agenda</h2>
              <span className="text-xs text-muted-foreground">{visibleRes.length} {visibleRes.length === 1 ? "reserva" : "reservas"} en total</span>
            </div>
            {filter === "all" ? (
              <>
                <ServiceBlock label="Mediodía" kind="lunch" svc={lunchSvc} items={lunchItems} />
                <ServiceBlock label="Noche" kind="dinner" svc={dinnerSvc} items={dinnerItems} />
              </>
            ) : filter === "lunch" ? (
              <ServiceBlock label="Mediodía" kind="lunch" svc={lunchSvc} items={lunchItems} />
            ) : (
              <ServiceBlock label="Noche" kind="dinner" svc={dinnerSvc} items={dinnerItems} />
            )}
          </section>
        </div>

        {/* RIGHT PANEL */}
        <aside className="space-y-4">
          {/* Revisión */}
          <div className="rounded-2xl border border-border bg-card">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              {reviewItems.length === 0 ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <AlertCircle className="h-4 w-4 text-terracotta" />
              )}
              <h3 className="font-medium text-sm">
                {reviewItems.length === 0 ? "Hoy revisado" : "Necesita revisión"}
              </h3>
              {reviewItems.length > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">{reviewItems.length}</span>
              )}
            </div>
            <div className="p-3 space-y-2">
              {reviewItems.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  No hay reservas de hoy pendientes de comprobar.
                </p>
              ) : (
                <>
                  <p className="px-2 pt-1 pb-1 text-xs text-muted-foreground">
                    {reviewItems.length === 1
                      ? "1 reserva de hoy necesita confirmación."
                      : `${reviewItems.length} reservas de hoy necesitan confirmación.`}
                  </p>
                  {reviewItems.map((r) => (
                    <div key={r.id} className="rounded-xl border border-terracotta/30 bg-terracotta/5 px-3 py-2.5">
                      <p className="text-sm font-medium">
                        {r.customer_name}
                        <span className="text-muted-foreground font-normal"> · {r.party_size} {r.party_size === 1 ? "persona" : "personas"} · {r.reservation_time.slice(0, 5)}</span>
                      </p>
                      <p className="text-xs text-terracotta mt-0.5">
                        {r.internal_notes || (!r.customer_phone ? "Falta teléfono" : "Datos por confirmar")}
                      </p>
                      <Button size="sm" variant="outline" className="mt-2 h-7 rounded-full border-terracotta/40 text-terracotta hover:bg-terracotta/10" onClick={() => openReview(r)}>
                        Revisar
                      </Button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Huecos disponibles */}
          {(filter === "all" ? (lunchSvc || dinnerSvc) : true) && (
            <div className="rounded-2xl border border-border bg-card">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="font-medium text-sm">Huecos disponibles</h3>
              </div>
              <div className="p-3 space-y-3">
                {[
                  { svc: lunchSvc, label: "Mediodía", show: filter === "all" || filter === "lunch" },
                  { svc: dinnerSvc, label: "Noche", show: filter === "all" || filter === "dinner" },
                ]
                  .filter((x) => x.show)
                  .map(({ svc: s, label }) => {
                    if (!s) {
                      return (
                        <p key={label} className="px-2 text-xs text-muted-foreground">
                          {label} · Sin servicio
                        </p>
                      );
                    }
                    const slots = buildSlotList(s);
                    const cap = s.max_guests_per_slot ?? 20;
                    return (
                      <div key={label}>
                        <p className="px-2 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
                        {slots.slice(0, 6).map((t) => {
                          const free = Math.max(0, cap - (occupancy.get(t) ?? 0));
                          const full = free === 0;
                          return (
                            <div key={t} className="flex items-center justify-between px-2 py-1.5 text-sm">
                              <span className="tabular-nums text-foreground">{t}</span>
                              <span className={cn("text-xs", full ? "text-terracotta" : free <= 4 ? "text-foreground" : "text-muted-foreground")}>
                                {full ? "Completo" : `${free} libres`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Actividad del agente */}
          <div className="rounded-2xl border border-border bg-card">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="font-medium text-sm">Actividad reciente</h3>
            </div>
            <div className="p-3 space-y-2">
              {activityItems.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">Sin actividad reciente.</p>
              ) : (
                activityItems.map((r) => {
                  const isTodayActivity = r.reservation_date === todayISO;
                  return (
                    <button
                      key={r.id}
                      onClick={() => (r.status === "requires_human" ? openReview(r) : openEdit(r))}
                      className="w-full text-left rounded-xl border border-border bg-background/30 px-3 py-2 hover:bg-secondary/40 transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{r.customer_name}</p>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                        <StatusChip value={r.status} />
                        <span className="tabular-nums">
                          Para {r.reservation_date.slice(8, 10)}/{r.reservation_date.slice(5, 7)} · {r.reservation_time.slice(0, 5)}
                        </span>
                        {!isTodayActivity && (
                          <span className="inline-flex items-center rounded-full border border-border bg-secondary/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            Otro día
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        {r.channel === "future_voice" ? <Mic className="h-3 w-3" /> : <Hand className="h-3 w-3" />}
                        {r.channel === "future_voice" ? "Voz" : r.channel === "manual" ? "Manual" : r.channel === "whatsapp" ? "WhatsApp" : r.channel === "external_calendar" ? "Calendario externo" : r.channel}
                      </div>
                    </button>
                  );
                })
              )}
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