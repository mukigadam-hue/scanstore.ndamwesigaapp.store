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
    const { phone, pin, countryCode, email } = await req.json();
    const phoneE164 = normalizePhone(phone);
    if (!phoneE164) {
      return new Response(JSON.stringify({ error: "Invalid phone number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^\d{5}$/.test(String(pin || ""))) {
      return new Response(JSON.stringify({ error: "PIN must be exactly 5 digits" }), {
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

    // Check phone already exists
    const { data: existing } = await admin
      .from("profiles")
      .select("user_id")
      .eq("phone_e164", phoneE164)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({
          error:
            "This phone number is already registered. Try signing in or recover your vault.",
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const synthEmail = syntheticEmail(phoneE164);
    const password = await derivePassword(pepper, phoneE164, String(pin));

    // bcrypt-style PIN hash via pgcrypto for in-app PIN verification later
    const { data: pinHashRow, error: pinHashErr } = await admin.rpc("crypt", {
      password: String(pin),
      salt: "$2a$10$" + crypto.randomUUID().replace(/-/g, "").slice(0, 22),
    } as any);
    // Fall back: simple SHA-256 stored hash if crypt RPC unavailable
    let pinHash: string;
    if (pinHashErr || !pinHashRow) {
      const enc = new TextEncoder();
      const h = await crypto.subtle.digest(
        "SHA-256",
        enc.encode(`${pepper}:pin:${phoneE164}:${pin}`),
      );
      pinHash = Array.from(new Uint8Array(h))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } else {
      pinHash = String(pinHashRow);
    }

    const optionalEmail =
      typeof email === "string" && email.trim().length > 3 ? email.trim() : null;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: synthEmail,
      password,
      email_confirm: true,
      user_metadata: {
        phone: phoneE164,
        phone_e164: phoneE164,
        country_code: countryCode || null,
        pin_hash: pinHash,
        auth_method: "phone_pin",
        contact_email: optionalEmail,
      },
    });

    if (createErr || !created.user) {
      return new Response(
        JSON.stringify({ error: createErr?.message || "Failed to create account" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // If user provided a real email, store it in profile.email
    if (optionalEmail) {
      await admin
        .from("profiles")
        .update({ email: optionalEmail })
        .eq("user_id", created.user.id);
    }

    // Sign in to get session tokens
    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInData, error: signInErr } =
      await anon.auth.signInWithPassword({ email: synthEmail, password });

    if (signInErr || !signInData.session) {
      return new Response(
        JSON.stringify({ error: signInErr?.message || "Account created but sign-in failed" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        session: signInData.session,
        user: signInData.user,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
