import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { SchedulePanel } from "@/components/restaurant-settings/SchedulePanel";
import { FaqsPanel } from "@/components/restaurant-settings/FaqsPanel";
import { TablesPanel } from "@/components/restaurant-settings/TablesPanel";
import { ConfirmationRulesPanel } from "@/components/restaurant-settings/ConfirmationRulesPanel";
import { RestaurantForm } from "@/components/RestaurantForm";
import { getAgentSettings, getNotificationSettings, getRestaurant } from "@/lib/queries";
import type { AgentSettings, NotificationSettings, Restaurant, SummaryFrequency } from "@/lib/types";
import { TONE_OPTIONS } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function RestaurantSettings() {
  const { profile } = useAuth();
  const rid = profile?.restaurant_id ?? "";
  const [r, setR] = useState<Restaurant | null>(null);
  const [agent, setAgent] = useState<AgentSettings | null>(null);
  const [notif, setNotif] = useState<NotificationSettings | null>(null);

  useEffect(() => {
    if (!rid) return;
    getRestaurant(rid).then(setR);
    getAgentSettings(rid).then(setAgent);
    getNotificationSettings(rid).then(setNotif);
  }, [rid]);

  async function saveAgent() {
    if (!agent) return;
    const { error } = await supabase.from("agent_settings").update(agent).eq("id", agent.id);
    if (error) return toast.error(error.message);
    toast.success("Tono guardado");
  }
  async function saveNotif() {
    if (!notif) return;
    const { error } = await supabase.from("notification_settings").update(notif).eq("id", notif.id);
    if (error) return toast.error(error.message);
    toast.success("Notificaciones guardadas");
  }
  async function saveRest(v: any) {
    if (!rid) return;
    const { error } = await supabase.from("restaurants").update(v).eq("id", rid);
    if (error) return toast.error(error.message);
    toast.success("Datos guardados");
    getRestaurant(rid).then(setR);
  }

  if (!rid || !r) return <AppShell variant="restaurant" title="Configuración"><p className="text-muted-foreground">Cargando…</p></AppShell>;

  return (
    <AppShell variant="restaurant" title="Configuración">
      <Tabs defaultValue="schedule">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="schedule">Horarios y capacidad</TabsTrigger>
          <TabsTrigger value="tables">Mesas</TabsTrigger>
          <TabsTrigger value="rules">Reglas de confirmación</TabsTrigger>
          <TabsTrigger value="faqs">FAQs del agente</TabsTrigger>
          <TabsTrigger value="agent">Tono del agente</TabsTrigger>
          <TabsTrigger value="notifications">Notificaciones</TabsTrigger>
          <TabsTrigger value="data">Datos del restaurante</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule"><SchedulePanel restaurantId={rid} /></TabsContent>
        <TabsContent value="tables"><TablesPanel restaurantId={rid} /></TabsContent>
        <TabsContent value="rules"><ConfirmationRulesPanel restaurantId={rid} /></TabsContent>
        <TabsContent value="faqs"><FaqsPanel restaurantId={rid} /></TabsContent>

        <TabsContent value="agent">
          {agent && (
            <Card><CardHeader><CardTitle className="text-base">Tono del agente</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Idioma principal</Label>
                  <Select value={agent.main_language ?? "es"} onValueChange={v => setAgent({ ...agent, main_language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="es">Español</SelectItem>
                      <SelectItem value="ca">Catalán</SelectItem>
                      <SelectItem value="en">Inglés</SelectItem>
                      <SelectItem value="fr">Francés</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Estilo de tono</Label>
                  <Select value={agent.tone_style ?? ""} onValueChange={v => setAgent({ ...agent, tone_style: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TONE_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Nivel de formalidad</Label>
                  <Select value={agent.formality_level ?? ""} onValueChange={v => setAgent({ ...agent, formality_level: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="bajo">Bajo</SelectItem><SelectItem value="medio">Medio</SelectItem><SelectItem value="alto">Alto</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Usa <code className="font-mono">{"{nombre_restaurante}"}</code> en los mensajes para insertar el nombre del restaurante automáticamente.
                </div>
                <div className="md:col-span-2 space-y-1.5"><Label>Mensaje de bienvenida</Label><Textarea value={replaceNameWithVar(agent.welcome_message, r.name)} onChange={e => setAgent({ ...agent, welcome_message: e.target.value })} placeholder="Hola, has llamado a {nombre_restaurante}…" /></div>
                <div className="md:col-span-2 space-y-1.5"><Label>Mensaje de confirmación</Label><Textarea value={replaceNameWithVar(agent.confirmation_message, r.name)} onChange={e => setAgent({ ...agent, confirmation_message: e.target.value })} placeholder="Tu reserva en {nombre_restaurante} está confirmada." /></div>
                <div className="md:col-span-2 space-y-1.5"><Label>Mensaje de cancelación</Label><Textarea value={replaceNameWithVar(agent.cancellation_message, r.name)} onChange={e => setAgent({ ...agent, cancellation_message: e.target.value })} placeholder="Tu reserva en {nombre_restaurante} ha sido cancelada." /></div>
                <div className="md:col-span-2 space-y-1.5"><Label>Mensaje de paso a humano</Label><Textarea value={replaceNameWithVar(agent.human_handoff_message, r.name)} onChange={e => setAgent({ ...agent, human_handoff_message: e.target.value })} placeholder="Te paso con el equipo de {nombre_restaurante}." /></div>
                <div className="md:col-span-2 space-y-1.5"><Label>Instrucciones adicionales</Label><Textarea value={replaceNameWithVar(agent.additional_instructions, r.name)} onChange={e => setAgent({ ...agent, additional_instructions: e.target.value })} /></div>
                <div className="md:col-span-2 flex justify-end"><Button onClick={saveAgent}>Guardar</Button></div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="notifications">
          {notif && (
            <Card><CardHeader><CardTitle className="text-base">Notificaciones</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {notif.notify_by_email && <Badge variant="secondary">Email activo</Badge>}
                  {notif.notify_by_whatsapp && <Badge variant="secondary">WhatsApp activo</Badge>}
                  {notif.send_summary && <Badge variant="secondary">Resumen {notif.summary_frequency === "daily" ? "diario" : "cada 12h"}</Badge>}
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>Email del responsable</Label><Input value={notif.manager_email ?? ""} onChange={e => setNotif({ ...notif, manager_email: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>WhatsApp del responsable</Label><Input value={notif.manager_whatsapp ?? ""} onChange={e => setNotif({ ...notif, manager_whatsapp: e.target.value })} /></div>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {[
                    ["notify_by_email","Avisos por email"],
                    ["notify_by_whatsapp","Avisos por WhatsApp"],
                    ["notify_new_reservation","Nueva reserva"],
                    ["notify_modified_reservation","Reserva modificada"],
                    ["notify_cancelled_reservation","Reserva cancelada"],
                    ["notify_human_required","Requiere revisión"],
                    ["send_summary","Resumen diario"],
                  ].map(([k,l]) => (
                    <div key={k} className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <span className="text-sm">{l}</span>
                      <Switch checked={(notif as any)[k]} onCheckedChange={c => setNotif({ ...notif, [k]: c } as any)} />
                    </div>
                  ))}
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>Frecuencia del resumen</Label>
                    <Select value={notif.summary_frequency} onValueChange={v => setNotif({ ...notif, summary_frequency: v as SummaryFrequency })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="daily">Diario</SelectItem><SelectItem value="every_12_hours">Cada 12 horas</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Hora del resumen</Label><Input type="time" value={notif.summary_time?.slice(0,5) ?? ""} onChange={e => setNotif({ ...notif, summary_time: e.target.value })} /></div>
                </div>
                <div className="flex justify-end"><Button onClick={saveNotif}>Guardar</Button></div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="data">
          <Card><CardHeader><CardTitle className="text-base">Datos del restaurante</CardTitle></CardHeader><CardContent><RestaurantForm initial={r} onSubmit={saveRest} hideAdminFields /></CardContent></Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}