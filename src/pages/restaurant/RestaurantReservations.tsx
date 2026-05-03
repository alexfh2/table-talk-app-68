import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { ReservationFormDialog } from "@/components/ReservationFormDialog";
import { listReservations } from "@/lib/queries";
import { useAuth } from "@/hooks/useAuth";
import { CHANNEL_LABELS, RESERVATION_STATUS_LABELS, type Reservation, type ReservationStatus, type RestaurantTable, type Zone } from "@/lib/types";
import { Plus, Pencil, Ban, UserX } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

export default function RestaurantReservations() {
  const { profile } = useAuth();
  const rid = profile?.restaurant_id ?? "";
  const [items, setItems] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [status, setStatus] = useState<ReservationStatus | "all">("all");
  const [date, setDate] = useState("");

  function reload() {
    if (!rid) return;
    listReservations(rid).then(setItems);
    supabase.from("restaurant_tables").select("*").eq("restaurant_id", rid).then(({ data }) => setTables((data ?? []) as RestaurantTable[]));
    supabase.from("restaurant_zones").select("*").eq("restaurant_id", rid).then(({ data }) => setZones((data ?? []) as Zone[]));
  }
  useEffect(reload, [rid]);

  function tableLabel(id: string | null): string {
    if (!id) return "—";
    const t = tables.find(x => x.id === id);
    if (!t) return "—";
    const z = zones.find(z => z.id === t.zone_id);
    return z ? `${t.label} · ${z.name}` : t.label;
  }

  const filtered = items.filter(r =>
    (status === "all" || r.status === status) &&
    (!date || r.reservation_date === date)
  );

  async function setReservationStatus(id: string, s: ReservationStatus) {
    const { error } = await supabase.from("reservations").update({ status: s }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Reserva actualizada");
    reload();
  }

  return (
    <AppShell variant="restaurant" title="Reservas">
      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(RESERVATION_STATUS_LABELS).map(([k,l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        <div className="ml-auto"><Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Nueva reserva</Button></div>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Cliente</TableHead><TableHead>Teléfono</TableHead><TableHead>Fecha</TableHead><TableHead>Hora</TableHead>
              <TableHead>Personas</TableHead><TableHead>Mesa</TableHead><TableHead>Estado</TableHead><TableHead>Canal</TableHead><TableHead>Notas</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.customer_name}</TableCell>
                  <TableCell>{r.customer_phone ?? "—"}</TableCell>
                  <TableCell>{format(new Date(r.reservation_date), "dd/MM/yyyy")}</TableCell>
                  <TableCell>{r.reservation_time.slice(0,5)}</TableCell>
                  <TableCell>{r.party_size}</TableCell>
                  <TableCell className="text-xs">{tableLabel(r.table_id)}</TableCell>
                  <TableCell><StatusBadge kind="reservation" value={r.status} /></TableCell>
                  <TableCell className="text-muted-foreground text-xs">{CHANNEL_LABELS[r.channel]}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">{r.customer_notes ?? "—"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setReservationStatus(r.id, "cancelled")}><Ban className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setReservationStatus(r.id, "no_show")}><UserX className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">Sin reservas.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </Card>
      <ReservationFormDialog open={open} onOpenChange={setOpen} restaurantId={rid} initial={editing} onSaved={reload} />
    </AppShell>
  );
}