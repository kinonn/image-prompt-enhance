export async function resizeImage(
  file: File,
  maxDim = 1024,
  quality = 0.8
): Promise<{ base64: string; mime: string }> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;

  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Prefer jpeg for smaller payload unless original is png with transparency needs
  // Use jpeg for all to minimize tokens; quality 0.8 is good balance
  const mime = "image/jpeg";
  const dataUrl = canvas.toDataURL(mime, quality);
  const base64 = dataUrl.split(",")[1];
  return { base64, mime };
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/jpg"];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `Unsupported format: ${file.type}. Use PNG, JPEG, or WebP.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB > 10MB limit.`;
  }
  return null;
}
