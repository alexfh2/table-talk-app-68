import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RestaurantForm, RestaurantFormValues } from "@/components/RestaurantForm";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";

export default function RestaurantNew() {
  const nav = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(v: RestaurantFormValues) {
    setSubmitting(true);
    const { data, error } = await supabase.from("restaurants").insert(v as any).select().single();
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // Provision default agent + notification settings
    await supabase.from("agent_settings").insert({ restaurant_id: data.id });
    await supabase.from("notification_settings").insert({
      restaurant_id: data.id,
      manager_email: v.manager_email ?? null,
      manager_whatsapp: v.manager_whatsapp ?? null,
    });
    toast.success("Restaurante creado");
    nav(`/admin/restaurants/${data.id}`);
  }

  return (
    <AppShell variant="admin" title="Nuevo restaurante">
      <Card className="max-w-4xl">
        <CardHeader><CardTitle className="text-base">Datos del restaurante</CardTitle></CardHeader>
        <CardContent>
          <RestaurantForm onSubmit={handleCreate} submitting={submitting} />
        </CardContent>
      </Card>
    </AppShell>
  );
}