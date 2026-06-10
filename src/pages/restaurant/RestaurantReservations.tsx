import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { ReservationDrawer, type DrawerMode } from "@/components/ReservationDrawer";
import { listReservations } from "@/lib/queries";
import { parseReviewReasonsFromNotes } from "@/lib/reservationRules";
import { useAuth } from "@/hooks/useAuth";
import {
  RESERVATION_STATUS_LABELS,
  type Reservation,
  type ReservationChannel,
  type ReservationStatus,
  type RestaurantTable,
  type Zone,
} from "@/lib/types";
import { Plus, MoreHorizontal, Ban, UserX, Search, CalendarDays, Eye, ArrowUpDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addDays, startOfWeek, endOfWeek, parseISO, isSameDay, isTomorrow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type DateFilter = "all" | "today" | "tomorrow" | "this_week" | "upcoming" | "custom";
type ChannelFilter = "all" | ReservationChannel;
type StatusFilter = "all" | ReservationStatus;
type QuickChip = "all" | "upcoming" | "today" | "requires_human" | "pending" | "cancelled";
type SortBy = "date_asc" | "date_desc" | "name_asc" | "updated_desc";

const CHANNEL_SHORT: Record<ReservationChannel, string> = {
  manual: "Manual",
  whatsapp: "WhatsApp",
  future_voice: "Voz",
  external_calendar: "Externo",
};

const DATE_FILTER_LABEL: Record<DateFilter, string> = {
  all: "Cualquier fecha",
  today: "Hoy",
  tomorrow: "Mañana",
  this_week: "Esta semana",
  upcoming: "Próximas",
  custom: "Rango personalizado",
};

const QUICK_CHIPS: { id: QuickChip; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "upcoming", label: "Próximas" },
  { id: "today", label: "Hoy" },
  { id: "requires_human", label: "Requieren revisión" },
  { id: "pending", label: "Pendientes" },
  { id: "cancelled", label: "Canceladas" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isUpcoming(dateStr: string) {
  const d = parseISO(dateStr);
  const today = new Date();
  return isSameDay(d, today) || isTomorrow(d);
}

function primaryActionLabel(status: ReservationStatus) {
  if (status === "requires_human") return "Revisar";
  if (status === "cancelled" || status === "no_show") return "Ver";
  return "Editar";
}

function primaryActionVariant(status: ReservationStatus): "default" | "outline" | "ghost" {
  if (status === "requires_human") return "default";
  if (status === "cancelled" || status === "no_show") return "ghost";
  return "outline";
}

function reviewReasonText(r: Reservation): string {
  if (r.status !== "requires_human") return "";
  const reasons = parseReviewReasonsFromNotes(r.internal_notes);
  if (reasons.length > 0) return reasons[0].replace(/\.$/, "");
  if (r.internal_notes) {
    const first = r.internal_notes.split("\n")[0]?.trim();
    if (first && first.length < 120) return first;
  }
  return "Revisar datos de la reserva";
}

export default function RestaurantReservations() {
  const { profile } = useAuth();
  const rid = profile?.restaurant_id ?? "";
  const [items, setItems] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [mode, setMode] = useState<DrawerMode>("create");

  const [chip, setChip] = useState<QuickChip>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date_asc");

  function reload() {
    if (!rid) return;
    listReservations(rid).then(setItems);
    supabase.from("restaurant_tables").select("*").eq("restaurant_id", rid)
      .then(({ data }) => setTables((data ?? []) as RestaurantTable[]));
    supabase.from("restaurant_zones").select("*").eq("restaurant_id", rid)
      .then(({ data }) => setZones((data ?? []) as Zone[]));
  }
  useEffect(reload, [rid]);

  function tableInfo(id: string | null): { label: string; zone?: string } | null {
    if (!id) return null;
    const t = tables.find((x) => x.id === id);
    if (!t) return null;
    const z = zones.find((z) => z.id === t.zone_id);
    return z ? { label: t.label, zone: z.name } : { label: t.label };
  }

  const dateRange = useMemo(() => {
    const today = todayISO();
    const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
    if (dateFilter === "today") return { from: today, to: today };
    if (dateFilter === "tomorrow") return { from: tomorrow, to: tomorrow };
    if (dateFilter === "this_week") {
      const s = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const e = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      return { from: s, to: e };
    }
    if (dateFilter === "upcoming") return { from: today, to: null };
    if (dateFilter === "custom") return { from: customFrom || null, to: customTo || null };
    return { from: null, to: null };
  }, [dateFilter, customFrom, customTo]);

  const filtered = useMemo(() => {
    const today = todayISO();
    const q = query.trim().toLowerCase();
    return items.filter((r) => {
      if (chip === "upcoming" && r.reservation_date < today) return false;
      if (chip === "today" && r.reservation_date !== today) return false;
      if (chip === "requires_human" && r.status !== "requires_human") return false;
      if (chip === "pending" && r.status !== "pending") return false;
      if (chip === "cancelled" && r.status !== "cancelled") return false;
      if (status !== "all" && r.status !== status) return false;
      if (channel !== "all" && r.channel !== channel) return false;
      if (dateRange.from && r.reservation_date < dateRange.from) return false;
      if (dateRange.to && r.reservation_date > dateRange.to) return false;
      if (q) {
        const hay = `${r.customer_name ?? ""} ${r.customer_phone ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, chip, status, channel, dateRange, query]);

  const hasActiveFilters =
    chip !== "all" || status !== "all" || channel !== "all" || dateFilter !== "all" || query.trim() !== "";

  function clearFilters() {
    setChip("all");
    setStatus("all");
    setChannel("all");
    setDateFilter("all");
    setQuery("");
    setCustomFrom("");
    setCustomTo("");
  }

  function openCreate() {
    setEditing(null);
    setMode("create");
    setOpen(true);
  }
  function openRow(r: Reservation) {
    setEditing(r);
    setMode(r.status === "requires_human" ? "review" : "edit");
    setOpen(true);
  }

  async function setReservationStatus(id: string, s: ReservationStatus) {
    const { error } = await supabase.from("reservations").update({ status: s }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Reserva actualizada");
    reload();
  }

  return (
    <AppShell variant="restaurant" title="Reservas">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Reservas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Busca, filtra y gestiona las reservas del restaurante.
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" />
          Nueva reserva
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4 mb-3 border-border bg-card">
        <div className="grid gap-3 md:grid-cols-12 md:items-end">
          <div className="md:col-span-4">
            <Label className="text-xs text-muted-foreground">Buscar</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar cliente o teléfono"
                className="pl-9"
              />
            </div>
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs text-muted-foreground">Estado</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {Object.entries(RESERVATION_STATUS_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs text-muted-foreground">Canal</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as ChannelFilter)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los canales</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="future_voice">Voz</SelectItem>
                <SelectItem value="external_calendar">Externo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs text-muted-foreground">Fecha</Label>
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
              <SelectTrigger className="mt-1 whitespace-nowrap [&>span]:line-clamp-none">
                <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
                <SelectValue placeholder={DATE_FILTER_LABEL.all}>
                  {DATE_FILTER_LABEL[dateFilter]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Cualquier fecha</SelectItem>
                <SelectItem value="today">Hoy</SelectItem>
                <SelectItem value="tomorrow">Mañana</SelectItem>
                <SelectItem value="this_week">Esta semana</SelectItem>
                <SelectItem value="upcoming">Próximas</SelectItem>
                <SelectItem value="custom">Rango personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {dateFilter === "custom" && (
            <div className="md:col-span-12 grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Desde</Label>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Hasta</Label>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="mt-1" />
              </div>
            </div>
          )}
        </div>

        {/* Quick chips */}
        <div className="flex flex-wrap gap-2 mt-3">
          {QUICK_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChip(c.id)}
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                chip === c.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted",
              )}
            >
              {c.label}
            </button>
          ))}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </Card>

      {/* Result count */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "reserva encontrada" : "reservas encontradas"}
          {hasActiveFilters ? " con estos filtros" : ""}
        </span>
      </div>

      {/* Empty states */}
      {filtered.length === 0 ? (
        <Card className="p-10 text-center border-border">
          {items.length === 0 ? (
            <>
              <h3 className="text-base font-medium text-foreground">Todavía no hay reservas</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Cuando se creen reservas, aparecerán aquí.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-base font-medium text-foreground">No hay reservas con estos filtros</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Prueba a cambiar la fecha, el estado o buscar otro cliente.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            </>
          )}
        </Card>
      ) : (
        <>
          {/* Desktop / tablet table */}
          <Card className="hidden md:block border-border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 px-3 py-2 text-xs">Reserva</TableHead>
                    <TableHead className="h-9 px-3 py-2 text-xs">Cliente</TableHead>
                    <TableHead className="h-9 px-3 py-2 text-xs">Personas</TableHead>
                    <TableHead className="h-9 px-3 py-2 text-xs">Mesa / zona</TableHead>
                    <TableHead className="h-9 px-3 py-2 text-xs">Estado</TableHead>
                    <TableHead className="h-9 px-3 py-2 text-xs">Origen</TableHead>
                    <TableHead className="h-9 px-3 py-2 text-xs text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const isReview = r.status === "requires_human";
                    const info = tableInfo(r.table_id);
                    const upcomingNoTable = isUpcoming(r.reservation_date) && !info;
                    const reason = isReview ? reviewReasonText(r) : "";
                    const actionLabel = primaryActionLabel(r.status);
                    const actionVariant = primaryActionVariant(r.status);
                    return (
                      <TableRow
                        key={r.id}
                        className={cn(
                          "border-b",
                          isReview && "border-l-2 border-l-terracotta bg-terracotta/[0.03]",
                        )}
                      >
                        <TableCell className="py-2.5 px-3 align-middle">
                          <div className="font-medium text-sm text-foreground">
                            {format(parseISO(r.reservation_date), "dd/MM/yyyy")}
                          </div>
                          <div className="text-xs text-muted-foreground">{r.reservation_time.slice(0, 5)}</div>
                        </TableCell>
                        <TableCell className="py-2.5 px-3 align-middle">
                          <div className="font-medium text-sm text-foreground">{r.customer_name}</div>
                          <div className={cn("text-xs", r.customer_phone ? "text-muted-foreground" : "text-muted-foreground/60 italic")}>
                            {r.customer_phone ?? "Sin teléfono"}
                          </div>
                          {r.customer_notes && (
                            <div className="text-xs text-muted-foreground mt-0.5 max-w-[220px] truncate" title={r.customer_notes}>
                              {r.customer_notes}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 align-middle text-sm text-foreground">{r.party_size}</TableCell>
                        <TableCell className="py-2.5 px-3 align-middle">
                          {info ? (
                            <span className="text-sm text-foreground">
                              {info.zone ? `${info.label} · ${info.zone}` : info.label}
                            </span>
                          ) : (
                            <span className={cn("text-xs", upcomingNoTable ? "text-warning font-medium" : "text-muted-foreground/60 italic")}>
                              {upcomingNoTable ? "Sin asignar" : "Sin asignar"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 align-middle">
                          <StatusBadge kind="reservation" value={r.status} />
                          {isReview && reason && (
                            <div className="text-xs text-terracotta mt-1 max-w-[220px] leading-snug">
                              {reason}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 align-middle text-xs text-muted-foreground">
                          {CHANNEL_SHORT[r.channel]}
                        </TableCell>
                        <TableCell className="py-2.5 px-3 align-middle text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant={actionVariant}
                            onClick={() => openRow(r)}
                            className={cn(actionVariant === "ghost" && "text-muted-foreground hover:text-foreground")}
                          >
                            {actionLabel}
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="ml-1 h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openRow(r)}>
                                {actionLabel === "Ver" && <Eye className="h-4 w-4 mr-2" />}
                                {actionLabel}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {r.status !== "cancelled" && (
                                <DropdownMenuItem onClick={() => setReservationStatus(r.id, "cancelled")}>
                                  <Ban className="h-4 w-4 mr-2" /> Cancelar reserva
                                </DropdownMenuItem>
                              )}
                              {r.status !== "no_show" && (
                                <DropdownMenuItem onClick={() => setReservationStatus(r.id, "no_show")}>
                                  <UserX className="h-4 w-4 mr-2" /> Marcar no-show
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((r) => {
              const isReview = r.status === "requires_human";
              const info = tableInfo(r.table_id);
              const upcomingNoTable = isUpcoming(r.reservation_date) && !info;
              const reason = isReview ? reviewReasonText(r) : "";
              const actionLabel = primaryActionLabel(r.status);
              const actionVariant = primaryActionVariant(r.status);
              return (
                <Card
                  key={r.id}
                  className={cn(
                    "p-4 border-border",
                    isReview && "border-l-2 border-l-terracotta bg-terracotta/[0.03]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        {format(parseISO(r.reservation_date), "dd/MM/yyyy")} · {r.reservation_time.slice(0, 5)}
                      </div>
                      <div className="font-medium text-foreground mt-1">{r.customer_name}</div>
                      <div className={cn("text-xs", r.customer_phone ? "text-muted-foreground" : "text-muted-foreground/60 italic")}>
                        {r.customer_phone ?? "Sin teléfono"}
                      </div>
                    </div>
                    <StatusBadge kind="reservation" value={r.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-muted-foreground">
                    <div><span className="text-foreground/70">Personas:</span> {r.party_size}</div>
                    <div>
                      <span className="text-foreground/70">Mesa:</span>{" "}
                      {info ? (info.zone ? `${info.label} · ${info.zone}` : info.label) : (
                        <span className={upcomingNoTable ? "text-warning font-medium" : "text-muted-foreground/60 italic"}>
                          Sin asignar
                        </span>
                      )}
                    </div>
                    <div className="col-span-2"><span className="text-foreground/70">Origen:</span> {CHANNEL_SHORT[r.channel]}</div>
                  </div>
                  {isReview && reason && (
                    <div className="text-xs text-terracotta mt-2 leading-snug">{reason}</div>
                  )}
                  {r.customer_notes && (
                    <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{r.customer_notes}</div>
                  )}
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost">Más</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {r.status !== "cancelled" && (
                          <DropdownMenuItem onClick={() => setReservationStatus(r.id, "cancelled")}>
                            <Ban className="h-4 w-4 mr-2" /> Cancelar reserva
                          </DropdownMenuItem>
                        )}
                        {r.status !== "no_show" && (
                          <DropdownMenuItem onClick={() => setReservationStatus(r.id, "no_show")}>
                            <UserX className="h-4 w-4 mr-2" /> Marcar no-show
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button size="sm" variant={actionVariant} onClick={() => openRow(r)}>
                      {actionLabel}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <ReservationDrawer
        open={open}
        onOpenChange={setOpen}
        restaurantId={rid}
        initial={editing}
        mode={mode}
        onSaved={reload}
      />
    </AppShell>
  );
}
