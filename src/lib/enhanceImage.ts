/**
 * Enhance an image blob by upscaling and sharpening using canvas.
 * Returns a higher-quality version of the image.
 */
export async function enhanceImageBlob(blob: Blob): Promise<Blob> {
  // Only enhance images
  if (!blob.type.startsWith("image/")) {
    return blob;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Upscale by 1.5x for better quality
      const scale = 1.5;
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(blob);
        return;
      }

      // Enable high-quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);

      // Apply sharpening via unsharp mask technique
      applySharpening(ctx, width, height);

      // Output as high-quality PNG for maximum fidelity
      canvas.toBlob(
        (enhanced) => {
          if (!enhanced) {
            resolve(blob);
            return;
          }
          resolve(enhanced);
        },
        "image/png",
        1.0
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };

    img.src = url;
  });
}

function applySharpening(ctx: CanvasRenderingContext2D, width: number, height: number) {
  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const copy = new Uint8ClampedArray(data);

    // Sharpen kernel: [0,-1,0,-1,5,-1,0,-1,0]
    const amount = 0.3; // subtle sharpening

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) {
          const sharp =
            5 * copy[idx + c] -
            copy[((y - 1) * width + x) * 4 + c] -
            copy[((y + 1) * width + x) * 4 + c] -
            copy[(y * width + x - 1) * 4 + c] -
            copy[(y * width + x + 1) * 4 + c];

          data[idx + c] = Math.round(
            copy[idx + c] * (1 - amount) + sharp * amount
          );
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  } catch {
    // If sharpening fails (e.g. CORS), just skip it
  }
}
