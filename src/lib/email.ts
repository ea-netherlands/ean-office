import { db, emailLog, ensureMigrated } from "@/db";
import { newId } from "./ids";

// Transactional email. With RESEND_API_KEY set it sends via Resend; without it
// (local dev, demo) every message is stored in email_log and printed to the
// console, so the whole system is testable with no provider account.

const FROM = process.env.EMAIL_FROM || "EA Netherlands Office <office@effectiefaltruisme.nl>";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  kind: string;
}): Promise<void> {
  await ensureMigrated();
  let delivered = false;
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const result = await resend.emails.send({
        from: FROM,
        to: opts.to,
        subject: opts.subject,
        html: wrap(opts.html),
      });
      delivered = !result.error;
      if (result.error) console.error("[email] resend error:", result.error);
    } catch (err) {
      console.error("[email] send failed:", err);
    }
  } else {
    console.log(`[email:${opts.kind}] to=${opts.to} subject="${opts.subject}"`);
  }
  await db.insert(emailLog).values({
    id: newId("em"),
    toEmail: opts.to,
    subject: opts.subject,
    body: opts.html,
    kind: opts.kind,
    delivered,
  });
}

function wrap(inner: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;line-height:1.55;">
${inner}
<p style="color:#888;font-size:13px;margin-top:32px;">EA Netherlands · Amsterdam</p>
</body></html>`;
}

export function btn(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#16879c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;margin:4px 4px 4px 0;">${label}</a>`;
}

export function link(href: string, label: string): string {
  return `<a href="${href}" style="color:#16879c;">${label}</a>`;
}
