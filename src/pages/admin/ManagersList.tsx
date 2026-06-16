import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { listRestaurants, listManagerProfiles } from "@/lib/queries";
import type { Restaurant, Profile } from "@/lib/types";
import { toast } from "sonner";
import { Copy, KeyRound, RefreshCw, UserPlus } from "lucide-react";

function generatePassword(len = 12) {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

export default function ManagersList() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [managers, setManagers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const [restaurantId, setRestaurantId] = useState<string>("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [lastCreated, setLastCreated] = useState<{ email: string; password: string; restaurant: string } | null>(null);

  const restaurantsById = useMemo(() => Object.fromEntries(restaurants.map((r) => [r.id, r])), [restaurants]);

  async function refresh() {
    const [rs, ms] = await Promise.all([listRestaurants(), listManagerProfiles()]);
    setRestaurants(rs);
    setManagers(ms);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!restaurantId) return toast.error("Selecciona un restaurante");
    if (!email.trim()) return toast.error("Introduce un email");
    if (password.length < 8) return toast.error("Contraseña mínima de 8 caracteres");

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-restaurant-admin", {
        body: { email: email.trim(), password, fullName: fullName.trim(), restaurantId },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Error desconocido");

      const restName = restaurantsById[restaurantId]?.name ?? "";
      setLastCreated({ email: email.trim(), password, restaurant: restName });
      toast.success(data.created ? "Credenciales creadas" : "Credenciales actualizadas");
      setEmail("");
      setFullName("");
      setPassword(generatePassword());
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo crear");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell variant="admin" title="Administradores">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> Crear credenciales de restaurante
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <Label className="text-xs">Restaurante</Label>
                <Select value={restaurantId} onValueChange={setRestaurantId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {restaurants.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Nombre del responsable</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre y apellidos" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="responsable@restaurante.com" required />
              </div>
              <div>
                <Label className="text-xs">Contraseña</Label>
                <div className="flex gap-2">
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                  <Button type="button" variant="outline" size="icon" onClick={() => setPassword(generatePassword())} title="Generar nueva">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" onClick={() => copy(password, "Contraseña")} title="Copiar">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Mínimo 8 caracteres. Si el email ya existe, se reemplazará la contraseña y se reasignará el restaurante.</p>
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                <KeyRound className="h-4 w-4 mr-1.5" />
                {loading ? "Creando…" : "Crear credenciales"}
              </Button>
            </form>

            {lastCreated && (
              <div className="mt-4 rounded-lg border bg-muted/40 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Últimas credenciales generadas — cópialas ahora, no se mostrarán de nuevo.</p>
                <div className="text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span><b>Restaurante:</b> {lastCreated.restaurant}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono break-all">{lastCreated.email}</span>
                    <Button size="sm" variant="ghost" onClick={() => copy(lastCreated.email, "Email")}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono break-all">{lastCreated.password}</span>
                    <Button size="sm" variant="ghost" onClick={() => copy(lastCreated.password, "Contraseña")}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Administradores existentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {managers.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay administradores de restaurante.</p>}
            {managers.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{m.full_name || m.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                </div>
                <p className="text-xs text-muted-foreground truncate max-w-[40%] text-right">
                  {m.restaurant_id ? restaurantsById[m.restaurant_id]?.name ?? "—" : "Sin asignar"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}