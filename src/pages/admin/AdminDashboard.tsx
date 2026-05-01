import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Store, CalendarDays, AlertTriangle, FileEdit } from "lucide-react";
import { listRestaurants, listReservations, listHandoff } from "@/lib/queries";
import { Restaurant, Reservation, HandoffRequest } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { Link } from "react-router-dom";

export default function AdminDashboard() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [handoff, setHandoff] = useState<HandoffRequest[]>([]);

  useEffect(() => {
    listRestaurants().then(setRestaurants);
    listReservations().then(setReservations);
    listHandoff().then(setHandoff);
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const reservationsToday = reservations.filter((r) => r.reservation_date === today).length;
  const pendingHandoff = handoff.filter((h) => h.status === "pending").length;
  const active = restaurants.filter((r) => r.status === "active").length;
  const drafts = restaurants.filter((r) => r.status === "draft").length;

  return (
    <AppShell variant="admin" title="Dashboard">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Restaurantes activos" value={active} hint={`${restaurants.length} en total`} icon={Store} tone="success" />
        <MetricCard title="En borrador" value={drafts} icon={FileEdit} tone="warning" />
        <MetricCard title="Reservas hoy" value={reservationsToday} icon={CalendarDays} tone="info" />
        <MetricCard title="Atención humana" value={pendingHandoff} hint="Pendientes" icon={AlertTriangle} tone="danger" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimos restaurantes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {restaurants.slice(0, 5).map((r) => (
              <Link
                key={r.id}
                to={`/admin/restaurants/${r.id}`}
                className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-accent/40 transition"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.manager_name ?? "—"}</p>
                </div>
                <StatusBadge kind="restaurant" value={r.status} />
              </Link>
            ))}
            {restaurants.length === 0 && <p className="text-sm text-muted-foreground">Sin restaurantes todavía.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimas reservas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reservations.slice(0, 6).map((r) => {
              const rest = restaurants.find((x) => x.id === r.restaurant_id);
              return (
                <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.customer_name} · {r.party_size}p</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {rest?.name} · {format(new Date(r.reservation_date), "dd/MM")} {r.reservation_time.slice(0, 5)}
                    </p>
                  </div>
                  <StatusBadge kind="reservation" value={r.status} />
                </div>
              );
            })}
            {reservations.length === 0 && <p className="text-sm text-muted-foreground">Sin reservas todavía.</p>}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}