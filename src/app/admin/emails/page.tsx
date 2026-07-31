import { db, emailLog } from "@/db";
import { desc } from "drizzle-orm";
import { Page, H1, Sub, Badge } from "@/components/ui";
import { formatInstant } from "@/lib/dates";
import { EmailList } from "./email-list";

export const dynamic = "force-dynamic";

// Outbox viewer. In production this is an audit trail; without an email
// provider configured (local/demo) it's where every "sent" email lands.
export default async function EmailsPage() {
  const rows = await db.select().from(emailLog).orderBy(desc(emailLog.sentAt)).limit(200);
  const provider = !!process.env.RESEND_API_KEY;

  return (
    <Page wide>
      <H1>Email log</H1>
      <Sub>
        {provider
          ? "Sent via Resend — this is the audit trail."
          : "No email provider configured — messages are logged here instead of being delivered. Set RESEND_API_KEY to send for real."}
      </Sub>
      {!provider && rows.length > 0 && (
        <p className="mb-3">
          <Badge tone="amber">demo mode — nothing actually delivered</Badge>
        </p>
      )}
      <EmailList
        rows={rows.map((r) => ({
          id: r.id,
          to: r.toEmail,
          subject: r.subject,
          kind: r.kind,
          body: r.body,
          sentAt: formatInstant(r.sentAt),
          delivered: r.delivered,
        }))}
      />
    </Page>
  );
}
