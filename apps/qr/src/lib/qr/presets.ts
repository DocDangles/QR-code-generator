import { DEFAULT_STYLE, type QrStyle } from "./style";

/** Starting "versions" shown in the design studio. */
export const PRESETS: { name: string; style: Partial<QrStyle> }[] = [
  { name: "Classic", style: {} },
  { name: "Dots", style: { pattern: "dots", eyeFrame: "circle", eyeBall: "circle" } },
  { name: "Rounded", style: { pattern: "rounded", eyeFrame: "rounded", eyeBall: "rounded" } },
  { name: "Classy", style: { pattern: "classy", eyeFrame: "rounded", eyeBall: "rounded" } },
  { name: "Diamond", style: { pattern: "diamond", eyeFrame: "square", eyeBall: "diamond" } },
  { name: "Bold gradient", style: { pattern: "rounded", eyeFrame: "rounded", eyeBall: "circle", fg: "#1b1b1b", fg2: "#7a1f2b", eyeFrameColor: "#7a1f2b", eyeBallColor: "#1b1b1b" } },
  { name: "Scan me box", style: { pattern: "dots", eyeFrame: "rounded", eyeBall: "circle", frame: "banner-bottom", frameText: "SCAN ME" } },
  { name: "Soft frame", style: { pattern: "rounded", eyeFrame: "circle", eyeBall: "circle", frame: "rounded", frameColor: "#222222" } },
];
export const withDefaults = (p: Partial<QrStyle>): QrStyle => ({ ...DEFAULT_STYLE, ...p });
