export default async function Login({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const q = await searchParams;
  return (
    <main style={{ maxWidth: 380, margin: "12vh auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Sign in</h1>
      {q.sent ? <p>If that email has access, a sign-in link is on its way. It works once and expires in 15 minutes.</p> : (
        <form method="post" action="/api/auth/request" style={{ display: "grid", gap: 12 }}>
          <label>Email<input name="email" type="email" required autoFocus style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} /></label>
          <button type="submit" style={{ padding: 10 }}>Email me a link</button>
          {q.error && <p style={{ color: "#a00" }}>That link is invalid or expired. Request a new one.</p>}
        </form>
      )}
    </main>
  );
}
