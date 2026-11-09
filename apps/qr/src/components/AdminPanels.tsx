"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Client = { name: string; timezone: string; redirectDomain: string; fallbackUrl: string; notifyEmail: string; brandColors: string[]; logoUrl: string };
type User = { id: string; email: string; name: string | null; role: string };
type Msg = { kind: "ok" | "err"; text: string } | null;

const ROLE_LABEL: Record<string, string> = { admin: "Admin", client_editor: "Editor", client_viewer: "Viewer" };
async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, j };
}
const Note = ({ m }: { m: Msg }) => (m ? <p className={m.kind === "ok" ? "ok" : "err"} role="status">{m.text}</p> : null);

export function ClientSettings({ client }: { client: Client }) {
  const router = useRouter();
  const [f, setF] = useState(client);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Client) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const setColor = (i: number, v: string) => { const c = [...f.brandColors]; c[i] = v; setF({ ...f, brandColors: c }); };
  const domainChanged = f.redirectDomain.trim().toLowerCase() !== client.redirectDomain;

  async function save() {
    setBusy(true); setMsg(null);
    const { ok, j } = await call("/api/admin/client", "PATCH", { ...f, brandColors: f.brandColors.filter(Boolean) });
    setBusy(false);
    setMsg(ok ? { kind: "ok", text: "Saved." } : { kind: "err", text: j.error ?? "Could not save" });
    if (ok) router.refresh();
  }
  return (
    <div className="card">
      <label>Organization name<input value={f.name} onChange={set("name")} maxLength={120} /></label>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <label style={{ flex: "1 1 220px" }}>Redirect domain (printed on codes)<input value={f.redirectDomain} onChange={set("redirectDomain")} placeholder="go.example.org" /></label>
        <label style={{ flex: "1 1 160px" }}>Time zone<input value={f.timezone} onChange={set("timezone")} placeholder="America/New_York" /></label>
      </div>
      {domainChanged && <p className="err" style={{ marginTop: 0 }}>Changing the domain affects new downloads only. Codes already printed keep the old domain, so leave it pointed at this app for as long as those codes are in use.</p>}
      <label>Fallback page (where unknown or expired links go)<input value={f.fallbackUrl} onChange={set("fallbackUrl")} placeholder="https://example.org" /></label>
      <label>Notification email<input type="email" value={f.notifyEmail} onChange={set("notifyEmail")} placeholder="info@example.org" /></label>
      <label>Logo URL (shown on password pages, https only)<input value={f.logoUrl} onChange={set("logoUrl")} placeholder="https://example.org/logo.png" /></label>
      <div className="row">
        {[0, 1, 2].map((i) => (
          <label key={i} style={{ margin: 0 }}>{i === 0 ? "Brand color (main)" : `Color ${i + 1}`}<br />
            <input type="color" value={f.brandColors[i] ?? "#7a1f2b"} onChange={(e) => setColor(i, e.target.value)} />
          </label>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save settings"}</button>
      </div>
      <Note m={msg} />
    </div>
  );
}

export function Users({ users, meId }: { users: User[]; meId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("client_editor");
  const [send, setSend] = useState(true);
  const [msg, setMsg] = useState<Msg>(null);

  async function add() {
    setMsg(null);
    const { ok, j } = await call("/api/admin/users", "POST", { email, role, sendLink: send });
    if (!ok) return setMsg({ kind: "err", text: j.error ?? "Could not add" });
    setMsg({ kind: "ok", text: j.emailed ? `Added ${email} and emailed a sign-in link.` : `Added ${email}. They can request a sign-in link from the login page.` });
    setEmail(""); router.refresh();
  }
  async function change(u: User, r: string) {
    const { ok, j } = await call(`/api/admin/users/${u.id}`, "PATCH", { role: r });
    setMsg(ok ? { kind: "ok", text: `${u.email} is now ${ROLE_LABEL[r]}.` } : { kind: "err", text: j.error }); router.refresh();
  }
  async function remove(u: User) {
    if (!confirm(`Remove ${u.email}? They will no longer be able to sign in.`)) return;
    const { ok, j } = await call(`/api/admin/users/${u.id}`, "DELETE");
    setMsg(ok ? { kind: "ok", text: `Removed ${u.email}.` } : { kind: "err", text: j.error }); router.refresh();
  }
  return (
    <div className="card">
      <table>
        <thead><tr><th>Email</th><th>Role</th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}{u.id === meId && <span className="mute"> (you)</span>}</td>
              <td><select value={u.role} onChange={(e) => change(u, e.target.value)} aria-label={`Role for ${u.email}`} style={{ width: "auto" }}>
                {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
              <td style={{ textAlign: "right" }}>{u.id !== meId && <button className="btn" type="button" onClick={() => remove(u)}>Remove</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mute">Admins manage settings and people. Editors create and edit codes. Viewers can look but not change anything.</p>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label style={{ flex: "2 1 220px", margin: 0 }}>Add a person<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.org" /></label>
        <label style={{ flex: "1 1 120px", margin: 0 }}>Role<select value={role} onChange={(e) => setRole(e.target.value)}>
          {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <button className="btn primary" type="button" disabled={!email.trim()} onClick={add}>Add</button>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0 0" }}>
        <input type="checkbox" style={{ width: "auto" }} checked={send} onChange={(e) => setSend(e.target.checked)} /> Email them a sign-in link now
      </label>
      <Note m={msg} />
    </div>
  );
}

export function Domain({ domain }: { domain: string }) {
  const [state, setState] = useState<{ status: string; message: string; cname: string[]; addresses: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    const { j } = await call("/api/admin/domain-check", "POST");
    setBusy(false);
    setState(j.status ? j : { status: "error", message: j.error ?? "Check failed", cname: [], addresses: [] });
  }
  return (
    <div className="card">
      <p style={{ marginTop: 0 }}>Printed codes use <strong>{domain}</strong>. To make it work:</p>
      <ol style={{ marginTop: 0 }}>
        <li>On Railway, open this service, Settings, Networking, and add <code>{domain}</code> as a custom domain. Railway shows the CNAME target.</li>
        <li>In the domain's DNS (Cloudflare), add a <code>CNAME</code> record for <code>{domain.split(".")[0]}</code> pointing at that target. Leave Cloudflare's proxy on (orange cloud) so scans carry city-level location.</li>
        <li>Press the button below until it reports success.</li>
      </ol>
      <div className="row">
        <button className="btn" type="button" disabled={busy} onClick={check}>{busy ? "Checking…" : "Check domain"}</button>
        <a className="btn" href="/privacy" target="_blank" rel="noreferrer">Preview privacy notice</a>
      </div>
      {state && (
        <div role="status" style={{ marginTop: 10 }}>
          <p className={state.status === "ok" ? "ok" : "err"} style={{ margin: 0 }}>{state.status === "ok" ? "✓ " : "✗ "}{state.message}</p>
          {(state.cname.length > 0 || state.addresses.length > 0) && <p className="mute" style={{ margin: "4px 0 0" }}>{state.cname.length > 0 && <>CNAME → {state.cname.join(", ")}. </>}Resolves to {state.addresses.join(", ")}.</p>}
        </div>
      )}
      <p className="mute">Safety net: also add a second domain you own (for example a neutral short domain) as another custom domain on this service. The app answers on any domain pointed at it, so old printed codes keep working if the main domain ever has trouble.</p>
    </div>
  );
}

export function Housekeeping({ months }: { months: number }) {
  const [out, setOut] = useState<string>("");
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const { ok, j } = await call("/api/admin/jobs", "POST");
    setBusy(false);
    setOut(ok ? `Expired ${j.expired} code(s). Digest emails sent: ${j.digests.sent}. Summarized ${j.retention.summarizedDays} day(s) and pruned ${j.retention.prunedScans} old scan record(s).` : j.error ?? "Failed");
  }
  return (
    <div className="card">
      <p style={{ marginTop: 0 }}>A nightly job (called by a Railway cron service) marks expired codes, sends summary emails, and keeps detailed scan records for <strong>{months} months</strong>, then replaces them with daily totals. It is safe to run any time.</p>
      <button className="btn" type="button" disabled={busy} onClick={run}>{busy ? "Running…" : "Run housekeeping now"}</button>
      {out && <p role="status" className="mute">{out}</p>}
    </div>
  );
}
