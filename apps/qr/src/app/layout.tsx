export const metadata = { title: "E Suite · QR" };
const css = `
:root{--ink:#1c1c1e;--mute:#6b6b70;--line:#e3e3e6;--accent:#7a1f2b;--bg:#fafafa}
@media (prefers-color-scheme:dark){:root{--ink:#f2f2f3;--mute:#a0a0a6;--line:#38383c;--bg:#161618}}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;color:var(--ink);background:var(--bg);line-height:1.45}
a{color:var(--accent)}h1{font-size:1.5rem;margin:0 0 .5rem}h2{font-size:1.05rem;margin:1.2rem 0 .5rem}
.wrap{max-width:1100px;margin:0 auto;padding:20px 16px}
.bar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line)}
.btn{display:inline-block;padding:8px 14px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer;font:inherit;text-decoration:none}
.btn.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
.btn:disabled{opacity:.5;cursor:default}
input,select,textarea{font:inherit;color:inherit;background:transparent;border:1px solid var(--line);border-radius:8px;padding:7px 9px;width:100%}
input[type=color]{padding:2px;height:34px;width:56px}input[type=range]{padding:0}
label{display:block;font-size:.85rem;color:var(--mute);margin-bottom:10px}
label>input,label>select{margin-top:4px;color:var(--ink)}
.grid{display:grid;gap:20px;grid-template-columns:1fr}@media(min-width:860px){.grid{grid-template-columns:1fr 340px}}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.chip{padding:5px 10px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer;font:inherit;font-size:.85rem}
.chip[aria-pressed=true]{background:var(--accent);color:#fff;border-color:var(--accent)}
.card{border:1px solid var(--line);border-radius:12px;padding:14px;background:color-mix(in srgb,var(--bg) 70%,transparent)}
.preview{position:sticky;top:12px}.preview svg{width:100%;height:auto;display:block;background:#fff;border-radius:8px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line);vertical-align:middle}
.mute{color:var(--mute);font-size:.85rem}.err{color:#c0392b}.ok{color:#1e8449}
.presets{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px}
.preset{border:1px solid var(--line);border-radius:8px;padding:4px;background:transparent;color:var(--ink);cursor:pointer;font-size:.75rem}
.preset svg{width:100%;height:auto;display:block;background:#fff;border-radius:4px}
`;
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><head><style dangerouslySetInnerHTML={{ __html: css }} /></head><body>{children}</body></html>);
}
