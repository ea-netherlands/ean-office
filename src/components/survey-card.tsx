import { cookies } from "next/headers";
import { Card, Icon, btnPrimary } from "@/components/ui";
import { dismissSurveyAction } from "@/actions/survey";
import { SURVEY, surveyLink, surveyOpen } from "@/lib/survey";
import { todayAms } from "@/lib/dates";

/**
 * The office survey ask. Shows until this browser opens the survey or waves
 * it away, and disappears by itself once the survey has closed.
 */
export async function SurveyCard({ className = "" }: { className?: string }) {
  if (!surveyOpen(todayAms())) return null;
  const jar = await cookies();
  if (jar.get(SURVEY.cookie)) return null;

  return (
    <Card className={`text-left ${className}`}>
      <div className="flex items-start gap-3">
        <Icon name="message-2" className="text-2xl text-teal-700 mt-0.5" />
        <div className="flex-1">
          <h2>Help shape the office</h2>
          <p className="text-sm text-slate-600 mt-1">
            Tell us what works, what doesn&apos;t, and what would make the space
            more useful for you. It takes about {SURVEY.minutes} minutes and
            is open until {SURVEY.closesLabel}.
          </p>
          <div className="flex items-center gap-3 flex-wrap mt-3">
            <a href={surveyLink()} target="_blank" rel="noopener" className={btnPrimary}>
              Take the survey
              <Icon name="external-link" />
            </a>
            <form action={dismissSurveyAction}>
              <button type="submit" className="text-sm text-slate-500 hover:text-slate-700 cursor-pointer">
                Not now
              </button>
            </form>
          </div>
        </div>
      </div>
    </Card>
  );
}
