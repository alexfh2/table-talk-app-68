import { AppShell } from "@/components/AppShell";
import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { getRestaurant } from "@/lib/queries";
import type { Restaurant } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RestaurantForm, RestaurantFormValues } from "@/components/RestaurantForm";
import { SchedulePanel } from "@/components/restaurant-settings/SchedulePanel";
import { FaqsPanel } from "@/components/restaurant-settings/FaqsPanel";
import { TablesPanel } from "@/components/restaurant-settings/TablesPanel";
import { ConfirmationRulesPanel } from "@/components/restaurant-settings/ConfirmationRulesPanel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function RestaurantConfig() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<Restaurant | null>(null);

  useEffect(() => { if (id) getRestaurant(id).then(setR); }, [id]);

  async function save(v: RestaurantFormValues) {
    if (!id) return;
    const { error } = await supabase.from("restaurants").update(v).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Guardado");
    getRestaurant(id).then(setR);
  }

  if (!r) return <AppShell variant="admin" title="Cargando…"><p className="text-muted-foreground">Cargando…</p></AppShell>;

  return (
    <AppShell variant="admin" title={r.name}>
      <div className="mb-3">
        <Button asChild variant="ghost" size="sm"><Link to="/admin/restaurants"><ArrowLeft className="h-4 w-4 mr-1" />Volver</Link></Button>
      </div>
      <Tabs defaultValue="basic">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="basic">Datos básicos</TabsTrigger>
          <TabsTrigger value="calendar">Calendario</TabsTrigger>
          <TabsTrigger value="schedule">Horarios y capacidad</TabsTrigger>
          <TabsTrigger value="tables">Mesas</TabsTrigger>
          <TabsTrigger value="rules">Reglas de confirmación</TabsTrigger>
          <TabsTrigger value="reservations">Reservas</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          <TabsTrigger value="agent">Tono del agente</TabsTrigger>
          <TabsTrigger value="notifications">Notificaciones</TabsTrigger>
          <TabsTrigger value="integrations">Integraciones</TabsTrigger>
          <TabsTrigger value="handoff">Atención humana</TabsTrigger>
        </TabsList>

        <TabsContent value="basic"><Card><CardHeader><CardTitle className="text-base">Datos básicos</CardTitle></CardHeader><CardContent><RestaurantForm initial={r} onSubmit={save} /></CardContent></Card></TabsContent>
        <TabsContent value="calendar"><Card><CardContent className="p-6 text-sm text-muted-foreground">Tipo de calendario actual: <b className="capitalize text-foreground">{r.calendar_type}</b>. Edítalo en la pestaña “Datos básicos”.</CardContent></Card></TabsContent>
        <TabsContent value="schedule"><SchedulePanel restaurantId={r.id} /></TabsContent>
        <TabsContent value="tables"><TablesPanel restaurantId={r.id} /></TabsContent>
        <TabsContent value="rules"><ConfirmationRulesPanel restaurantId={r.id} /></TabsContent>
        <TabsContent value="reservations"><Card><CardContent className="p-6 text-sm text-muted-foreground">La gestión completa de reservas vive en el panel del restaurante (<Link to="/restaurant/reservations" className="underline">/restaurant/reservations</Link>). Inicia sesión como Restaurant Admin del local para CRUD completo.</CardContent></Card></TabsContent>
        <TabsContent value="faqs"><FaqsPanel restaurantId={r.id} /></TabsContent>
        <TabsContent value="agent"><Card><CardContent className="p-6 text-sm text-muted-foreground">Configuración disponible también en la sección de Restaurant Admin → Configuración → Tono del agente.</CardContent></Card></TabsContent>
        <TabsContent value="notifications"><Card><CardContent className="p-6 text-sm text-muted-foreground">Configuración disponible en Restaurant Admin → Configuración → Notificaciones.</CardContent></Card></TabsContent>
        <TabsContent value="integrations"><Card><CardContent className="p-6 text-sm text-muted-foreground">Datos de integración con calendario externo guardados en el modelo <code>external_calendar_settings</code>. Editor visual disponible en próxima iteración.</CardContent></Card></TabsContent>
        <TabsContent value="handoff"><Card><CardContent className="p-6 text-sm text-muted-foreground">Las solicitudes que requieren atención humana se gestionan en <Link to="/restaurant/handoff" className="underline">/restaurant/handoff</Link>.</CardContent></Card></TabsContent>
      </Tabs>
    </AppShell>
  );
}