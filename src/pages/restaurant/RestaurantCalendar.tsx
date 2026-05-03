import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { listReservations } from "@/lib/queries";
import type { Reservation, RestaurantTable, Zone } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { ReservationFormDialog } from "@/components/ReservationFormDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { addDays, format, startOfWeek } from "date-fns";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";

export default function RestaurantCalendar() {
  const { profile } = useAuth();
  const rid = profile?.restaurant_id ?? "";
  const [view, setView] = useState<"day" | "week">("day");
  const [date, setDate] = useState(new Date());
  const [items, setItems] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);

  function reload() {
    if (!rid) return;
    listReservations(rid).then(setItems);
    supabase.from("restaurant_tables").select("*").eq("restaurant_id", rid).then(({ data }) => setTables((data ?? []) as RestaurantTable[]));
    supabase.from("restaurant_zones").select("*").eq("restaurant_id", rid).then(({ data }) => setZones((data ?? []) as Zone[]));
  }
  useEffect(reload, [rid]);

  function tableLabel(id: string | null): string | null {
    if (!id) return null;
    const t = tables.find(x => x.id === id);
    if (!t) return null;
    const z = zones.find(z => z.id === t.zone_id);
    return z ? `${t.label} · ${z.name}` : t.label;
  }

  const days = view === "day" ? [date] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date, { weekStartsOn: 1 }), i));
  const hours = Array.from({ length: 14 }, (_, i) => i + 10); // 10:00 - 23:00

  function reservationsAt(d: Date, h: number) {
    const ds = format(d, "yyyy-MM-dd");
    return items.filter(r => r.reservation_date === ds && Number(r.reservation_time.slice(0,2)) === h);
  }

  return (
    <AppShell variant="restaurant" title="Calendario">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button size="sm" variant={view === "day" ? "default" : "outline"} onClick={() => setView("day")}>Día</Button>
        <Button size="sm" variant={view === "week" ? "default" : "outline"} onClick={() => setView("week")}>Semana</Button>
        <div className="flex items-center gap-1 ml-2">
          <Button size="icon" variant="ghost" onClick={() => setDate(addDays(date, view === "day" ? -1 : -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium px-2">{format(date, "dd MMM yyyy")}</span>
          <Button size="icon" variant="ghost" onClick={() => setDate(addDays(date, view === "day" ? 1 : 7))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="ml-auto"><Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nueva reserva</Button></div>
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <div className="grid" style={{ gridTemplateColumns: `60px repeat(${days.length}, minmax(140px, 1fr))` }}>
          <div className="border-b border-r p-2 text-xs text-muted-foreground bg-muted/30"></div>
          {days.map((d, i) => (
            <div key={i} className="border-b p-2 text-xs font-medium bg-muted/30 text-center">{format(d, "EEE dd/MM")}</div>
          ))}
          {hours.map(h => (
            <>
              <div key={`h-${h}`} className="border-r border-b p-2 text-xs text-muted-foreground">{String(h).padStart(2,"0")}:00</div>
              {days.map((d, i) => (
                <div key={`${h}-${i}`} className="border-b border-l min-h-[60px] p-1 space-y-1">
                  {reservationsAt(d, h).map(r => (
                    <button key={r.id} onClick={() => { setEditing(r); setOpen(true); }} className="w-full text-left rounded-md border bg-card hover:bg-accent/40 px-2 py-1">
                      <div className="flex items-center justify-between gap-1"><span className="text-xs font-medium truncate">{r.reservation_time.slice(0,5)} · {r.customer_name}</span></div>
                      <div className="flex items-center justify-between mt-0.5"><span className="text-[11px] text-muted-foreground">{r.party_size}p</span><StatusBadge kind="reservation" value={r.status} /></div>
                      {tableLabel(r.table_id) && (
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5">🪑 {tableLabel(r.table_id)}</div>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </>
          ))}
        </div>
      </CardContent></Card>
      <ReservationFormDialog open={open} onOpenChange={setOpen} restaurantId={rid} initial={editing} onSaved={reload} />
    </AppShell>
  );
}