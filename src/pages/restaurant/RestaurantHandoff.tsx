import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { listHandoff } from "@/lib/queries";
import type { HandoffRequest, HandoffStatus } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

export default function RestaurantHandoff() {
  const { profile } = useAuth();
  const rid = profile?.restaurant_id ?? "";
  const [items, setItems] = useState<HandoffRequest[]>([]);

  function reload() { if (rid) listHandoff(rid).then(setItems); }
  useEffect(reload, [rid]);

  async function setStatus(id: string, status: HandoffStatus) {
    const { error } = await supabase.from("human_handoff_requests").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Actualizado");
    reload();
  }

  return (
    <AppShell variant="restaurant" title="Requiere atención">
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Cliente</TableHead><TableHead>Teléfono</TableHead><TableHead>Canal</TableHead>
              <TableHead>Motivo</TableHead><TableHead>Mensaje</TableHead><TableHead>Fecha</TableHead>
              <TableHead>Estado</TableHead><TableHead className="text-right">Acciones</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {items.map(h => (
                <TableRow key={h.id}>
                  <TableCell className="font-medium">{h.customer_name ?? "—"}</TableCell>
                  <TableCell>{h.customer_phone ?? "—"}</TableCell>
                  <TableCell className="capitalize">{h.source_channel}</TableCell>
                  <TableCell>{h.reason ?? "—"}</TableCell>
                  <TableCell className="max-w-[280px] text-xs text-muted-foreground">{h.customer_message ?? "—"}</TableCell>
                  <TableCell className="text-xs">{format(new Date(h.created_at), "dd/MM HH:mm")}</TableCell>
                  <TableCell><StatusBadge kind="handoff" value={h.status} /></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {h.status !== "in_review" && <Button size="sm" variant="ghost" onClick={() => setStatus(h.id, "in_review")}>Revisar</Button>}
                    {h.status !== "resolved" && <Button size="sm" variant="ghost" onClick={() => setStatus(h.id, "resolved")}>Resolver</Button>}
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Sin solicitudes pendientes.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </Card>
    </AppShell>
  );
}