const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const HEX = /^#[0-9a-fA-F]{6}$/;

/** The branded "enter the password" page shown before a protected code redirects. */
export function unlockPageHtml(o: {
  clientName: string; logoUrl: string | null; brandColors: string[] | null; slug: string; message?: string;
}): string {
  const color = o.brandColors?.find((c) => HEX.test(c)) ?? "#7a1f2b";
  const logo = o.logoUrl && /^https:\/\//.test(o.logoUrl) ? `<img src="${esc(o.logoUrl)}" alt="" style="max-height:56px;max-width:200px;margin-bottom:12px">` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(o.clientName)}: password required</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f6f6f7;color:#1c1c1e}
main{width:min(92vw,380px);background:#fff;border-radius:14px;padding:28px;box-shadow:0 2px 14px rgba(0,0,0,.08);text-align:center}
h1{font-size:1.2rem;margin:0 0 6px}p{margin:6px 0 16px;color:#555}input{width:100%;padding:12px;font-size:1rem;border:1px solid #ccc;border-radius:8px;box-sizing:border-box}
button{width:100%;margin-top:12px;padding:12px;font-size:1rem;border:0;border-radius:8px;background:${color};color:#fff;cursor:pointer}
.err{color:#b00020;margin:12px 0 0}@media(prefers-color-scheme:dark){body{background:#161618;color:#f2f2f3}main{background:#222226}p{color:#aaa}input{background:#161618;color:#f2f2f3;border-color:#444}}</style></head>
<body><main>${logo}<h1>${esc(o.clientName)}</h1><p>This link is password protected.</p>
<form method="post" action="/${esc(o.slug)}/unlock"><input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus required maxlength="200" aria-label="Password">
<button type="submit">Continue</button>${o.message ? `<p class="err" role="alert">${esc(o.message)}</p>` : ""}</form></main></body></html>`;
}
