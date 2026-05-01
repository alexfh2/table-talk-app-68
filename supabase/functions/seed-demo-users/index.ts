import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO_USERS = [
  {
    email: "admin@demo.app",
    password: "demo1234",
    full_name: "Platform Admin Demo",
    role: "platform_admin",
    restaurant_id: null as string | null,
  },
  {
    email: "manager@trattoriabella.es",
    password: "demo1234",
    full_name: "Marco Rossi",
    role: "restaurant_admin",
    restaurant_id: "11111111-1111-1111-1111-111111111111",
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const results: Array<{ email: string; status: string; id?: string }> = [];

    for (const u of DEMO_USERS) {
      // Try to find existing
      const { data: list } = await supabase.auth.admin.listUsers();
      const existing = list?.users?.find((x) => x.email === u.email);
      let userId = existing?.id;

      if (!existing) {
        const { data, error } = await supabase.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
          user_metadata: { full_name: u.full_name, role: u.role },
        });
        if (error) {
          results.push({ email: u.email, status: `error: ${error.message}` });
          continue;
        }
        userId = data.user!.id;
      }

      // Upsert profile (the auth trigger should have created it; we just enforce role + restaurant)
      await supabase
        .from("profiles")
        .upsert({
          id: userId!,
          email: u.email,
          full_name: u.full_name,
          role: u.role,
          restaurant_id: u.restaurant_id,
        });

      results.push({ email: u.email, status: existing ? "already_existed" : "created", id: userId });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});