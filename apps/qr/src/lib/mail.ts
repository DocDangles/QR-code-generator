/** Sends an email through Resend, or prints it to the server log when RESEND_API_KEY isn't set (local dev). */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[dev email] to=${to} subject=${JSON.stringify(subject)}\n${text}\n`);
    return true;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM ?? "E Suite <onboarding@resend.dev>", to: [to], subject, text }),
    });
    if (!res.ok) console.error("email failed", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.error("email failed", e);
    return false;
  }
}
