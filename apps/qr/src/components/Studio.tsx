"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { renderQrSvg } from "@/lib/qr/render";
import { buildDestination } from "@/lib/redirect";
import { PRESETS, withDefaults } from "@/lib/qr/presets";
import { DEFAULT_STYLE, normalizeStyle, PATTERNS, EYE_FRAMES, EYE_BALLS, FRAMES, EC_LEVELS, type QrStyle } from "@/lib/qr/style";

type Template = { id: string; name: string; style: Partial<QrStyle> };
type Existing = {
  id: string; mode: "static" | "dynamic"; slug: string | null; campaignName: string; destinationUrl: string;
  utmSource: string; utmMedium: string; utmCampaign: string; utmContent: string; utmTerm: string;
  status: "active" | "paused"; expiresAt: string; expireRedirectUrl: string; style: Partial<QrStyle>;
  hasPassword: boolean; notifyRules: { firstScan?: boolean; everyN?: number | null; digest?: string };
};

const label = (s: string) => s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

function Choice<T extends string>({ value, options, onChange, name }: { value: T; options: readonly T[]; onChange: (v: T) => void; name: string }) {
  return (
    <div className="row" role="group" aria-label={name}>
      {options.map((o) => (<button type="button" key={o} className="chip" aria-pressed={value === o} onClick={() => onChange(o)}>{label(o)}</button>))}
    </div>
  );
}

/** Downscale an uploaded logo to <=256px PNG so exports stay small. SVGs pass through if small. */
async function fileToLogo(file: File): Promise<string> {
  if (file.size > 600_000) throw new Error("Logo is too large (600 KB max)");
  const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
  if (file.type === "image/svg+xml") { if (file.size > 150_000) throw new Error("SVG logo is too large (150 KB max)"); return url; }
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Use a PNG, JPG, WebP or SVG logo");
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, 256 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

export function Studio({ existing, templates: initialTemplates, redirectBase, readOnly, notifyEmail }: { existing?: Existing; templates: Template[]; redirectBase: string; readOnly?: boolean; notifyEmail?: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"static" | "dynamic">(existing?.mode ?? "dynamic");
  const [f, setF] = useState({
    campaignName: existing?.campaignName ?? "", destinationUrl: existing?.destinationUrl ?? "",
    utmSource: existing?.utmSource ?? "qr", utmMedium: existing?.utmMedium ?? "", utmCampaign: existing?.utmCampaign ?? "",
    utmContent: existing?.utmContent ?? "", utmTerm: existing?.utmTerm ?? "", status: existing?.status ?? "active",
    expiresAt: existing?.expiresAt ?? "", expireRedirectUrl: existing?.expireRedirectUrl ?? "",
  });
  const [password, setPassword] = useState("");
  const [removePw, setRemovePw] = useState(false);
  const [rules, setRules] = useState({
    firstScan: existing?.notifyRules?.firstScan === true,
    everyN: existing?.notifyRules?.everyN ? String(existing.notifyRules.everyN) : "",
    digest: (["daily", "weekly"].includes(existing?.notifyRules?.digest ?? "") ? existing!.notifyRules.digest : "off") as string,
  });
  const [style, setStyle] = useState<QrStyle>(() => normalizeStyle(existing?.style ?? DEFAULT_STYLE));
  const [templates, setTemplates] = useState(initialTemplates);
  const [tplName, setTplName] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const locked = !!existing && existing.mode === "static"; // static destinations can't change
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const patch = (p: Partial<QrStyle>) => { setStyle(normalizeStyle({ ...style, ...p })); setCheck(""); };

  const target = useMemo(() => {
    if (mode === "dynamic") return `${redirectBase}/${existing?.slug ?? "abc234"}`;
    try { return buildDestination(f.destinationUrl, { source: f.utmSource, medium: f.utmMedium, campaign: f.utmCampaign, content: f.utmContent, term: f.utmTerm }); }
    catch { return "https://example.org"; }
  }, [mode, existing?.slug, redirectBase, f]);
  const svg = useMemo(() => renderQrSvg(target, style), [target, style]);

  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch(existing ? `/api/codes/${existing.id}` : "/api/codes", {
      method: existing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...f, mode, style, expiresAt: f.expiresAt || null,
        notifyRules: { firstScan: rules.firstScan, everyN: rules.everyN ? Number(rules.everyN) : null, digest: rules.digest },
        ...(password ? { password } : {}), ...(removePw && !password ? { removePassword: true } : {}),
      }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "err", text: j.error ?? "Could not save" });
    if (existing) { setPassword(""); setRemovePw(false); setMsg({ kind: "ok", text: "Saved. The printed image and short link did not change." }); router.refresh(); }
    else router.push(`/codes/${j.id}`);
  }

  async function saveTemplate() {
    const res = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: tplName, style }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg({ kind: "err", text: j.error ?? "Could not save template" });
    setTemplates([j, ...templates]); setTplName(""); setMsg({ kind: "ok", text: `Template "${j.name}" saved.` });
  }
  async function deleteTemplate(id: string) {
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    setTemplates(templates.filter((t) => t.id !== id));
  }
  async function verify() {
    setCheck("Checking…");
    const res = await fetch("/api/qr/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: target, style }) });
    const j = await res.json().catch(() => ({}));
    setCheck(j.ok ? "✓ Scans correctly" : "✗ This design did not scan. Try higher contrast, a bigger quiet zone, or a simpler pattern.");
  }

  const off = readOnly;
  return (
    <div className="grid">
      <div>
        {!existing && (
          <div className="card">
            <strong>Type</strong>
            <div className="row" style={{ margin: "8px 0" }}>
              <button type="button" className="chip" aria-pressed={mode === "dynamic"} onClick={() => setMode("dynamic")}>Dynamic</button>
              <button type="button" className="chip" aria-pressed={mode === "static"} onClick={() => setMode("static")}>Static</button>
            </div>
            <p className="mute" style={{ margin: 0 }}>
              {mode === "dynamic" ? "The image holds a short link. You can change the destination later without reprinting, and scans are tracked."
                : "The image holds the destination itself. It never depends on this app, but it can't be edited and scans aren't tracked."}
            </p>
          </div>
        )}
        {existing && <p className="mute">{existing.mode === "dynamic" ? <>Dynamic · short link <code>{redirectBase}/{existing.slug}</code></> : "Static · destination is built into the image and can't be edited"}</p>}

        <h2>Details</h2>
        <label>Campaign name<input value={f.campaignName} onChange={set("campaignName")} disabled={off} maxLength={120} /></label>
        <label>Destination URL<input value={f.destinationUrl} onChange={set("destinationUrl")} disabled={off || locked} placeholder="https://blackequitycoalition.org/resources" /></label>
        <div className="row" style={{ alignItems: "flex-start" }}>
          {([["utmSource", "utm_source"], ["utmMedium", "utm_medium"], ["utmCampaign", "utm_campaign"], ["utmContent", "utm_content"], ["utmTerm", "utm_term"]] as const).map(([k, l]) => (
            <label key={k} style={{ flex: "1 1 140px" }}>{l}<input value={f[k]} onChange={set(k)} disabled={off || locked} maxLength={100} /></label>
          ))}
        </div>
        <p className="mute" style={{ marginTop: 0 }}>{mode === "dynamic" ? "UTMs are added at scan time, never baked into the image." : "For a static code the UTMs are added to the destination once, before it is encoded."}</p>
        {mode === "dynamic" && (
          <>
            <h2>Link settings</h2>
            <p className="mute" style={{ marginTop: 0 }}>None of these change the printed image. Each is off until you turn it on.</p>
            <div className="card">
              <strong>Expiration</strong>
              <div className="row" style={{ alignItems: "flex-start", marginTop: 8 }}>
                {existing && <label style={{ flex: "1 1 140px" }}>Status<select value={f.status} onChange={set("status")} disabled={off}><option value="active">Active</option><option value="paused">Paused</option></select></label>}
                <label style={{ flex: "1 1 160px" }}>Expires at the end of<input type="date" value={f.expiresAt} onChange={set("expiresAt")} disabled={off} /></label>
                <label style={{ flex: "2 1 240px" }}>After expiry or pause, send to<input value={f.expireRedirectUrl} onChange={set("expireRedirectUrl")} disabled={off} placeholder="Blank = the client's fallback page" /></label>
              </div>
              <p className="mute" style={{ margin: 0 }}>Scans of an expired code are still recorded but marked expired. Clear the date to remove the expiry.</p>
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <strong>Password</strong> {existing?.hasPassword && !removePw && <span className="ok">· on</span>}
              <div className="row" style={{ marginTop: 8 }}>
                <input type="password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setRemovePw(false); }} disabled={off} maxLength={200}
                  placeholder={existing?.hasPassword ? "Type a new password to change it" : "Set a password (8+ characters)"} style={{ flex: "1 1 240px", width: "auto" }} aria-label="Password" />
                {existing?.hasPassword && <button type="button" className="chip" aria-pressed={removePw} disabled={off} onClick={() => { setRemovePw(!removePw); setPassword(""); }}>{removePw ? "Will be removed on save" : "Remove password"}</button>}
              </div>
              <p className="mute" style={{ margin: "8px 0 0" }}>Scanners see a branded page asking for it before being sent on. Five wrong tries lock that visitor out for 15 minutes. A scan is counted only after the right password.</p>
            </div>
            <div className="card" style={{ marginTop: 12 }}>
              <strong>Email notifications</strong>
              <p className="mute" style={{ margin: "4px 0 8px" }}>{notifyEmail ? <>Sent to <strong>{notifyEmail}</strong>.</> : <span className="err">No notification email is set for this client, so nothing will be sent.</span>}</p>
              <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 10px" }}>
                <input type="checkbox" style={{ width: "auto" }} checked={rules.firstScan} disabled={off} onChange={(e) => setRules({ ...rules, firstScan: e.target.checked })} /> Email me on the first scan
              </label>
              <div className="row" style={{ alignItems: "flex-end" }}>
                <label style={{ flex: "1 1 180px" }}>Email me every N scans<input type="number" min={2} max={100000} inputMode="numeric" placeholder="Off" value={rules.everyN} disabled={off} onChange={(e) => setRules({ ...rules, everyN: e.target.value })} /></label>
                <label style={{ flex: "1 1 180px" }}>Summary email<select value={rules.digest} disabled={off} onChange={(e) => setRules({ ...rules, digest: e.target.value })}><option value="off">Off</option><option value="daily">Daily (yesterday's scans)</option><option value="weekly">Weekly (Mondays)</option></select></label>
              </div>
              <p className="mute" style={{ margin: 0 }}>Summaries are skipped on days or weeks with no scans. Bots never count.</p>
            </div>
          </>
        )}

        <h2>Design</h2>
        <div className="presets">
          {PRESETS.map((p) => (
            <button type="button" key={p.name} className="preset" disabled={off} onClick={() => patch({ ...withDefaults(p.style), logo: style.logo })} title={p.name}>
              <div dangerouslySetInnerHTML={{ __html: renderQrSvg("https://example.org/preview", withDefaults(p.style)) }} />{p.name}
            </button>
          ))}
        </div>
        <h2>Pattern</h2><Choice name="Pattern" value={style.pattern} options={PATTERNS} onChange={(v) => patch({ pattern: v })} />
        <h2>Eye frame</h2><Choice name="Eye frame" value={style.eyeFrame} options={EYE_FRAMES} onChange={(v) => patch({ eyeFrame: v })} />
        <h2>Eye ball</h2><Choice name="Eye ball" value={style.eyeBall} options={EYE_BALLS} onChange={(v) => patch({ eyeBall: v })} />
        <h2>Colors</h2>
        <div className="row">
          <label>Code<br /><input type="color" value={style.fg} onChange={(e) => patch({ fg: e.target.value })} /></label>
          <label>Background<br /><input type="color" value={style.bg} onChange={(e) => patch({ bg: e.target.value })} /></label>
          <label>Eye frame<br /><input type="color" value={style.eyeFrameColor ?? style.fg} onChange={(e) => patch({ eyeFrameColor: e.target.value })} /></label>
          <label>Eye ball<br /><input type="color" value={style.eyeBallColor ?? style.eyeFrameColor ?? style.fg} onChange={(e) => patch({ eyeBallColor: e.target.value })} /></label>
          <label>Gradient end<br /><input type="color" value={style.fg2 ?? style.fg} onChange={(e) => patch({ fg2: e.target.value })} /></label>
          {(style.fg2 || style.eyeFrameColor || style.eyeBallColor) && <button type="button" className="btn" onClick={() => patch({ fg2: null, eyeFrameColor: null, eyeBallColor: null })}>Reset extras</button>}
        </div>
        <h2>Frame</h2>
        <Choice name="Frame" value={style.frame} options={FRAMES} onChange={(v) => patch({ frame: v })} />
        {style.frame !== "none" && (
          <div className="row" style={{ marginTop: 8 }}>
            {(style.frame === "banner-bottom" || style.frame === "banner-top") && <label style={{ flex: "1 1 160px" }}>Frame text<input value={style.frameText} maxLength={24} onChange={(e) => patch({ frameText: e.target.value })} /></label>}
            <label>Frame color<br /><input type="color" value={style.frameColor} onChange={(e) => patch({ frameColor: e.target.value })} /></label>
            <label>Text color<br /><input type="color" value={style.frameTextColor} onChange={(e) => patch({ frameTextColor: e.target.value })} /></label>
          </div>
        )}
        <h2>Logo <span className="mute">(optional)</span></h2>
        <div className="row">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={off} style={{ width: "auto" }}
            onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { patch({ logo: { dataUrl: await fileToLogo(file), size: style.logo?.size ?? 0.18 } }); setMsg(null); } catch (err: any) { setMsg({ kind: "err", text: err.message }); } }} />
          {style.logo && <button type="button" className="btn" onClick={() => { patch({ logo: null }); if (fileRef.current) fileRef.current.value = ""; }}>Remove logo</button>}
        </div>
        {style.logo && (
          <label style={{ marginTop: 8 }}>Logo size ({Math.round(style.logo.size * 100)}%)
            <input type="range" min={0.1} max={0.22} step={0.01} value={style.logo.size} onChange={(e) => patch({ logo: { dataUrl: style.logo!.dataUrl, size: Number(e.target.value) } })} />
          </label>
        )}
        <p className="mute">Error correction: <strong>{style.ec}</strong>{style.logo ? " (set to highest automatically because there's a logo)" : ""}</p>
        {!style.logo && <Choice name="Error correction" value={style.ec} options={EC_LEVELS} onChange={(v) => patch({ ec: v })} />}

        <h2>Templates</h2>
        <div className="row">
          {templates.map((t) => (
            <span key={t.id} className="row" style={{ gap: 0 }}>
              <button type="button" className="chip" disabled={off} onClick={() => patch({ ...normalizeStyle(t.style) })}>{t.name}</button>
              {!off && <button type="button" className="chip" aria-label={`Delete template ${t.name}`} onClick={() => deleteTemplate(t.id)}>×</button>}
            </span>
          ))}
          {templates.length === 0 && <span className="mute">No saved templates yet.</span>}
        </div>
        {!off && (
          <div className="row" style={{ marginTop: 8 }}>
            <input style={{ flex: "1 1 200px", width: "auto" }} placeholder="Name this design" value={tplName} onChange={(e) => setTplName(e.target.value)} maxLength={60} />
            <button type="button" className="btn" disabled={!tplName.trim()} onClick={saveTemplate}>Save as template</button>
          </div>
        )}
      </div>

      <aside className="preview">
        <div className="card">
          <div dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="mute" style={{ wordBreak: "break-all" }}>Encodes: {target}{mode === "dynamic" && !existing && " (placeholder until saved)"}</p>
          <div className="row">
            <button type="button" className="btn" onClick={verify}>Check it scans</button>
            <span className={check.startsWith("✓") ? "ok" : check.startsWith("✗") ? "err" : "mute"}>{check}</span>
          </div>
          {existing && (
            <div className="row" style={{ marginTop: 8 }}>
              <a className="btn" href={`/api/codes/${existing.id}/image?format=svg`}>Download SVG (print)</a>
              <a className="btn" href={`/api/codes/${existing.id}/image?format=png`}>Download PNG</a>
            </div>
          )}
          {!off && <button type="button" className="btn primary" style={{ marginTop: 12, width: "100%" }} disabled={busy || !f.campaignName.trim() || !f.destinationUrl.trim()} onClick={save}>{busy ? "Saving…" : existing ? "Save changes" : "Create code"}</button>}
          {msg && <p className={msg.kind === "ok" ? "ok" : "err"}>{msg.text}</p>}
          {existing && <p className="mute">Downloads use the last <em>saved</em> design.</p>}
        </div>
      </aside>
    </div>
  );
}
