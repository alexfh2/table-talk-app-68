import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { listReservations, listSchedule } from "@/lib/queries";
import type { Reservation, RestaurantTable, Zone, ScheduleRow } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { ReservationDrawer, type DrawerMode } from "@/components/ReservationDrawer";
import { parseReviewReasonsFromNotes } from "@/lib/reservationRules";
import { addDays, format, startOfWeek, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";

const ACTIVE_STATUS = new Set(["pending", "confirmed", "modified", "requires_human"]);

function toMin(t: string) {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}
function fromMin(m: number) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

interface DaySummary {
  date: Date;
  ds: string;
  closed: boolean;
  services: { period: "lunch" | "dinner"; row: ScheduleRow; reservations: Reservation[]; people: number }[];
  total: number;
  people: number;
  needsReview: number;
  pending: number;
}

function summarizeDay(date: Date, schedules: ScheduleRow[], reservations: Reservation[]): DaySummary {
  const ds = format(date, "yyyy-MM-dd");
  const dow = date.getDay();
  const rows = schedules.filter((s) => s.day_of_week === dow && s.is_open && s.opening_time && s.closing_time);
  const dayRes = reservations.filter((r) => r.reservation_date === ds);
  const services = rows
    .sort((a, b) => (a.opening_time! < b.opening_time! ? -1 : 1))
    .map((row) => {
      const open = row.opening_time!.slice(0, 5);
      const close = row.closing_time!.slice(0, 5);
      const inService = dayRes.filter((r) => {
        const t = r.reservation_time.slice(0, 5);
        return t >= open && t < close;
      });
      const active = inService.filter((r) => ACTIVE_STATUS.has(r.status));
      const people = active.reduce((a, r) => a + (r.party_size ?? 0), 0);
      return { period: row.service_period, row, reservations: inService, people };
    });
  const activeAll = dayRes.filter((r) => ACTIVE_STATUS.has(r.status));
  return {
    date,
    ds,
    closed: services.length === 0,
    services,
    total: activeAll.length,
    people: activeAll.reduce((a, r) => a + (r.party_size ?? 0), 0),
    needsReview: dayRes.filter((r) => r.status === "requires_human").length,
    pending: dayRes.filter((r) => r.status === "pending").length,
  };
}

function periodLabel(p: "lunch" | "dinner") {
  return p === "lunch" ? "Mediodía" : "Noche";
}

export default function RestaurantCalendar() {
  const { profile } = useAuth();
  const rid = profile?.restaurant_id ?? "";
  const [view, setView] = useState<"day" | "week">("week");
  const [date, setDate] = useState(new Date());
  const [items, setItems] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [drawer, setDrawer] = useState<{ open: boolean; mode: DrawerMode; initial: Reservation | null }>({
    open: false, mode: "create", initial: null,
  });

  function reload() {
    if (!rid) return;
    listReservations(rid).then(setItems);
    supabase.from("restaurant_tables").select("*").eq("restaurant_id", rid).then(({ data }) => setTables((data ?? []) as RestaurantTable[]));
    supabase.from("restaurant_zones").select("*").eq("restaurant_id", rid).then(({ data }) => setZones((data ?? []) as Zone[]));
    listSchedule(rid).then(setSchedules).catch(() => setSchedules([]));
  }
  useEffect(reload, [rid]);

  function tableLabel(id: string | null): string | null {
    if (!id) return null;
    const t = tables.find((x) => x.id === id);
    if (!t) return null;
    const z = zones.find((z) => z.id === t.zone_id);
    return z ? `${t.label} · ${z.name}` : t.label;
  }

  function openReservation(r: Reservation) {
    setDrawer({ open: true, mode: r.status === "requires_human" ? "review" : "edit", initial: r });
  }
  function openCreate(prefill?: { date?: string; time?: string }) {
    const initial = prefill
      ? ({
          id: "" as any,
          restaurant_id: rid,
          customer_name: "",
          customer_phone: "",
          reservation_date: prefill.date ?? format(date, "yyyy-MM-dd"),
          reservation_time: (prefill.time ?? "20:00") + ":00",
          party_size: 2,
          status: "confirmed",
          channel: "manual",
          customer_notes: "",
          internal_notes: "",
          table_id: null,
          created_at: "",
          updated_at: "",
        } as any)
      : null;
    setDrawer({ open: true, mode: "create", initial });
  }

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date, { weekStartsOn: 1 }), i)),
    [date],
  );

  const weekSummaries = useMemo(
    () => weekDays.map((d) => summarizeDay(d, schedules, items)),
    [weekDays, schedules, items],
  );
  const daySummary = useMemo(() => summarizeDay(date, schedules, items), [date, schedules, items]);

  const headerLabel =
    view === "day"
      ? format(date, "d MMM yyyy", { locale: es })
      : `Semana del ${format(weekDays[0], "d", { locale: es })} al ${format(weekDays[6], "d MMM", { locale: es })}`;

  return (
    <AppShell variant="restaurant" title="Calendario">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          <Button size="sm" variant={view === "day" ? "default" : "ghost"} className="rounded-none" onClick={() => setView("day")}>Día</Button>
          <Button size="sm" variant={view === "week" ? "default" : "ghost"} className="rounded-none" onClick={() => setView("week")}>Semana</Button>
        </div>
        <div className="flex items-center gap-1 ml-1">
          <Button size="icon" variant="ghost" onClick={() => setDate(addDays(date, view === "day" ? -1 : -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium px-2 min-w-[180px] text-center capitalize">{headerLabel}</span>
          <Button size="icon" variant="ghost" onClick={() => setDate(addDays(date, view === "day" ? 1 : 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Button size="sm" variant="outline" onClick={() => setDate(new Date())}>Hoy</Button>
        <div className="ml-auto">
          <Button onClick={() => openCreate()}><Plus className="h-4 w-4 mr-1" />Nueva reserva</Button>
        </div>
      </div>

      {view === "week" ? (
        <WeekView
          summaries={weekSummaries}
          onPickDay={(d) => { setDate(d); setView("day"); }}
        />
      ) : (
        <DayView
          summary={daySummary}
          allSchedulesForDow={schedules.filter((s) => s.day_of_week === date.getDay())}
          tableLabel={tableLabel}
          onOpenReservation={openReservation}
          onCreateAt={(time) => openCreate({ date: format(date, "yyyy-MM-dd"), time })}
        />
      )}

      <ReservationDrawer
        open={drawer.open}
        onOpenChange={(b) => setDrawer((d) => ({ ...d, open: b }))}
        restaurantId={rid}
        initial={drawer.initial}
        mode={drawer.mode}
        onSaved={reload}
      />
    </AppShell>
  );
}

function WeekView({ summaries, onPickDay }: { summaries: DaySummary[]; onPickDay: (d: Date) => void }) {
  const today = new Date();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
      {summaries.map((s) => {
        const isToday = isSameDay(s.date, today);
        return (
          <button
            key={s.ds}
            onClick={() => onPickDay(s.date)}
            className={`text-left rounded-lg border bg-card hover:bg-accent/30 transition-colors p-3 flex flex-col gap-2 min-h-[160px] ${
              isToday ? "border-primary/60 ring-1 ring-primary/30" : "border-border"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground capitalize">
                  {format(s.date, "EEE", { locale: es })}
                </div>
                <div className="text-lg font-semibold leading-tight">
                  {format(s.date, "d", { locale: es })}
                </div>
              </div>
              {s.needsReview > 0 && (
                <Badge className="bg-terracotta/15 text-terracotta border-terracotta/30 hover:bg-terracotta/20">
                  {s.needsReview} {s.needsReview === 1 ? "revisión" : "revisiones"}
                </Badge>
              )}
            </div>

            {s.closed ? (
              <div className="text-sm text-muted-foreground italic mt-2">Sin servicio</div>
            ) : (
              <>
                <div className="text-xs text-muted-foreground">
                  {s.total} {s.total === 1 ? "reserva" : "reservas"} · {s.people} personas
                </div>
                <div className="flex flex-col gap-1 mt-1">
                  {s.services.map((sv) => {
                    const cap = sv.row.max_guests_per_slot ?? null;
                    const active = sv.reservations.filter((r) => ACTIVE_STATUS.has(r.status));
                    const count = active.length;
                    return (
                      <div key={sv.row.id} className="text-xs">
                        <div className="font-medium text-foreground">
                          {periodLabel(sv.period)}
                        </div>
                        <div className="text-muted-foreground">
                          {count} {count === 1 ? "reserva" : "reservas"} · {sv.people} personas
                          {cap ? ` · cap. ${cap}/franja` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {s.pending > 0 && (
                  <div className="text-xs text-amber-700 mt-auto">{s.pending} pendiente{s.pending === 1 ? "" : "s"}</div>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

function DayView({
  summary, allSchedulesForDow, tableLabel, onOpenReservation, onCreateAt,
}: {
  summary: DaySummary;
  allSchedulesForDow: ScheduleRow[];
  tableLabel: (id: string | null) => string | null;
  onOpenReservation: (r: Reservation) => void;
  onCreateAt: (time: string) => void;
}) {
  const reviewedToday = summary.needsReview === 0;
  const inactivePeriods = (["lunch", "dinner"] as const).filter(
    (p) => !summary.services.some((s) => s.period === p) &&
      !allSchedulesForDow.some((s) => s.service_period === p && s.is_open),
  );

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4">
          <div className="text-base font-semibold capitalize">
            {format(summary.date, "EEEE d 'de' MMMM", { locale: es })}
          </div>
          {summary.closed ? (
            <div className="text-sm text-muted-foreground mt-1">No hay servicio configurado para este día.</div>
          ) : (
            <div className="text-sm text-muted-foreground mt-1">
              {summary.total} {summary.total === 1 ? "reserva" : "reservas"} · {summary.people} personas
              {summary.pending > 0 && ` · ${summary.pending} pendiente${summary.pending === 1 ? "" : "s"}`}
              {summary.needsReview > 0
                ? ` · ${summary.needsReview} requiere${summary.needsReview === 1 ? "" : "n"} revisión`
                : reviewedToday ? " · Todo revisado" : ""}
            </div>
          )}
        </CardContent>
      </Card>

      {summary.closed && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          No hay servicio configurado para este día.
        </CardContent></Card>
      )}

      {summary.services.map((sv) => (
        <ServiceBlock
          key={sv.row.id}
          service={sv}
          tableLabel={tableLabel}
          onOpenReservation={onOpenReservation}
          onCreateAt={onCreateAt}
        />
      ))}

      {!summary.closed && inactivePeriods.length > 0 && (
        <div className="text-xs text-muted-foreground pl-1">
          {inactivePeriods.map((p) => `${periodLabel(p)} · Sin servicio`).join(" · ")}
        </div>
      )}
    </div>
  );
}

function ServiceBlock({
  service, tableLabel, onOpenReservation, onCreateAt,
}: {
  service: DaySummary["services"][number];
  tableLabel: (id: string | null) => string | null;
  onOpenReservation: (r: Reservation) => void;
  onCreateAt: (time: string) => void;
}) {
  const { row, reservations, people } = service;
  const open = row.opening_time!.slice(0, 5);
  const close = row.closing_time!.slice(0, 5);
  const step = row.slot_duration_minutes ?? 30;
  const capacity = row.max_guests_per_slot ?? 0;
  const lowThreshold = 4;

  const slots: string[] = [];
  for (let m = toMin(open); m + step <= toMin(close); m += step) slots.push(fromMin(m));

  const activeCount = reservations.filter((r) => ACTIVE_STATUS.has(r.status)).length;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
          <div className="text-sm font-medium">
            {periodLabel(service.period)} · {open}–{close}
          </div>
          <div className="text-xs text-muted-foreground">
            {activeCount} {activeCount === 1 ? "reserva" : "reservas"} · {people} personas
          </div>
        </div>
        <div className="divide-y divide-border">
          {slots.map((slot) => {
            const slotStart = toMin(slot);
            const slotEnd = slotStart + step;
            const inSlot = reservations.filter((r) => {
              const m = toMin(r.reservation_time);
              return m >= slotStart && m < slotEnd;
            });
            const occupied = inSlot
              .filter((r) => ACTIVE_STATUS.has(r.status))
              .reduce((a, r) => a + (r.party_size ?? 0), 0);
            const free = capacity ? Math.max(0, capacity - occupied) : null;
            let status: "full" | "low" | "open" = "open";
            if (capacity) {
              if (free === 0) status = "full";
              else if (free !== null && free <= lowThreshold) status = "low";
            }
            return (
              <div key={slot} className="flex items-stretch">
                <div className="w-16 shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground border-r border-border flex items-start pt-2.5">
                  {slot}
                </div>
                <div className="flex-1 px-3 py-2 space-y-1.5">
                  {inSlot.map((r) => <ReservationCard key={r.id} r={r} tableLabel={tableLabel} onClick={() => onOpenReservation(r)} />)}
                  <button
                    onClick={() => onCreateAt(slot)}
                    className="w-full text-left text-xs text-muted-foreground hover:text-foreground hover:bg-accent/30 rounded px-2 py-1 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Plus className="h-3 w-3" />
                      {capacity ? (
                        status === "full" ? <span className="text-terracotta">Completo</span> :
                        status === "low" ? <span className="text-amber-700">Pocas plazas ({free})</span> :
                        <span>Disponible ({free}/{capacity})</span>
                      ) : <span>Añadir reserva</span>}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ReservationCard({
  r, tableLabel, onClick,
}: {
  r: Reservation;
  tableLabel: (id: string | null) => string | null;
  onClick: () => void;
}) {
  const tl = tableLabel(r.table_id);
  const isReview = r.status === "requires_human";
  const isCancelled = r.status === "cancelled" || r.status === "no_show";
  const reason = isReview ? parseReviewReasonsFromNotes(r.internal_notes)[0] : null;

  const statusMap: Record<string, { label: string; cls: string }> = {
    confirmed: { label: "Confirmada", cls: "bg-sage/15 text-sage-foreground border-sage/30" },
    pending: { label: "Pendiente", cls: "bg-amber-100 text-amber-800 border-amber-200" },
    modified: { label: "Modificada", cls: "bg-blue-100 text-blue-800 border-blue-200" },
    requires_human: { label: "Requiere revisión", cls: "bg-terracotta/15 text-terracotta border-terracotta/30" },
    cancelled: { label: "Cancelada", cls: "bg-muted text-muted-foreground border-border" },
    no_show: { label: "No-show", cls: "bg-muted text-muted-foreground border-border" },
  };
  const st = statusMap[r.status] ?? statusMap.confirmed;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-md border px-2.5 py-1.5 transition-colors ${
        isReview ? "border-l-2 border-l-terracotta bg-terracotta/[0.04] border-border hover:bg-terracotta/[0.08]" :
        isCancelled ? "border-border bg-muted/30 opacity-70 hover:bg-muted/50" :
        "border-border bg-card hover:bg-accent/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate">
          {r.reservation_time.slice(0, 5)} · {r.customer_name}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${st.cls}`}>{st.label}</span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <span className="text-xs text-muted-foreground truncate">
          {r.party_size} personas{tl ? ` · ${tl}` : <span className="italic"> · Sin asignar</span>}
        </span>
      </div>
      {reason && (
        <div className="text-[11px] text-terracotta mt-0.5 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {reason}
        </div>
      )}
    </button>
  );
}