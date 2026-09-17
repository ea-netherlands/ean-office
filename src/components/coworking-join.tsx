import Link from "next/link";
import { coworkingJoin } from "@/lib/coworking";

/**
 * The single "come to this co-working day" link. Out to Luma when the day has
 * a Luma page, into our own request form when it doesn't — see coworkingJoin.
 */
export function CoworkingJoinLink({
  event,
  className,
}: {
  event: { id: string; url?: string | null };
  className: string;
}) {
  const join = coworkingJoin(event);
  return join.external ? (
    <a href={join.href} target="_blank" rel="noreferrer" className={className}>
      {join.label}
    </a>
  ) : (
    <Link href={join.href} className={className}>
      {join.label}
    </Link>
  );
}
