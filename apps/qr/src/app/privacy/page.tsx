import { getDb, clients } from "@e-suite/db";
import { retentionMonths } from "@/lib/retention";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy notice for QR code scans", robots: { index: true } };

/** Public notice for people who scan a code. Written to match exactly what the app records; update it if the app changes. */
export default async function Privacy() {
  const [client] = await (await getDb()).select().from(clients).limit(1);
  const name = client?.name ?? "this organization";
  const months = retentionMonths();
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", lineHeight: 1.55, color: "var(--ink)" }}>
      <h1 style={{ fontSize: "1.6rem" }}>Privacy notice: QR code scans</h1>
      <p>When you scan a QR code from {name}, we count the scan so we can learn which flyers, posters and posts people respond to. This page explains what that involves.</p>

      <h2>What we record</h2>
      <ul>
        <li>The date and time of the scan and which code was scanned.</li>
        <li>The type of device (phone, tablet or computer), its operating system and browser.</li>
        <li>An approximate location: country, state or region, and city. It comes from your network connection and is never more precise than a city.</li>
        <li>The website or app you came from, if your browser shares it.</li>
        <li>A scrambled identifier, made from your network address and browser details with a secret that changes every day. We use it only to tell repeat scans from new ones on the same day. It cannot be turned back into your address, and it stops matching the next day.</li>
      </ul>

      <h2>What we do not record</h2>
      <ul>
        <li>Your name, email address, phone number or any account details.</li>
        <li>Your IP address. It is used for the moment of the scan and not stored.</li>
        <li>Your precise location (GPS).</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>Detailed scan records are kept for {months} months. After that they are replaced by daily totals (how many scans, how many were unique, and counts by device type and country), which cannot be tied to any individual.</p>

      <h2>Cookies</h2>
      <p>Scanning a code sets no cookies. The exception is a code protected by a password: after you enter it correctly, we set one small cookie so you are not asked again for 24 hours.</p>

      <h2>Automated visits</h2>
      <p>Link previews and search engine crawlers are flagged and left out of our counts.</p>

      <h2>Questions</h2>
      <p>{client?.notifyEmail ? <>Contact <a href={`mailto:${client.notifyEmail}`}>{client.notifyEmail}</a>.</> : <>Contact {name}.</>}</p>
    </main>
  );
}
