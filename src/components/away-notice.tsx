import { Away, awayBefore, awayAfter } from "@/lib/away";
import { Notice } from "@/components/ui";

/**
 * The holiday notice, in the two places it has to read differently: next to a
 * form somebody is about to send, and on the screen they land on once they
 * have.
 *
 * `away` is always resolved on the server and passed down, so a client form
 * and the page around it can never disagree about the date — the browser's
 * clock is not the office's.
 */
export function AwayNotice({
  away,
  when = "before",
  className = "",
}: {
  away: Away | null;
  when?: "before" | "after";
  className?: string;
}) {
  if (!away) return null;
  return (
    <Notice className={className} live={when === "after"}>
      {when === "before" ? awayBefore(away) : awayAfter(away)}
    </Notice>
  );
}
