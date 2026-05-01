import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, CheckCircle2, XCircle, AlertTriangle, MessageCircle, Plus, Clock, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { listReservations, listHandoff, getNotificationSettings } from "@/lib/queries";
import type { Reservation, HandoffRequest, NotificationSettings } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Link } from "react-router-dom";
import { format } from "date-fns";

export default function RestaurantDashboard() {
  const { profile } = useAuth();
  const rid = profile?.restaurant_id;
  const [res, setRes] = useState<Reservation[]>([]);
  const [ho, setHo] = useState<HandoffRequest[]>([]);
  const [notif, setNotif] = useState<NotificationSettings | null>(null);

  useEffect(() => {
    if (!rid) return;
    listReservations(rid).then(setRes);
    listHandoff(rid).then(setHo);
    getNotificationSettings(rid).then(setNotif);
  }, [rid]);

  if (!rid) return <AppShell variant="restaurant" title="Sin restaurante asignado"><p className="text-muted-foreground">Tu cuenta no está asociada a ningún restaurante.</p></AppShell>;

  const today = new Date().toISOString().slice(0,10);
  const todayRes = res.filter(r => r.reservation_date === today);
  const upcoming = res.filter(r => r.reservation_date >= today).slice(0,6);
  const confirmed = res.filter(r => r.status === "confirmed").length;
  const cancelled = res.filter(r => r.status === "cancelled").length;
  const handoffPending = ho.filter(h => h.status === "pending").length;

  return (
    <AppShell variant="restaurant" title="Dashboard">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard title="Reservas hoy" value={todayRes.length} icon={CalendarDays} tone="info" />
        <MetricCard title="Confirmadas" value={confirmed} icon={CheckCircle2} tone="success" />
        <MetricCard title="Canceladas" value={cancelled} icon={XCircle} />
        <MetricCard title="Atención humana" value={handoffPending} icon={AlertTriangle} tone="danger" />
        <MetricCard title="Agente WhatsApp" value="Conectado" hint="+34 600 111 111" icon={MessageCircle} tone="success" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Próximas reservas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {upcoming.map(r => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <p className="font-medium">{r.customer_name} · {r.party_size}p</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(r.reservation_date), "dd/MM")} · {r.reservation_time.slice(0,5)}</p>
                </div>
                <StatusBadge kind="reservation" value={r.status} />
              </div>
            ))}
            {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Sin reservas próximas.</p>}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Accesos rápidos</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline" size="sm"><Link to="/restaurant/reservations"><Plus className="h-4 w-4 mr-1" />Nueva reserva</Link></Button>
              <Button asChild variant="outline" size="sm"><Link to="/restaurant/calendar"><CalendarDays className="h-4 w-4 mr-1" />Calendario</Link></Button>
              <Button asChild variant="outline" size="sm"><Link to="/restaurant/settings"><Clock className="h-4 w-4 mr-1" />Horarios</Link></Button>
              <Button asChild variant="outline" size="sm"><Link to="/restaurant/settings"><Settings className="h-4 w-4 mr-1" />Notificaciones</Link></Button>
            </CardContent>
          </Card>
          {notif?.send_summary && (
            <Card><CardContent className="p-4 text-sm">
              <p className="font-medium">Próximo resumen</p>
              <p className="text-muted-foreground">{notif.summary_frequency === "daily" ? "Diario" : "Cada 12h"} · {notif.summary_time?.slice(0,5)}</p>
            </CardContent></Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}