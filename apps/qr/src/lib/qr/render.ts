import QRCode from "qrcode";
import { normalizeStyle, type QrStyle } from "./style";

const U = 10; // px per module

type Corners = [number, number, number, number]; // tl, tr, br, bl

function rr(x: number, y: number, w: number, h: number, [tl, tr, br, bl]: Corners): string {
  return `M${x + tl} ${y}H${x + w - tr}${tr ? `A${tr} ${tr} 0 0 1 ${x + w} ${y + tr}` : ""}V${y + h - br}${br ? `A${br} ${br} 0 0 1 ${x + w - br} ${y + h}` : ""}H${x + bl}${bl ? `A${bl} ${bl} 0 0 1 ${x} ${y + h - bl}` : ""}V${y + tl}${tl ? `A${tl} ${tl} 0 0 1 ${x + tl} ${y}` : ""}Z`;
}
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const diamond = (x: number, y: number, s: number) => `M${x + s / 2} ${y}L${x + s} ${y + s / 2}L${x + s / 2} ${y + s}L${x} ${y + s / 2}Z`;

function modulePath(kind: QrStyle["pattern"], x: number, y: number): string {
  switch (kind) {
    case "dots": return circle(x + U / 2, y + U / 2, U * 0.46);
    case "rounded": return rr(x, y, U, U, [U * 0.3, U * 0.3, U * 0.3, U * 0.3]);
    case "diamond": return diamond(x, y, U);
    case "classy": return rr(x, y, U, U, [U * 0.5, 0, U * 0.5, 0]);
    default: return `M${x} ${y}h${U}v${U}h${-U}Z`;
  }
}

function eyeFramePath(kind: QrStyle["eyeFrame"], x: number, y: number): string {
  const o = 7 * U, i = 5 * U;
  const ix = x + U, iy = y + U;
  switch (kind) {
    case "rounded": return rr(x, y, o, o, [2 * U, 2 * U, 2 * U, 2 * U]) + rr(ix, iy, i, i, [U, U, U, U]);
    case "circle": return circle(x + o / 2, y + o / 2, o / 2) + circle(x + o / 2, y + o / 2, i / 2);
    default: return rr(x, y, o, o, [0, 0, 0, 0]) + rr(ix, iy, i, i, [0, 0, 0, 0]);
  }
}

function eyeBallPath(kind: QrStyle["eyeBall"], x: number, y: number): string {
  const bx = x + 2 * U, by = y + 2 * U, s = 3 * U;
  switch (kind) {
    case "rounded": return rr(bx, by, s, s, [U, U, U, U]);
    case "circle": return circle(bx + s / 2, by + s / 2, s / 2);
    case "diamond": return diamond(bx - U * 0.15, by - U * 0.15, s + U * 0.3);
    default: return rr(bx, by, s, s, [0, 0, 0, 0]);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Returns the SVG for `data` in the given (untrusted) style. */
export function renderQrSvg(data: string, styleInput?: unknown): string {
  const st = normalizeStyle(styleInput);
  const qr = QRCode.create(data, { errorCorrectionLevel: st.ec });
  const n = qr.modules.size;
  const total = (n + 2 * st.margin) * U;
  const off = st.margin * U;

  const inFinder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  // Logo clear zone: whole modules around the center, so no half-modules peek out.
  let clear: { r0: number; r1: number; c0: number; c1: number } | null = null;
  if (st.logo) {
    let span = Math.max(3, Math.round(n * st.logo.size));
    if ((n - span) % 2) span += 1; // keep it centered on the module grid
    const a = (n - span) / 2;
    clear = { r0: a, r1: a + span - 1, c0: a, c1: a + span - 1 };
  }

  let data_d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c) || inFinder(r, c)) continue;
      if (clear && r >= clear.r0 && r <= clear.r1 && c >= clear.c0 && c <= clear.c1) continue;
      data_d += modulePath(st.pattern, off + c * U, off + r * U);
    }
  }

  const eyes = [[0, 0], [0, n - 7], [n - 7, 0]].map(([r, c]) => [off + c * U, off + r * U]);
  const frameD = eyes.map(([x, y]) => eyeFramePath(st.eyeFrame, x, y)).join("");
  const ballD = eyes.map(([x, y]) => eyeBallPath(st.eyeBall, x, y)).join("");

  const dataFill = st.fg2 ? "url(#g)" : st.fg;
  const defs = st.fg2
    ? `<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${total}" y2="${total}"><stop offset="0" stop-color="${st.fg}"/><stop offset="1" stop-color="${st.fg2}"/></linearGradient></defs>`
    : "";

  let logoSvg = "";
  if (clear && st.logo) {
    const x = off + clear.c0 * U, y = off + clear.r0 * U, s = (clear.c1 - clear.c0 + 1) * U;
    const pad = U * 0.6;
    logoSvg = `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${U}" fill="${st.bg}"/>` +
      `<image href="${st.logo.dataUrl}" x="${x + pad}" y="${y + pad}" width="${s - 2 * pad}" height="${s - 2 * pad}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  const code =
    `<rect width="${total}" height="${total}" fill="${st.bg}"/>` +
    `<path d="${data_d}" fill="${dataFill}"/>` +
    `<path d="${frameD}" fill="${st.eyeFrameColor ?? dataFill}" fill-rule="evenodd"/>` +
    `<path d="${ballD}" fill="${st.eyeBallColor ?? st.eyeFrameColor ?? dataFill}"/>` + logoSvg;

  if (st.frame === "none") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}">${defs}${code}</svg>`;
  }

  const fp = 24; // frame thickness
  const banner = st.frame === "banner-bottom" || st.frame === "banner-top" ? 64 : 0;
  const W = total + 2 * fp, H = total + 2 * fp + banner;
  const rx = st.frame === "box" ? 0 : 28;
  const qy = fp + (st.frame === "banner-top" ? banner : 0);
  const ty = st.frame === "banner-top" ? fp + banner / 2 + 10 : total + fp + banner / 2 + fp + 10;
  const text = banner
    ? `<text x="${W / 2}" y="${ty}" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" text-anchor="middle" fill="${st.frameTextColor}">${esc(st.frameText)}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs}` +
    `<rect width="${W}" height="${H}" rx="${rx}" fill="${st.frameColor}"/>` +
    `<g transform="translate(${fp} ${qy})">${code}</g>${text}</svg>`;
}
