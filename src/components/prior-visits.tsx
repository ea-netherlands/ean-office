import { Badge } from "@/components/ui";
import { formatDayLong } from "@/lib/dates";
import { PriorVisit } from "@/lib/visit-history";

const STATUS_TONE: Record<string, "green" | "red" | "stone"> = {
  approved: "green",
  declined: "red",
};

/**
 * A prior request for the same email, shown so a decision doesn't miss that
 * this person has been here (or been turned down) before — prompted by
 * declining someone whose earlier approved visit as a member's guest wasn't
 * visible on the card being reviewed.
 */
export function PriorVisitsNote({ visits }: { visits: PriorVisit[] }) {
  if (visits.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2">
      <p className="text-sm font-medium text-teal-800">Been here before</p>
      <ul className="mt-1 space-y-0.5 text-sm text-teal-700">
        {visits.map((v, i) => (
          <li key={i}>
            <Badge tone={STATUS_TONE[v.status] ?? "stone"}>{v.status}</Badge>{" "}
            {v.kind === "guest" ? `brought by ${v.hostName}` : "their own request"}{" "}
            · {formatDayLong(v.date)}
          </li>
        ))}
      </ul>
    </div>
  );
}
