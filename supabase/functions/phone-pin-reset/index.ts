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
    const { phone, code, newPin } = await req.json();
    const phoneE164 = normalizePhone(phone);
    if (!phoneE164 || !/^\d{6}$/.test(String(code || "")) || !/^\d{5}$/.test(String(newPin || ""))) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const pepper = Deno.env.get("VAULT_PIN_PEPPER")!;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Validate code
    const { data: codeRow } = await admin
      .from("pin_recovery_codes")
      .select("id, code, expires_at, used_at")
      .eq("phone_e164", phoneE164)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!codeRow || codeRow.code !== String(code) || codeRow.used_at || new Date(codeRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Invalid or expired code" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find user
    const { data: profile } = await admin
      .from("profiles")
      .select("user_id")
      .eq("phone_e164", phoneE164)
      .maybeSingle();
    if (!profile) {
      return new Response(JSON.stringify({ error: "No vault found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute new password & update both auth password + profile PIN hash
    const newPassword = await derivePassword(pepper, phoneE164, String(newPin));
    const synthEmail = syntheticEmail(phoneE164);

    // Ensure the user's email is the synthetic one (in case they were email-only before)
    await admin.auth.admin.updateUserById(profile.user_id, {
      password: newPassword,
      email: synthEmail,
      email_confirm: true,
    });

    const enc = new TextEncoder();
    const h = await crypto.subtle.digest(
      "SHA-256",
      enc.encode(`${pepper}:pin:${phoneE164}:${newPin}`),
    );
    const pinHash = Array.from(new Uint8Array(h))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await admin
      .from("profiles")
      .update({ pin_hash: pinHash, phone_e164: phoneE164, auth_method: "phone_pin" })
      .eq("user_id", profile.user_id);

    await admin
      .from("pin_recovery_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", codeRow.id);

    // Issue a fresh session
    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInData, error } = await anon.auth.signInWithPassword({
      email: synthEmail,
      password: newPassword,
    });
    if (error || !signInData.session) {
      return new Response(JSON.stringify({ error: error?.message || "Reset failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
