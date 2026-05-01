import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Restaurant, RestaurantStatus, CalendarType } from "@/lib/types";

export type RestaurantFormValues = Partial<Restaurant>;

export function RestaurantForm({
  initial,
  submitting,
  onSubmit,
}: {
  initial?: RestaurantFormValues;
  submitting?: boolean;
  onSubmit: (v: RestaurantFormValues) => void;
}) {
  const [v, setV] = useState<RestaurantFormValues>({
    name: "",
    address: "",
    main_phone: "",
    whatsapp_number: "",
    contact_email: "",
    manager_name: "",
    manager_email: "",
    manager_whatsapp: "",
    status: "draft" as RestaurantStatus,
    calendar_type: "internal" as CalendarType,
    notes_internal: "",
    ...initial,
  });

  const set = (k: keyof RestaurantFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Nombre del restaurante *</Label><Input required value={v.name ?? ""} onChange={set("name")} /></div>
        <div className="space-y-1.5"><Label>Dirección</Label><Input value={v.address ?? ""} onChange={set("address")} /></div>
        <div className="space-y-1.5"><Label>Teléfono principal</Label><Input value={v.main_phone ?? ""} onChange={set("main_phone")} /></div>
        <div className="space-y-1.5"><Label>WhatsApp del restaurante</Label><Input value={v.whatsapp_number ?? ""} onChange={set("whatsapp_number")} /></div>
        <div className="space-y-1.5"><Label>Email de contacto</Label><Input type="email" value={v.contact_email ?? ""} onChange={set("contact_email")} /></div>
        <div className="space-y-1.5"><Label>Nombre del responsable</Label><Input value={v.manager_name ?? ""} onChange={set("manager_name")} /></div>
        <div className="space-y-1.5"><Label>Email del responsable</Label><Input type="email" value={v.manager_email ?? ""} onChange={set("manager_email")} /></div>
        <div className="space-y-1.5"><Label>WhatsApp del responsable</Label><Input value={v.manager_whatsapp ?? ""} onChange={set("manager_whatsapp")} /></div>

        <div className="space-y-1.5">
          <Label>Estado</Label>
          <Select value={v.status} onValueChange={(x) => setV((p) => ({ ...p, status: x as RestaurantStatus }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Borrador</SelectItem>
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="paused">Pausado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Tipo de calendario</Label>
          <Select value={v.calendar_type} onValueChange={(x) => setV((p) => ({ ...p, calendar_type: x as CalendarType }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="internal">Interno</SelectItem>
              <SelectItem value="external">Externo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notas internas</Label>
        <Textarea value={v.notes_internal ?? ""} onChange={set("notes_internal")} rows={3} />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>{submitting ? "Guardando…" : "Guardar"}</Button>
      </div>
    </form>
  );
}