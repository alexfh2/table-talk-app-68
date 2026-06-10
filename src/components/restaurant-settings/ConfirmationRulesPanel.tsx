import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAgentSettings } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import type { AgentSettings } from "@/lib/types";
import { toast } from "sonner";

/**
 * Reglas de confirmación.
 * Comparte la misma fila de `agent_settings` que usa el Panel Restaurante
 * y la vista Platform Admin: una sola fuente de verdad.
 */
export function ConfirmationRulesPanel({ restaurantId }: { restaurantId: string }) {
  const [s, setS] = useState<AgentSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    getAgentSettings(restaurantId).then(setS);
  }, [restaurantId]);

  async function save() {
    if (!s) return;
    setSaving(true);
    const { error } = await supabase
      .from("agent_settings")
      .update({
        max_party_size_auto: s.max_party_size_auto,
        min_notice_hours: s.min_notice_hours,
        max_advance_days: s.max_advance_days,
        voice_reservation_policy: s.voice_reservation_policy,
        missing_phone_policy: s.missing_phone_policy,
        slot_almost_full_threshold: s.slot_almost_full_threshold,
      })
      .eq("id", s.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Reglas guardadas");
  }

  if (!s) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Cargando reglas…</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reglas de confirmación</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Confirmación automática</h3>
          <p className="text-xs text-muted-foreground">Cuándo el agente puede confirmar reservas sin intervención humana.</p>
        </div>
        <section className="space-y-2">
          <Label>Confirmar automáticamente hasta</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              className="w-28"
              value={s.max_party_size_auto ?? 8}
              onChange={(e) => setS({ ...s, max_party_size_auto: Number(e.target.value) })}
            />
            <span className="text-sm text-muted-foreground">personas</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Las reservas de más personas requerirán revisión antes de confirmarse.
          </p>
        </section>

        <div className="space-y-1 pt-2 border-t">
          <h3 className="text-sm font-semibold">Reservas que requieren revisión</h3>
          <p className="text-xs text-muted-foreground">Casos en los que la reserva se guarda pero necesita validación manual.</p>
        </div>
        <section className="space-y-2">
          <Label>¿Qué hacer con reservas creadas por voz?</Label>
          <Select
            value={s.voice_reservation_policy}
            onValueChange={(v) =>
              setS({ ...s, voice_reservation_policy: v as AgentSettings["voice_reservation_policy"] })
            }
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto_if_no_conflict">Confirmar automáticamente si no hay conflictos</SelectItem>
              <SelectItem value="requires_review">Guardar siempre como requiere revisión</SelectItem>
            </SelectContent>
          </Select>
        </section>

        <section className="space-y-2">
          <Label>Si falta teléfono</Label>
          <Select
            value={s.missing_phone_policy}
            onValueChange={(v) =>
              setS({ ...s, missing_phone_policy: v as AgentSettings["missing_phone_policy"] })
            }
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="allow_confirm">Permitir confirmar</SelectItem>
              <SelectItem value="requires_review">Requiere revisión</SelectItem>
            </SelectContent>
          </Select>
        </section>

        <section className="space-y-2 rounded-lg border border-border/60 bg-secondary/30 p-4">
          <Label className="text-sm">Reservas fuera del horario configurado</Label>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>· Reservas manuales: <span className="text-foreground">Bloquear</span></li>
            <li>· Reservas por voz: <span className="text-foreground">Guardar como requiere revisión</span></li>
          </ul>
        </section>

        <div className="space-y-1 pt-2 border-t">
          <h3 className="text-sm font-semibold">Límites de reserva</h3>
          <p className="text-xs text-muted-foreground">Antelación, ventanas permitidas y avisos de capacidad.</p>
        </div>
        <section className="space-y-2">
          <Label>Avisar cuando queden</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              className="w-28"
              value={s.slot_almost_full_threshold ?? 4}
              onChange={(e) => setS({ ...s, slot_almost_full_threshold: Number(e.target.value) })}
            />
            <span className="text-sm text-muted-foreground">plazas</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Se mostrará un aviso cuando queden pocas plazas en una franja.
          </p>
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Antelación mínima para reservar</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                className="w-28"
                value={s.min_notice_hours ?? 0}
                onChange={(e) => setS({ ...s, min_notice_hours: Number(e.target.value) })}
              />
              <span className="text-sm text-muted-foreground">horas</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Permitir reservas hasta</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                className="w-28"
                value={s.max_advance_days ?? 30}
                onChange={(e) => setS({ ...s, max_advance_days: Number(e.target.value) })}
              />
              <span className="text-sm text-muted-foreground">días</span>
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}