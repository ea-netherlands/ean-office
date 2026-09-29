import { Page, H1, Sub, Card, Badge } from "@/components/ui";
import { SURVEY, surveyOpen, surveyRecipients } from "@/lib/survey";
import { todayAms } from "@/lib/dates";
import { SurveySendForm } from "./send-form";

export const dynamic = "force-dynamic";

// One-off send for the 2026 office survey. Safe to press more than once:
// anyone already in the email log for this survey is skipped.
export default async function SurveyAdminPage() {
  const everyone = await surveyRecipients(true);
  const core = everyone.filter((r) => r.status !== "imported");
  const imported = everyone.filter((r) => r.status === "imported");
  const count = (rows: typeof everyone) => ({
    total: rows.length,
    sent: rows.filter((r) => r.sent).length,
  });
  const c = count(core);
  const i = count(imported);
  const provider = !!process.env.RESEND_API_KEY;

  return (
    <Page>
      <H1>Office survey</H1>
      <Sub>
        Email every member a link to the survey. It&apos;s open until{" "}
        {SURVEY.closesLabel}, and the card on the home and check-in pages
        disappears after that.
      </Sub>

      {!surveyOpen(todayAms()) && (
        <p className="mb-3">
          <Badge tone="amber">the survey has closed</Badge>
        </p>
      )}
      {!provider && (
        <p className="mb-3">
          <Badge tone="amber">demo mode — nothing actually delivered</Badge>
        </p>
      )}

      <Card className="mb-4">
        <ul className="text-sm text-slate-700 space-y-1">
          <li>
            Members and trial visitors: <strong>{c.sent}</strong> of {c.total} emailed
          </li>
          <li>
            Imported, not yet activated: <strong>{i.sent}</strong> of {i.total} emailed
          </li>
        </ul>
        <div className="rule-dashed-y my-4" />
        <SurveySendForm importedCount={i.total - i.sent} />
      </Card>

      <p className="text-xs text-slate-500">
        Each link carries the member&apos;s id as a <code>uid</code> hidden
        field. Add a hidden field called <code>uid</code> to the Typeform and
        each response will show who sent it, so you can remind only the people
        who haven&apos;t answered.
      </p>
    </Page>
  );
}
