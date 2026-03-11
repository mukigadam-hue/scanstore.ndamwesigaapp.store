import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // Use gzip compression via CompressionStream
    const blob = new Blob([uint8]);
    const cs = new CompressionStream('gzip');
    const compressedStream = blob.stream().pipeThrough(cs);
    const compressedBlob = await new Response(compressedStream).arrayBuffer();
    
    const originalSize = uint8.length;
    const compressedSize = compressedBlob.byteLength;
    const savingsPercent = Math.round((1 - compressedSize / originalSize) * 100);

    // Only return compressed if it's actually smaller
    if (compressedSize < originalSize) {
      return new Response(compressedBlob, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/octet-stream',
          'X-Original-Size': originalSize.toString(),
          'X-Compressed-Size': compressedSize.toString(),
          'X-Savings-Percent': savingsPercent.toString(),
        },
      });
    } else {
      // Return original if compression doesn't help
      return new Response(arrayBuffer, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/octet-stream',
          'X-Original-Size': originalSize.toString(),
          'X-Compressed-Size': originalSize.toString(),
          'X-Savings-Percent': '0',
        },
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
