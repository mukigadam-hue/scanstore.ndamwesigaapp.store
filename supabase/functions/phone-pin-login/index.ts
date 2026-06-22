import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizePhone(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 6) return null;
  return "+" + digits;
}

async function derivePassword(
  pepper: string,
  phoneE164: string,
  pin: string,
): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${pepper}:${phoneE164}:${pin}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function syntheticEmail(phoneE164: string): string {
  return `vault+${phoneE164.replace(/\D/g, "")}@vaultmail.local`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { phone, pin } = await req.json();
    const phoneE164 = normalizePhone(phone);
    if (!phoneE164 || !/^\d{5}$/.test(String(pin || ""))) {
      return new Response(JSON.stringify({ error: "Invalid phone or PIN" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pepper = Deno.env.get("VAULT_PIN_PEPPER")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile } = await admin
      .from("profiles")
      .select("user_id, auth_method")
      .eq("phone_e164", phoneE164)
      .maybeSingle();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: "No vault found for that phone number" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const synthEmail = syntheticEmail(phoneE164);
    const password = await derivePassword(pepper, phoneE164, String(pin));
    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: signInData, error } = await anon.auth.signInWithPassword({
      email: synthEmail,
      password,
    });

    if (error || !signInData.session) {
      return new Response(
        JSON.stringify({ error: "Incorrect PIN. Please try again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ session: signInData.session, user: signInData.user }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
