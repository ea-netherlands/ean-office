import Link from "next/link";
import { eventJoin } from "@/lib/event-join";

/**
 * The single "come to this" link, for a co-working day or an evening event.
 * Out to Luma when the thing has a Luma page, into our own sign-up form when
 * it doesn't — see eventJoin.
 */
export function EventJoinLink({
  event,
  className,
}: {
  event: { id: string; url?: string | null; type?: string | null };
  className: string;
}) {
  const join = eventJoin(event);
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
