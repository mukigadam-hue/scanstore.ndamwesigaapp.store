import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(input: string): string {
  // Keep digits and a leading +; strip everything else.
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { phone } = await req.json();
    if (!phone || typeof phone !== "string" || phone.trim().length < 6) {
      return new Response(
        JSON.stringify({ error: "Please enter a valid phone number." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const normalized = normalizePhone(phone);
    const digitsOnly = normalized.replace(/\D/g, "");

    // Match either the normalized form or the raw digits — users may have
    // signed up with or without country code formatting.
    const { data, error } = await supabase
      .from("profiles")
      .select("email, phone")
      .or(`phone.eq.${normalized},phone.eq.${digitsOnly},phone.eq.+${digitsOnly}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[recover-email-by-phone] db error", error);
      return new Response(
        JSON.stringify({ error: "Lookup failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!data?.email) {
      return new Response(
        JSON.stringify({ found: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        found: true,
        maskedEmail: maskEmail(data.email),
        // Full email is also returned so the reset link can be sent server-side
        // without re-prompting. The client never displays it.
        email: data.email,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[recover-email-by-phone] unexpected", e);
    return new Response(
      JSON.stringify({ error: "Unexpected error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
