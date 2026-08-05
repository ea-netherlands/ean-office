"use client";

import Link, { useLinkStatus } from "next/link";
import { Spinner } from "@/components/ui";

/**
 * Every page here is force-dynamic with no loading.tsx, so tapping a nav item
 * used to sit there looking dead until the server replied. `useLinkStatus` is
 * Next's hook for exactly this case — it reports the pending state of the
 * enclosing Link, so the item can say it's working.
 */
function PendingDot() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Spinner className="text-[0.8em]" />;
}

export function NavLink({
  href,
  children,
  accent,
}: {
  href: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`px-2.5 py-1.5 rounded-2xl whitespace-nowrap transition-colors inline-flex items-center gap-1.5 ${
        accent
          ? "btn-key bg-teal-600 hover:bg-teal-700 text-white font-medium"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
      <PendingDot />
    </Link>
  );
}
