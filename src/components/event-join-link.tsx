import Link from "next/link";
import { acceptsSignups, eventJoin } from "@/lib/event-join";

/**
 * The single "come to this" link, for a co-working day or an evening event.
 * Out to Luma when the thing has a Luma page, into our own sign-up form when
 * it doesn't — see eventJoin.
 */
export function EventJoinLink({
  event,
  className,
}: {
  event: {
    id: string;
    url?: string | null;
    type?: string | null;
    signupsOpen?: boolean | null;
  };
  className: string;
}) {
  // Nothing to offer when the door is shut — a "Sign up" pill on an
  // invite-only session is worse than no pill at all.
  if (!acceptsSignups(event)) return null;
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
