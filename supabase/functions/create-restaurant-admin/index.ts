import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Verify caller is platform_admin
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Invalid session" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (callerProfile?.role !== "platform_admin") {
    return json({ error: "Forbidden" }, 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const fullName = String(body?.fullName ?? "").trim();
  const restaurantId = body?.restaurantId ? String(body.restaurantId) : null;

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Email inválido" }, 400);
  if (!password || password.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
  if (!restaurantId) return json({ error: "Falta restaurantId" }, 400);

  // Confirm restaurant exists
  const { data: rest } = await admin.from("restaurants").select("id, name").eq("id", restaurantId).maybeSingle();
  if (!rest) return json({ error: "Restaurante no encontrado" }, 404);

  // Check existing user
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users?.find((x) => x.email?.toLowerCase() === email);

  let userId: string;
  let created = false;

  if (existing) {
    userId = existing.id;
    // Update password + metadata
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || existing.user_metadata?.full_name, role: "restaurant_admin" },
    });
    if (updErr) return json({ error: updErr.message }, 400);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || email, role: "restaurant_admin" },
    });
    if (error || !data.user) return json({ error: error?.message ?? "No se pudo crear" }, 400);
    userId = data.user.id;
    created = true;
  }

  // Upsert profile with role + restaurant assignment.
  // Uses the admin (service role) client; the trigger
  // prevent_profile_privilege_escalation bypasses when auth.uid() IS NULL.
  const { error: profErr } = await admin.from("profiles").upsert({
    id: userId,
    email,
    full_name: fullName || email,
    role: "restaurant_admin",
    restaurant_id: restaurantId,
  });
  if (profErr) return json({ error: profErr.message }, 400);

  return json({
    ok: true,
    created,
    user: { id: userId, email, full_name: fullName, restaurant_id: restaurantId, restaurant_name: rest.name },
  });
});