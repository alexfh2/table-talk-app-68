import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { listManagerProfiles } from "@/lib/queries";
import type { Profile } from "@/lib/types";
import { toast } from "sonner";
import { Copy, KeyRound, RefreshCw, UserPlus } from "lucide-react";

function generatePassword(len = 16) {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%&*?-_=+";
  const all = lower + upper + digits + symbols;
  const pick = (set: string) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return set[a[0] % set.length];
  };
  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  const rest = new Uint32Array(Math.max(len - chars.length, 4));
  crypto.getRandomValues(rest);
  for (let i = 0; i < rest.length; i++) chars.push(all[rest[i] % all.length]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = new Uint32Array(1);
    crypto.getRandomValues(j);
    const k = j[0] % (i + 1);
    [chars[i], chars[k]] = [chars[k], chars[i]];
  }
  return chars.join("");
}

function isPasswordStrongEnough(value: string) {
  return (
    value.length >= 16 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[!@#$%&*?\-_=+]/.test(value)
  );
}

async function extractFunctionError(error: any) {
  const message = String(error?.message ?? "");
  let details = "";
  try {
    if (error?.context instanceof Response) {
      details = await error.context.clone().text();
    }
  } catch {
    details = "";
  }
  return `${message} ${details}`.trim();
}

export function RestaurantManagersPanel({ restaurantId }: { restaurantId: string }) {
  const [managers, setManagers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState(() => generatePassword());
  const [lastCreated, setLastCreated] = useState<{ email: string; password: string } | null>(null);

  const restaurantManagers = useMemo(
    () => managers.filter((m) => m.restaurant_id === restaurantId),
    [managers, restaurantId],
  );

  async function refresh() {
    setManagers(await listManagerProfiles());
  }

  useEffect(() => {
    refresh();
  }, [restaurantId]);

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
    if (!email.trim()) return toast.error("Introduce un email");
    if (!isPasswordStrongEnough(password)) {
      setPassword(generatePassword());
      return toast.error("La contraseña manual es demasiado débil. He generado una segura, vuelve a intentarlo.");
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-restaurant-admin", {
        body: { email: email.trim(), password, fullName: fullName.trim(), restaurantId },
      });
      if (error) {
        const msg = await extractFunctionError(error);
        if (/weak|known|guess|pwned/i.test(msg)) {
          setPassword(generatePassword());
          toast.error("Esa contraseña aparece en filtraciones conocidas. He generado una nueva, vuelve a intentarlo.");
          return;
        }
        toast.error(msg || "No se pudo crear");
        return;
      }
      if (!data?.ok) throw new Error(data?.error ?? "Error desconocido");

      setLastCreated({ email: email.trim(), password });
      toast.success(data.created ? "Credenciales creadas" : "Credenciales actualizadas");
      setEmail("");
      setFullName("");
      setPassword(generatePassword());
      refresh();
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (/weak|known|guess|pwned/i.test(msg)) {
        setPassword(generatePassword());
        toast.error("Esa contraseña aparece en filtraciones conocidas. He generado una nueva, vuelve a intentarlo.");
      } else {
        toast.error(msg || "No se pudo crear");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Crear credenciales para el responsable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3">
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
              <p className="text-[11px] text-muted-foreground mt-1">Si el email ya existe, se reemplazará la contraseña y se asignará a este restaurante.</p>
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
          <CardTitle className="text-base">Administradores de este restaurante</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {restaurantManagers.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay administradores asignados.</p>}
          {restaurantManagers.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{m.full_name || m.email}</p>
                <p className="text-xs text-muted-foreground truncate">{m.email}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}