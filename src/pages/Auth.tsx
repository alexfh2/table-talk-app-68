import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";

export default function Auth() {
  const { signIn, profile, session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (session && profile) {
      navigate(profile.role === "platform_admin" ? "/admin" : "/restaurant", { replace: true });
    }
  }, [session, profile, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) toast.error(error);
  }

  function fill(role: "admin" | "manager") {
    if (role === "admin") {
      setEmail("admin@demo.app");
      setPassword("demo1234");
    } else {
      setEmail("manager@trattoriabella.es");
      setPassword("demo1234");
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-background to-accent p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="rounded-lg bg-primary text-primary-foreground p-2">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <span className="text-xl font-semibold">Reservas Pro</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Iniciar sesión</CardTitle>
            <CardDescription>Acceso a la herramienta interna de gestión.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Entrando…" : "Entrar"}
              </Button>
            </form>

            <div className="mt-5 rounded-lg border bg-muted/40 p-3 text-xs">
              <p className="font-medium mb-2 text-foreground">Usuarios demo</p>
              <div className="space-y-1.5">
                <button
                  type="button"
                  className="block text-left underline-offset-2 hover:underline"
                  onClick={() => fill("admin")}
                >
                  Platform Admin · admin@demo.app / demo1234
                </button>
                <button
                  type="button"
                  className="block text-left underline-offset-2 hover:underline"
                  onClick={() => fill("manager")}
                >
                  Restaurant Admin · manager@trattoriabella.es / demo1234
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}