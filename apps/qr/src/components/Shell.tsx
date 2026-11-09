import type { SessionUser } from "@/lib/auth";

export function Shell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <>
      <div className="bar">
        <div className="row" style={{ gap: 16 }}>
          <strong><a href="/dashboard" style={{ textDecoration: "none", color: "inherit" }}>E Suite · QR</a></strong>
          {user.role === "admin" && <a href="/admin" style={{ textDecoration: "none", color: "var(--mute)" }}>Admin</a>}
        </div>
        <form method="post" action="/api/auth/logout" className="row">
          <span className="mute">{user.email} · {user.role.replace("_", " ")}</span>
          <button className="btn" type="submit">Sign out</button>
        </form>
      </div>
      <div className="wrap">{children}</div>
    </>
  );
}
