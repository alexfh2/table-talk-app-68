import { useEffect, useMemo, useState } from "react";
import {
  getTableOccupancySnapshot,
  type TableOccupancySnapshot,
  type TableOccupancy,
} from "@/lib/getTableOccupancySnapshot";
import { supabase } from "@/integrations/supabase/client";
import type {
  RestaurantTable,
  Reservation,
  ScheduleRow,
  Zone,
  ZoneElement,
  ZoneElementType,
} from "@/lib/types";
import { ZONE_ELEMENT_LABELS } from "@/lib/types";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Wine,
  DoorOpen,
  ChefHat,
  Bath,
  Bell,
  Square as SquareIcon,
  Shapes,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ServiceFilter = "all" | "lunch" | "dinner";

const ELEMENT_ICONS: Record<ZoneElementType, React.ComponentType<{ className?: string }>> = {
  bar: Wine,
  door: DoorOpen,
  kitchen: ChefHat,
  bathroom: Bath,
  reception: Bell,
  column: SquareIcon,
  custom: Shapes,
};

const CHANNEL_LABEL_SHORT: Record<string, string> = {
  manual: "Manual",
  whatsapp: "WhatsApp",
  future_voice: "Voz",
  external_calendar: "Externo",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  modified: "Modificada",
  requires_human: "Requiere revisión",
  seated: "Sentada",
  no_show: "No-show",
  cancelled: "Cancelada",
};

function buildSlotsForService(svc: ScheduleRow): string[] {
  if (!svc.opening_time || !svc.closing_time) return [];
  // Shift-based services only expose the configured shift times.
  if (svc.booking_mode === "shifts" && Array.isArray(svc.shift_times) && svc.shift_times.length > 0) {
    return Array.from(
      new Set(svc.shift_times.map((t) => String(t).slice(0, 5))),
    ).sort();
  }
  const [oh, om] = svc.opening_time.split(":").map(Number);
  const [ch, cm] = svc.closing_time.split(":").map(Number);
  const start = oh * 60 + om;
  const end = ch * 60 + cm;
  const step = svc.slot_duration_minutes ?? 30;
  const out: string[] = [];
  for (let m = start; m <= end - step; m += step) {
    out.push(
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
    );
  }
  return out;
}

function periodOf(svc: ScheduleRow): "lunch" | "dinner" {
  return svc.service_period;
}

export function TodayMapView({
  restaurantId,
  selectedDate,
  services,
  filter,
  tables,
  zones,
  reservations,
  onCreate,
  onEdit,
}: {
  restaurantId: string;
  selectedDate: string;
  services: ScheduleRow[];
  filter: ServiceFilter;
  tables: RestaurantTable[];
  zones: Zone[];
  reservations: Reservation[];
  onCreate: (time: string, tableId?: string) => void;
  onEdit: (r: Reservation) => void;
}) {
  // ----- Slots -----
  const slotGroups = useMemo(() => {
    const filtered = services.filter((s) =>
      filter === "all" ? true : periodOf(s) === filter,
    );
    return filtered
      .sort((a, b) => (a.opening_time! < b.opening_time! ? -1 : 1))
      .map((svc) => ({
        label:
          svc.service_period === "lunch" ? "Mediodía" : "Noche",
        slots: buildSlotsForService(svc),
      }))
      .filter((g) => g.slots.length > 0);
  }, [services, filter]);

  const allSlots = useMemo(
    () => Array.from(new Set(slotGroups.flatMap((g) => g.slots))).sort(),
    [slotGroups],
  );

  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  useEffect(() => {
    if (allSlots.length === 0) {
      setSelectedTime(null);
      return;
    }
    // If current selection still exists keep it, else pick a sensible default.
    setSelectedTime((prev) => {
      if (prev && allSlots.includes(prev)) return prev;
      // Default: closest to "now" if today, else first slot of the group.
      const nowMin = (() => {
        const n = new Date();
        const today = new Date();
        const isToday =
          selectedDate ===
          `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        if (!isToday) return null;
        return n.getHours() * 60 + n.getMinutes();
      })();
      if (nowMin != null) {
        const closest = [...allSlots].sort((a, b) => {
          const da = Math.abs(
            Number(a.slice(0, 2)) * 60 + Number(a.slice(3, 5)) - nowMin,
          );
          const db = Math.abs(
            Number(b.slice(0, 2)) * 60 + Number(b.slice(3, 5)) - nowMin,
          );
          return da - db;
        })[0];
        return closest;
      }
      return allSlots[0];
    });
  }, [allSlots, selectedDate]);

  // ----- Snapshot -----
  const [snapshot, setSnapshot] = useState<TableOccupancySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!restaurantId || !selectedDate || !selectedTime) {
      setSnapshot(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getTableOccupancySnapshot({
      restaurantId,
      date: selectedDate,
      time: selectedTime,
    })
      .then((snap) => {
        if (!cancelled) setSnapshot(snap);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, selectedDate, selectedTime]);

  // ----- Zone elements (decor) -----
  const [elements, setElements] = useState<ZoneElement[]>([]);
  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    const zoneIds = zones.map((z) => z.id);
    if (zoneIds.length === 0) {
      setElements([]);
      return;
    }
    supabase
      .from("restaurant_zone_elements")
      .select("*")
      .in("zone_id", zoneIds)
      .then(({ data }) => {
        if (cancelled) return;
        setElements(((data as unknown) as ZoneElement[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, zones]);

  // ----- Derived helpers -----
  const tableById = useMemo(() => {
    const m = new Map<string, TableOccupancy>();
    snapshot?.tables.forEach((t) => m.set(t.tableId, t));
    return m;
  }, [snapshot]);

  // Map reservationId -> all tableIds (for "mesa unida")
  const resToTables = useMemo(() => {
    const m = new Map<string, string[]>();
    snapshot?.tables.forEach((t) => {
      if (t.occupiedByReservationId) {
        const arr = m.get(t.occupiedByReservationId) ?? [];
        arr.push(t.tableId);
        m.set(t.occupiedByReservationId, arr);
      }
    });
    return m;
  }, [snapshot]);

  // Partner map for hover highlight of available combos
  const partnerMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (!snapshot) return m;
    for (const c of snapshot.combinations) {
      if (c.status !== "available") continue;
      for (const id of c.tableIds) {
        const set = m.get(id) ?? new Set<string>();
        for (const other of c.tableIds) if (other !== id) set.add(other);
        m.set(id, set);
      }
    }
    return m;
  }, [snapshot]);

  const [hoverId, setHoverId] = useState<string | null>(null);
  const [highlightedReservation, setHighlightedReservation] = useState<string | null>(null);

  // ----- Summary -----
  const summary = useMemo(() => {
    if (!snapshot) {
      return { occupied: 0, free: 0, guests: 0, availableCombos: 0 };
    }
    const occupied = snapshot.tables.filter((t) => t.status === "occupied").length;
    const free = snapshot.tables.filter((t) => t.status === "available").length;
    const seenRes = new Set<string>();
    let guests = 0;
    for (const t of snapshot.tables) {
      if (t.occupiedBySummary && !seenRes.has(t.occupiedBySummary.reservationId)) {
        seenRes.add(t.occupiedBySummary.reservationId);
        guests += t.occupiedBySummary.partySize;
      }
    }
    const availableCombos = snapshot.combinations.filter(
      (c) => c.status === "available",
    ).length;
    return { occupied, free, guests, availableCombos };
  }, [snapshot]);

  // ----- Empty states -----
  if (tables.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center">
        <p className="text-sm text-foreground">
          No hay mesas configuradas para este restaurante.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Configura las mesas y zonas en Ajustes para usar la vista de mapa.
        </p>
      </div>
    );
  }

  if (slotGroups.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center">
        <p className="text-sm text-foreground">
          No hay servicio configurado para este día.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Slot picker */}
      <div className="rounded-2xl border border-border bg-card px-5 py-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-base text-foreground">Hora</p>
          <p className="text-xs text-muted-foreground">
            Selecciona una franja para ver la ocupación.
          </p>
        </div>
        <div className="space-y-2">
          {slotGroups.map((g) => (
            <div key={g.label}>
              {slotGroups.length > 1 && (
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  {g.label}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {g.slots.map((t) => (
                  <button
                    key={`${g.label}-${t}`}
                    type="button"
                    onClick={() => setSelectedTime(t)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] tabular-nums transition-colors",
                      selectedTime === t
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary + legend */}
      <div className="rounded-2xl border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl tabular-nums text-foreground leading-none">
              {selectedTime ?? "—"}
            </span>
            <span className="text-xs text-muted-foreground">hora seleccionada</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl tabular-nums text-foreground leading-none">
              {summary.occupied}
            </span>
            <span className="text-xs text-muted-foreground">
              {summary.occupied === 1 ? "mesa ocupada" : "mesas ocupadas"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl tabular-nums text-foreground leading-none">
              {summary.free}
            </span>
            <span className="text-xs text-muted-foreground">
              {summary.free === 1 ? "mesa libre" : "mesas libres"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl tabular-nums text-foreground leading-none">
              {summary.guests}
            </span>
            <span className="text-xs text-muted-foreground">
              {summary.guests === 1 ? "persona" : "personas"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl tabular-nums text-foreground leading-none">
              {summary.availableCombos}
            </span>
            <HoverCard>
              <HoverCardTrigger asChild>
                <span className="text-xs text-muted-foreground cursor-help underline decoration-dotted">
                  {summary.availableCombos === 1
                    ? "unión de mesas disponible"
                    : "uniones de mesas disponibles"}
                </span>
              </HoverCardTrigger>
              <HoverCardContent className="w-64 text-xs">
                Opciones para juntar mesas y aceptar grupos grandes.
              </HoverCardContent>
            </HoverCard>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
          <LegendDot className="border-border bg-card" label="Disponible" />
          <LegendDot
            className="border-terracotta/40 bg-terracotta/15"
            label="Ocupada"
          />
          <LegendDot
            className="border-dashed border-muted-foreground/40 bg-muted/40"
            label="Inactiva"
          />
          <LegendDot
            className="border-primary bg-primary/15"
            label="Mesa unida"
          />
        </div>
      </div>

      {/* Zones */}
      <div className="space-y-4">
        {zones.map((zone) => {
          const zoneTables = tables.filter((t) => t.zone_id === zone.id);
          if (zoneTables.length === 0) return null;
          const zoneElements = elements.filter(
            (el) => el.zone_id === zone.id && el.is_visible !== false,
          );
          return (
            <section
              key={zone.id}
              className="rounded-2xl border border-border bg-card overflow-hidden"
            >
              <header className="px-5 py-3 flex items-center justify-between border-b border-border">
                <h3 className="text-base">{zone.name}</h3>
                <span className="text-xs text-muted-foreground">
                  {zoneTables.length}{" "}
                  {zoneTables.length === 1 ? "mesa" : "mesas"}
                </span>
              </header>
              <div className="p-4">
                <ZoneCanvas
                  zoneTables={zoneTables}
                  zoneElements={zoneElements}
                  tableById={tableById}
                  resToTables={resToTables}
                  partnerMap={partnerMap}
                  hoverId={hoverId}
                  setHoverId={setHoverId}
                  highlightedReservation={highlightedReservation}
                  setHighlightedReservation={setHighlightedReservation}
                  selectedTime={selectedTime}
                  reservations={reservations}
                  onAvailableClick={(tableId) => {
                    if (selectedTime) onCreate(selectedTime, tableId);
                  }}
                  onOccupiedClick={(reservationId) => {
                    const res = reservations.find((r) => r.id === reservationId);
                    if (res) onEdit(res);
                  }}
                  loading={loading}
                />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-full border", className)} />
      {label}
    </span>
  );
}

function ZoneCanvas({
  zoneTables,
  zoneElements,
  tableById,
  resToTables,
  partnerMap,
  hoverId,
  setHoverId,
  highlightedReservation,
  setHighlightedReservation,
  selectedTime,
  reservations,
  onAvailableClick,
  onOccupiedClick,
  loading,
}: {
  zoneTables: RestaurantTable[];
  zoneElements: ZoneElement[];
  tableById: Map<string, TableOccupancy>;
  resToTables: Map<string, string[]>;
  partnerMap: Map<string, Set<string>>;
  hoverId: string | null;
  setHoverId: (id: string | null) => void;
  highlightedReservation: string | null;
  setHighlightedReservation: (id: string | null) => void;
  selectedTime: string | null;
  reservations: Reservation[];
  onAvailableClick: (tableId: string) => void;
  onOccupiedClick: (reservationId: string) => void;
  loading: boolean;
}) {
  // Auto-layout for tables missing visual_x/y so the canvas isn't empty.
  const drafts = useMemo(() => {
    const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
    const placed = zoneTables.filter(
      (t) => t.visual_x != null && t.visual_y != null,
    );
    const needAuto = zoneTables.filter(
      (t) => t.visual_x == null || t.visual_y == null,
    );
    for (const t of placed) {
      out[t.id] = {
        x: Number(t.visual_x),
        y: Number(t.visual_y),
        w: Number(t.visual_width ?? 11),
        h: Number(t.visual_height ?? 16),
      };
    }
    if (needAuto.length > 0) {
      const cols = Math.max(1, Math.ceil(Math.sqrt(needAuto.length)));
      const rows = Math.max(1, Math.ceil(needAuto.length / cols));
      const padX = 12;
      const padY = 14;
      const stepX = cols === 1 ? 0 : (100 - padX * 2) / (cols - 1);
      const stepY = rows === 1 ? 0 : (100 - padY * 2) / (rows - 1);
      needAuto.forEach((t, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        out[t.id] = {
          x: cols === 1 ? 50 : padX + c * stepX,
          y: rows === 1 ? 50 : padY + r * stepY,
          w: Number(t.visual_width ?? 11),
          h: Number(t.visual_height ?? 16),
        };
      });
    }
    return out;
  }, [zoneTables]);

  return (
    <div
      className="relative w-full rounded-xl border border-border bg-[hsl(var(--secondary))] overflow-hidden"
      style={{
        aspectRatio: "16 / 10",
        backgroundImage:
          "radial-gradient(circle at 1px 1px, hsl(var(--muted-foreground) / 0.18) 1px, transparent 0)",
        backgroundSize: "22px 22px",
      }}
    >
      {loading && (
        <div className="absolute top-2 right-2 z-20 text-[10px] text-muted-foreground bg-card/80 backdrop-blur px-2 py-0.5 rounded-full border border-border">
          Cargando…
        </div>
      )}

      {zoneElements.map((el) => {
        const radius =
          el.shape === "circle"
            ? "9999px"
            : el.shape === "square"
            ? "6px"
            : "4px";
        const Icon = ELEMENT_ICONS[el.element_type];
        return (
          <div
            key={el.id}
            className="absolute flex items-center justify-center gap-1.5 select-none border border-dashed border-muted-foreground/40 bg-muted/40 text-muted-foreground pointer-events-none"
            style={{
              left: `${el.visual_x}%`,
              top: `${el.visual_y}%`,
              width: `${el.visual_width}%`,
              height: `${el.visual_height}%`,
              minWidth: 32,
              minHeight: 24,
              borderRadius: radius,
              transform: `translate(-50%, -50%) rotate(${el.rotation}deg)`,
              zIndex: 0,
            }}
          >
            <Icon className="h-3 w-3 shrink-0" />
            <span className="text-[10px] font-medium uppercase tracking-wide truncate px-1">
              {el.label || ZONE_ELEMENT_LABELS[el.element_type]}
            </span>
          </div>
        );
      })}

      {zoneTables.map((t) => {
        const d = drafts[t.id];
        if (!d) return null;
        const occ = tableById.get(t.id);
        const status: TableOccupancy["status"] =
          occ?.status ?? (t.is_active ? "available" : "inactive");
        const radius =
          (t.visual_shape ?? "round") === "round"
            ? "9999px"
            : t.visual_shape === "square"
            ? "10px"
            : "8px";

        const reservationId = occ?.occupiedByReservationId ?? null;
        const isUnited =
          reservationId != null &&
          (resToTables.get(reservationId)?.length ?? 0) > 1;
        const isHighlightedByRes =
          reservationId != null && reservationId === highlightedReservation;
        const isPartner =
          !!hoverId &&
          hoverId !== t.id &&
          (partnerMap.get(hoverId)?.has(t.id) ?? false) &&
          status === "available";

        // Visual styles per status
        const styleCls = (() => {
          if (status === "inactive")
            return "border-dashed border-muted-foreground/40 bg-muted/30 text-muted-foreground opacity-70";
          if (status === "occupied")
            return cn(
              "border-terracotta/40 bg-terracotta/10 text-foreground",
              isUnited && "border-primary/60 bg-primary/10",
              isHighlightedByRes && "ring-2 ring-primary/40 shadow-md z-10",
            );
          if (status === "invalid_capacity")
            return "border-border bg-card text-muted-foreground";
          // available
          return cn(
            "border-border bg-card text-foreground hover:border-primary/40 hover:shadow-sm",
            isPartner && "ring-1 ring-primary/30 border-primary/40",
          );
        })();

        const button = (
          <button
            key={t.id}
            type="button"
            disabled={!selectedTime}
            onMouseEnter={() => {
              setHoverId(t.id);
              if (reservationId) setHighlightedReservation(reservationId);
            }}
            onMouseLeave={() => {
              setHoverId(null);
              if (reservationId) setHighlightedReservation(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (status === "occupied" && reservationId) {
                onOccupiedClick(reservationId);
              } else if (
                status === "available" ||
                status === "invalid_capacity"
              ) {
                onAvailableClick(t.id);
              }
            }}
            className={cn(
              "absolute flex flex-col items-center justify-center text-center select-none border transition-all",
              "cursor-pointer disabled:cursor-not-allowed",
              styleCls,
            )}
            style={{
              left: `${d.x}%`,
              top: `${d.y}%`,
              width: `${d.w}%`,
              height: `${d.h}%`,
              minWidth: 44,
              minHeight: 44,
              borderRadius: radius,
              transform: `translate(-50%, -50%) rotate(${t.visual_rotation ?? 0}deg)`,
              zIndex: isHighlightedByRes ? 5 : 1,
            }}
            aria-label={`Mesa ${t.label}`}
          >
            <span className="text-sm font-semibold leading-none">
              {t.label}
            </span>
            <span className="text-[10px] opacity-70 mt-0.5">
              {t.min_capacity}–{t.max_capacity}
            </span>
            {isUnited && occ?.occupiedBySummary && (
              <span className="text-[9px] text-primary mt-0.5 font-medium">
                {(resToTables.get(reservationId!) ?? [])
                  .map((id) => tableById.get(id)?.label ?? "")
                  .filter(Boolean)
                  .join(" + ")}
              </span>
            )}
          </button>
        );

        if (status === "occupied" && occ?.occupiedBySummary) {
          const s = occ.occupiedBySummary;
          const united = resToTables.get(reservationId!) ?? [];
          const tableLabels = united
            .map((id) => tableById.get(id)?.label ?? "")
            .filter(Boolean)
            .join(" + ");
          const fullRes = reservations.find((r) => r.id === s.reservationId);
          const channelLabel = fullRes
            ? CHANNEL_LABEL_SHORT[fullRes.channel] ?? fullRes.channel
            : "—";
          return (
            <HoverCard key={t.id} openDelay={120} closeDelay={60}>
              <HoverCardTrigger asChild>{button}</HoverCardTrigger>
              <HoverCardContent
                side="top"
                align="center"
                className="w-64 p-3 space-y-1.5"
              >
                <p className="text-sm font-medium">{s.customerName}</p>
                <p className="text-xs text-muted-foreground">
                  {s.partySize}{" "}
                  {s.partySize === 1 ? "persona" : "personas"} · {s.time} ·{" "}
                  {tableLabels || t.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {STATUS_LABEL[s.status] ?? s.status} · {channelLabel}
                </p>
              </HoverCardContent>
            </HoverCard>
          );
        }

        return button;
      })}
    </div>
  );
}