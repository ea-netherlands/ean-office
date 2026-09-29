import { Page, H1, Sub, Card, Badge } from "@/components/ui";
import { SURVEY, surveyOpen, surveyRecipients } from "@/lib/survey";
import { todayAms } from "@/lib/dates";
import { SurveySendForm, SurveyReminderForm } from "./send-form";

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
  const invited = everyone.filter((r) => r.sent);
  const reminded = invited.filter((r) => r.reminded).length;
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

      <Card className="mb-4">
        <h2>Reminder</h2>
        <p className="text-sm text-slate-600 mt-1">
          A short nudge before the survey closes, to everyone who got the
          invite. Answers are anonymous, so it can&apos;t skip people who
          already replied. It thanks them and tells them to ignore it. Best
          sent on Monday.
        </p>
        <p className="text-sm text-slate-700 mt-3">
          <strong>{reminded}</strong> of {invited.length} reminded
        </p>
        <div className="rule-dashed-y my-4" />
        <SurveyReminderForm left={invited.length - reminded} />
      </Card>

    </Page>
  );
}
