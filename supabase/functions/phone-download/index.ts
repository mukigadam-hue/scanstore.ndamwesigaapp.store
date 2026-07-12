import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_FILE_BYTES = 30 * 1024 * 1024;
const TEMP_PREFIX = "phone-downloads";
const TEMP_TTL_SECONDS = 10 * 60;
const CLEANUP_AFTER_MS = 24 * 60 * 60 * 1000;

const safeFileName = (name: string) =>
  (name || "download").replace(/[\\/:*?"<>|]+/g, "_").trim() || "download";

const extensionFromType = (type: string) => {
  if (type === "application/pdf") return "pdf";
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "text/plain") return "txt";
  return "bin";
};

const withExtension = (name: string, type: string) => {
  const safe = safeFileName(name);
  if (/\.[a-z0-9]{2,8}$/i.test(safe)) return safe;
  return `${safe}.${extensionFromType(type)}`;
};

async function cleanupOldTempFiles(admin: ReturnType<typeof createClient>) {
  try {
    const { data } = await admin.storage.from("documents").list(TEMP_PREFIX, { limit: 100 });
    if (!data?.length) return;
    const cutoff = Date.now() - CLEANUP_AFTER_MS;
    const oldPaths = data
      .map((item) => item.name)
      .filter((name) => {
        const stamp = Number(name.split("-")[0]);
        return Number.isFinite(stamp) && stamp < cutoff;
      })
      .map((name) => `${TEMP_PREFIX}/${name}`);
    if (oldPaths.length) await admin.storage.from("documents").remove(oldPaths);
  } catch {
    // Cleanup must never block a user download.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const requestedName = String(form.get("fileName") || "download");

    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (file.size > MAX_FILE_BYTES) {
      return new Response(JSON.stringify({ error: "File is too large for direct phone save" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) throw new Error("Storage is not configured");

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await cleanupOldTempFiles(admin);

    const contentType = file.type || "application/octet-stream";
    const fileName = withExtension(requestedName || file.name, contentType);
    const arrayBuffer = await file.arrayBuffer();
    const objectPath = `${TEMP_PREFIX}/${Date.now()}-${crypto.randomUUID()}-${fileName}`;

    const { error: uploadError } = await admin.storage.from("documents").upload(objectPath, arrayBuffer, {
      contentType,
      cacheControl: "600",
      upsert: false,
    });

    if (uploadError) throw uploadError;

    const { data, error: signedError } = await admin.storage
      .from("documents")
      .createSignedUrl(objectPath, TEMP_TTL_SECONDS, { download: fileName } as never);

    if (signedError || !data?.signedUrl) throw signedError || new Error("Could not create download link");

    return new Response(JSON.stringify({ signedUrl: data.signedUrl, fileName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "Download preparation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});