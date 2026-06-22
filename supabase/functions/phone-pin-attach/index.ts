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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const pepper = Deno.env.get("VAULT_PIN_PEPPER")!;

    // Verify caller via their JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { phone, pin, countryCode } = await req.json();
    const phoneE164 = normalizePhone(phone);
    if (!phoneE164 || !/^\d{5}$/.test(String(pin || ""))) {
      return new Response(JSON.stringify({ error: "Invalid phone or PIN" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Ensure no other account already owns this phone
    const { data: existing } = await admin
      .from("profiles")
      .select("user_id")
      .eq("phone_e164", phoneE164)
      .maybeSingle();
    if (existing && existing.user_id !== userData.user.id) {
      return new Response(
        JSON.stringify({ error: "Phone number is already linked to another vault" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const enc = new TextEncoder();
    const h = await crypto.subtle.digest(
      "SHA-256",
      enc.encode(`${pepper}:pin:${phoneE164}:${pin}`),
    );
    const pinHash = Array.from(new Uint8Array(h))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await admin
      .from("profiles")
      .update({
        phone: phoneE164,
        phone_e164: phoneE164,
        country_code: countryCode || null,
        pin_hash: pinHash,
      })
      .eq("user_id", userData.user.id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
