// Sends an e-mail through Resend. Needs RESEND_API_KEY and MAIL_FROM (an address on a domain verified in Resend) in the server settings.
export async function sendEmail(to: string[], subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  const list = Array.from(new Set(to.map((address) => address.trim().toLowerCase()).filter((address) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address))));
  if (!list.length) return { ok: false, error: "No e-mail address to send to." };
  if (!key || !from) return { ok: false, error: "E-mail is not set up (RESEND_API_KEY and MAIL_FROM are missing)." };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: list, subject, html }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { ok: false, error: `The e-mail service refused the message (${response.status}).` };
    return { ok: true };
  } catch {
    return { ok: false, error: "The e-mail service could not be reached." };
  }
}

const esc = (value: string) => value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
export function emailShell(title: string, bodyHtml: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#15203e"><div style="background:#15203e;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:700;font-size:18px">J-SCHOOLS</div><div style="border:1px solid #e3e6ee;border-top:0;padding:20px;border-radius:0 0 12px 12px"><h2 style="margin:0 0 12px;font-size:18px">${esc(title)}</h2>${bodyHtml}<p style="margin-top:24px;color:#6b7280;font-size:12px">J-SCHOOLS · school management for Uganda</p></div></div>`;
}
export { esc as escapeHtml };
