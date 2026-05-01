import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { listRestaurants } from "@/lib/queries";
import type { Restaurant, RestaurantStatus } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function RestaurantsList() {
  const [items, setItems] = useState<Restaurant[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RestaurantStatus | "all">("all");

  useEffect(() => {
    listRestaurants().then(setItems);
  }, []);

  const filtered = items.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (r.name.toLowerCase().includes(search.toLowerCase()) ||
        (r.manager_name ?? "").toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <AppShell variant="admin" title="Restaurantes">
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          placeholder="Buscar por nombre o responsable…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-sm"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="paused">Pausado</SelectItem>
          </SelectContent>
        </Select>
        <div className="sm:ml-auto">
          <Button asChild>
            <Link to="/admin/restaurants/new"><Plus className="h-4 w-4 mr-1.5" />Nuevo restaurante</Link>
          </Button>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Calendario</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.manager_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.contact_email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.main_phone ?? "—"}</TableCell>
                  <TableCell><StatusBadge kind="restaurant" value={r.status} /></TableCell>
                  <TableCell className="capitalize">{r.calendar_type}</TableCell>
                  <TableCell>{format(new Date(r.created_at), "dd/MM/yyyy")}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link to={`/admin/restaurants/${r.id}`}><Settings className="h-4 w-4 mr-1" />Configurar</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    No hay restaurantes que coincidan.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </AppShell>
  );
}