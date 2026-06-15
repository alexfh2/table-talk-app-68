import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Reservation, ReservationStatus, ReservationChannel, Zone, RestaurantTable } from "@/lib/types";
import { RESERVATION_STATUS_LABELS, CHANNEL_LABELS } from "@/lib/types";
import { toast } from "sonner";
import { autoAssignTable } from "@/lib/autoAssignTable";
import { syncReservationTables, getReservationTableIds } from "@/lib/reservationTables";
import {
  TableAssignmentPicker,
  selectionFromExisting,
  persistFromSelection,
  type TableSelection,
} from "@/components/TableAssignmentPicker";

export function ReservationFormDialog({
  open, onOpenChange, restaurantId, initial, onSaved,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  restaurantId: string;
  initial?: Reservation | null;
  onSaved: () => void;
}) {
  const [v, setV] = useState<Partial<Reservation>>({});
  const [saving, setSaving] = useState(false);
  const [zones, setZones] = useState<Zone[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [tableSelection, setTableSelection] = useState<TableSelection>({ kind: "none" });

  useEffect(() => {
    if (!open || !restaurantId) return;
    supabase.from("restaurant_zones").select("*").eq("restaurant_id", restaurantId).order("sort_order")
      .then(({ data }) => setZones((data as Zone[]) ?? []));
    supabase.from("restaurant_tables").select("*").eq("restaurant_id", restaurantId).order("sort_order")
      .then(({ data }) => setTables((data as RestaurantTable[]) ?? []));
  }, [open, restaurantId]);

  useEffect(() => {
    setV(initial ?? {
      customer_name: "", customer_phone: "",
      reservation_date: new Date().toISOString().slice(0,10),
      reservation_time: "20:00", party_size: 2,
      status: "pending" as ReservationStatus, channel: "manual" as ReservationChannel,
      customer_notes: "", internal_notes: "", table_id: null,
    });
  }, [initial, open]);

  useEffect(() => {
    if (!open) return;
    if (!initial?.id) {
      setTableSelection({ kind: "none" });
      return;
    }
    let cancelled = false;
    getReservationTableIds(initial.id).then((ids) => {
      if (cancelled) return;
      setTableSelection(
        selectionFromExisting({ tableIds: ids, fallbackTableId: initial.table_id ?? null }),
      );
    });
    return () => { cancelled = true; };
  }, [open, initial?.id, initial?.table_id]);

  async function save() {
    setSaving(true);
    const { tableId: selTableId, tableIds: selTableIds } = persistFromSelection(tableSelection);
    const payload: any = { ...v, restaurant_id: restaurantId, table_id: selTableId };

    // If user did not pick anything, try to auto-assign the smallest table that fits.
    let finalTableIds = selTableIds;
    if (!initial?.id && tableSelection.kind === "none" && payload.reservation_date && payload.reservation_time && payload.party_size) {
      const res = await autoAssignTable({
        restaurantId,
        date: payload.reservation_date,
        time: payload.reservation_time,
        partySize: Number(payload.party_size),
      });
      if ("tableLabel" in res) {
        payload.table_id = res.tableId;
        finalTableIds = [res.tableId];
        toast.message(`Mesa asignada automáticamente: ${res.tableLabel}`);
      } else if (res.needsReview) {
        payload.status = "requires_human";
        payload.internal_notes = [payload.internal_notes, "⚠ Sin mesa única que encaje. Requiere reasignación manual."].filter(Boolean).join("\n");
        toast.warning("No hay una mesa única que encaje. Reserva marcada para revisión humana.");
      }
      // If no capacity: do not block — let the reservation be saved without a table.
    }

    let savedId: string | null = initial?.id ?? null;
    if (initial?.id) {
      const { error } = await supabase.from("reservations").update(payload).eq("id", initial.id);
      if (error) { setSaving(false); return toast.error(error.message); }
    } else {
      const { data, error } = await supabase
        .from("reservations")
        .insert(payload)
        .select("id")
        .single();
      if (error) { setSaving(false); return toast.error(error.message); }
      savedId = (data as { id: string } | null)?.id ?? null;
    }
    if (savedId) {
      await syncReservationTables(savedId, finalTableIds);
    }
    setSaving(false);
    toast.success(initial ? "Reserva actualizada" : "Reserva creada");
    onOpenChange(false); onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Editar reserva" : "Nueva reserva"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5"><Label>Cliente *</Label><Input value={v.customer_name ?? ""} onChange={(e) => setV({ ...v, customer_name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Teléfono</Label><Input value={v.customer_phone ?? ""} onChange={(e) => setV({ ...v, customer_phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Personas</Label><Input type="number" min={1} value={v.party_size ?? 2} onChange={(e) => setV({ ...v, party_size: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={v.reservation_date ?? ""} onChange={(e) => setV({ ...v, reservation_date: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Hora</Label><Input type="time" value={(v.reservation_time ?? "").slice(0,5)} onChange={(e) => setV({ ...v, reservation_time: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Estado</Label>
            <Select value={v.status} onValueChange={(x) => setV({ ...v, status: x as ReservationStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(RESERVATION_STATUS_LABELS).map(([k,l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Canal</Label>
            <Select value={v.channel} onValueChange={(x) => setV({ ...v, channel: x as ReservationChannel })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CHANNEL_LABELS).map(([k,l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5"><Label>Notas del cliente</Label><Textarea rows={2} value={v.customer_notes ?? ""} onChange={(e) => setV({ ...v, customer_notes: e.target.value })} /></div>
          <div className="col-span-2 space-y-1.5">
            <Label>Asignación de mesa</Label>
            <TableAssignmentPicker
              restaurantId={restaurantId}
              date={v.reservation_date}
              time={(v.reservation_time ?? "").slice(0, 5)}
              partySize={Number(v.party_size ?? 0)}
              excludeReservationId={initial?.id}
              value={tableSelection}
              onChange={setTableSelection}
              currentAssignmentLabel={(() => {
                if (tableSelection.kind === "table") {
                  return tables.find((t) => t.id === tableSelection.tableId)?.label ?? null;
                }
                if (tableSelection.kind === "combo") {
                  return tableSelection.tableIds
                    .map((id) => tables.find((t) => t.id === id)?.label)
                    .filter(Boolean).join(" + ") || null;
                }
                return null;
              })()}
            />
          </div>
          <div className="col-span-2 space-y-1.5"><Label>Notas internas</Label><Textarea rows={2} value={v.internal_notes ?? ""} onChange={(e) => setV({ ...v, internal_notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}