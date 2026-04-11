import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { image } = await req.json();
    if (!image) throw new Error("No image provided");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Clean this scanned document image professionally. Remove all dirt, stains, creases, shadows, and background noise. Make the paper background pure clean white. Keep all text, logos, stamps, lines, and printed content perfectly sharp, clear and black. Preserve the exact layout, formatting, and structure. The result should look like a fresh, professionally printed document - as if it came straight from a printer. Do not add any text or watermarks. Output only the cleaned image."
              },
              {
                type: "image_url",
                image_url: { url: image }
              }
            ]
          }
        ],
        modalities: ["image", "text"]
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI processing failed");
    }

    const data = await response.json();
    
    // Log the response structure for debugging
    console.log("AI response keys:", JSON.stringify(Object.keys(data)));
    if (data.choices?.[0]) {
      const msg = data.choices[0].message;
      console.log("Message keys:", JSON.stringify(Object.keys(msg || {})));
      if (msg?.content) {
        const contentType = typeof msg.content;
        if (contentType === "string") {
          console.log("Content is string, length:", msg.content.length);
        } else {
          console.log("Content type:", contentType);
          if (Array.isArray(msg.content)) {
            console.log("Content array types:", JSON.stringify(msg.content.map((c: any) => c.type)));
          }
        }
      }
    }

    // Try multiple possible response formats
    let cleanedImage: string | undefined;

    // Format 1: images array on message
    cleanedImage = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    // Format 2: content array with image_url parts
    if (!cleanedImage && Array.isArray(data.choices?.[0]?.message?.content)) {
      const parts = data.choices[0].message.content;
      for (const part of parts) {
        if (part.type === "image_url" && part.image_url?.url) {
          cleanedImage = part.image_url.url;
          break;
        }
        if (part.type === "image" && part.image_url?.url) {
          cleanedImage = part.image_url.url;
          break;
        }
      }
    }

    // Format 3: inline_data in content parts
    if (!cleanedImage && Array.isArray(data.choices?.[0]?.message?.content)) {
      const parts = data.choices[0].message.content;
      for (const part of parts) {
        if (part.inline_data?.data) {
          cleanedImage = `data:${part.inline_data.mime_type || 'image/png'};base64,${part.inline_data.data}`;
          break;
        }
      }
    }

    // Format 4: content is a base64 string itself
    if (!cleanedImage) {
      const content = data.choices?.[0]?.message?.content;
      if (typeof content === "string" && (content.startsWith("data:image") || content.length > 1000)) {
        if (content.startsWith("data:image")) {
          cleanedImage = content;
        } else {
          // Might be raw base64
          cleanedImage = `data:image/png;base64,${content}`;
        }
      }
    }

    if (!cleanedImage) {
      // Return original image as fallback instead of erroring
      console.error("No cleaned image found in AI response. Returning original.");
      return new Response(JSON.stringify({ cleanedImage: image, fallback: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ cleanedImage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("clean-scan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
