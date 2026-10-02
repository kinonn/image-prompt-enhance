/** Natural pixel size of an image blob, without touching a canvas. */
export async function readImageSize(file: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  bitmap.close();
  return { width, height };
}

export async function resizeImage(
  file: File,
  maxDim = 1024,
  quality = 0.8
): Promise<{ base64: string; mime: string; sourceWidth: number; sourceHeight: number }> {
  const bitmap = await createImageBitmap(file);
  // Reported to the user as-is, before the downscale below.
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
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
  return { base64, mime, sourceWidth, sourceHeight };
}

/**
 * Aspect ratios common in photography, film and display. Ordered so that ties
 * prefer the more widely used entry.
 */
const COMMON_RATIOS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [5, 4],
  [4, 3],
  [7, 5],
  [3, 2],
  [16, 10],
  [16, 9],
  [2, 1],
  [19, 9],
  [21, 9],
  [65, 24],
];

/**
 * Above this relative error the size is not close enough to any known ratio.
 * Kept below ~3.2% so midpoints between two entries stay unrounded (e.g. 1.55
 * between 16:10 and 3:2 is reported as a decimal, not mislabelled).
 */
const RATIO_TOLERANCE = 0.03;

/** How far a raw ratio may be simplified before it is shown as a decimal. */
const MAX_SIMPLE_NUMERATOR = 100;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

const formatRatioNumber = (n: number): string => String(Math.round(n * 100) / 100);

/** Thousands-separated without relying on the host locale (SSR/CSR parity). */
const groupDigits = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Closest familiar aspect ratio for a pixel size, preserving orientation.
 * 4032×3024 → "4:3", 1920×1080 → "16:9", 1000×667 → "3:2".
 *
 * Well-known ratios win over an exact reduction, because a photo's real pixel
 * count is rarely a clean multiple (a 4080×3120 Pixel photo is 17:13 exactly,
 * but everyone calls it 4:3). An exact fraction is only used when nothing in
 * the table is close, and a decimal when even that would be unreadable.
 */
export function closestAspectRatio(width: number, height: number): string {
  if (!(width > 0) || !(height > 0)) return "";

  const portrait = height > width;
  // Work in landscape orientation so the table can stay landscape-only.
  const w = portrait ? height : width;
  const h = portrait ? width : height;
  const target = w / h;
  const format = (a: number, b: number) =>
    portrait && a !== b ? `${formatRatioNumber(b)}:${formatRatioNumber(a)}` : `${formatRatioNumber(a)}:${formatRatioNumber(b)}`;

  // Nearest well-known ratio, provided we are close enough to call it a match.
  let bestA = 0;
  let bestB = 1;
  let bestErr = Infinity;
  for (const [ra, rb] of COMMON_RATIOS) {
    const err = Math.abs(ra / rb - target) / target;
    if (err < bestErr) {
      bestErr = err;
      bestA = ra;
      bestB = rb;
    }
  }
  if (bestErr <= RATIO_TOLERANCE) return format(bestA, bestB);

  // No familiar ratio — fall back to the exact reduction, if it reads cleanly.
  const g = gcd(w, h);
  if (g > 1 && w / g <= MAX_SIMPLE_NUMERATOR && h / g <= MAX_SIMPLE_NUMERATOR) {
    return format(w / g, h / g);
  }

  return format(Math.round(target * 100) / 100, 1);
}

/**
 * "4032 × 3024 px · 4:3" for the UI. Returns null when the size is unknown.
 */
export function formatImageSize(width?: number | null, height?: number | null): string | null {
  if (!width || !height) return null;
  const ratio = closestAspectRatio(width, height);
  const px = `${groupDigits(width)} × ${groupDigits(height)} px`;
  return ratio ? `${px} · ${ratio}` : px;
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
