export const PATTERNS = ["square", "dots", "rounded", "diamond", "classy"] as const;
export const EYE_FRAMES = ["square", "rounded", "circle"] as const;
export const EYE_BALLS = ["square", "rounded", "circle", "diamond"] as const;
export const FRAMES = ["none", "box", "rounded", "banner-bottom", "banner-top"] as const;
export const EC_LEVELS = ["L", "M", "Q", "H"] as const;

export type QrStyle = {
  pattern: (typeof PATTERNS)[number];
  eyeFrame: (typeof EYE_FRAMES)[number];
  eyeBall: (typeof EYE_BALLS)[number];
  fg: string;
  fg2: string | null; // optional gradient end color
  bg: string;
  eyeFrameColor: string | null; // null = same as fg
  eyeBallColor: string | null;
  frame: (typeof FRAMES)[number];
  frameText: string;
  frameColor: string;
  frameTextColor: string;
  logo: { dataUrl: string; size: number } | null; // size = fraction of code width (0.1-0.22)
  ec: (typeof EC_LEVELS)[number];
  margin: number; // quiet zone, modules
};

export const DEFAULT_STYLE: QrStyle = {
  pattern: "square", eyeFrame: "square", eyeBall: "square",
  fg: "#000000", fg2: null, bg: "#ffffff", eyeFrameColor: null, eyeBallColor: null,
  frame: "none", frameText: "SCAN ME", frameColor: "#000000", frameTextColor: "#ffffff",
  logo: null, ec: "M", margin: 4,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const LOGO = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const pick = <T extends readonly string[]>(list: T, v: unknown, d: T[number]): T[number] =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : d;
const color = (v: unknown, d: string | null): string | null => (typeof v === "string" && HEX.test(v) ? v : d);

/** Validate untrusted style JSON (from the browser or the database) into a safe QrStyle. */
export function normalizeStyle(input: unknown): QrStyle {
  const s = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const D = DEFAULT_STYLE;
  let logo: QrStyle["logo"] = null;
  if (s.logo && typeof s.logo.dataUrl === "string" && LOGO.test(s.logo.dataUrl) && s.logo.dataUrl.length < 1_500_000) {
    const size = Number(s.logo.size);
    logo = { dataUrl: s.logo.dataUrl, size: Math.min(0.22, Math.max(0.1, Number.isFinite(size) ? size : 0.18)) };
  }
  const margin = Number(s.margin);
  const eyeFrame = pick(EYE_FRAMES, s.eyeFrame, D.eyeFrame);
  let eyeBall = pick(EYE_BALLS, s.eyeBall, D.eyeBall);
  // Scanners also check finder patterns along the diagonal. A square ball inside a circle
  // frame breaks that check (found by decode tests), so it is swapped for a rounded one.
  if (eyeFrame === "circle" && eyeBall === "square") eyeBall = "rounded";
  return {
    pattern: pick(PATTERNS, s.pattern, D.pattern),
    eyeFrame,
    eyeBall,
    fg: color(s.fg, D.fg)!, fg2: color(s.fg2, null), bg: color(s.bg, D.bg)!,
    eyeFrameColor: color(s.eyeFrameColor, null), eyeBallColor: color(s.eyeBallColor, null),
    frame: pick(FRAMES, s.frame, D.frame),
    frameText: String(s.frameText ?? D.frameText).replace(/[^\p{L}\p{N} !?.,'&-]/gu, "").slice(0, 24),
    frameColor: color(s.frameColor, D.frameColor)!, frameTextColor: color(s.frameTextColor, D.frameTextColor)!,
    logo,
    ec: logo ? "H" : pick(EC_LEVELS, s.ec, D.ec), // a logo always forces the highest error correction
    margin: Number.isFinite(margin) ? Math.min(8, Math.max(2, Math.round(margin))) : D.margin,
  };
}
