import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { readBarcodes } from "zxing-wasm/reader";
import { renderQrSvg } from "./render.ts";
import { PRESETS } from "./presets.ts";
import { PATTERNS, EYE_FRAMES, EYE_BALLS, FRAMES } from "./style.ts";

const DATA = "https://go.blackequitycoalition.org/k7m2x";

async function decode(svg: string): Promise<string | null> {
  // Rendered at a modest size, like a phone camera frame, not a perfect vector.
  const png = await sharp(Buffer.from(svg)).resize(500).flatten({ background: "#fff" }).png().toBuffer();
  const [hit] = await readBarcodes(new Blob([png], { type: "image/png" }), { formats: ["QRCode"], tryHarder: true });
  return hit?.text ?? null;
}

for (const p of PATTERNS) for (const ef of EYE_FRAMES) for (const eb of EYE_BALLS) {
  test(`scans: pattern=${p} eyeFrame=${ef} eyeBall=${eb}`, async () => {
    assert.equal(await decode(renderQrSvg(DATA, { pattern: p, eyeFrame: ef, eyeBall: eb })), DATA);
  });
}
for (const f of FRAMES) test(`scans: frame=${f}`, async () => {
  assert.equal(await decode(renderQrSvg(DATA, { frame: f })), DATA);
});
for (const pr of PRESETS) test(`scans: preset ${pr.name}`, async () => {
  assert.equal(await decode(renderQrSvg(DATA, pr.style)), DATA);
});

// 1x1 red PNG stands in for a logo
const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
test("scans with a logo (forces EC level H)", async () => {
  const svg = renderQrSvg(DATA, { logo: { dataUrl: LOGO, size: 0.2 }, ec: "L", pattern: "dots" });
  assert.ok(svg.includes("<image"));
  assert.equal(await decode(svg), DATA);
});
test("scans with gradient + custom colors", async () => {
  assert.equal(await decode(renderQrSvg(DATA, { fg: "#111111", fg2: "#7a1f2b", bg: "#fffdf5" })), DATA);
});
test("rejects hostile style input", () => {
  const svg = renderQrSvg(DATA, { fg: "red\"/><script>", frame: "banner-bottom", frameText: "<script>x</script>", logo: { dataUrl: "javascript:alert(1)", size: 1 } });
  assert.ok(!svg.includes("<script"));
  assert.ok(!svg.includes("javascript:"));
});
