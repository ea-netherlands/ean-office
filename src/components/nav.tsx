/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { SessionUser } from "@/lib/auth";
import { NavLink } from "./nav-link";

export function Nav({ user }: { user: SessionUser | null }) {
  return (
    // Solid white and 1px slate-200, matching the website's own sticky header.
    // (It used to be white/85 + backdrop-blur, which is a different material
    // from anything on the site.)
    <header className="no-print sticky top-0 z-20 bg-white border-b border-slate-200">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
        {/* Brand lockup, a hairline divider, then the sub-brand — the same
            pattern the job board uses, so the two apps read as siblings of the
            website rather than three unrelated products. */}
        <Link href="/" className="flex items-center gap-3 whitespace-nowrap">
          <img
            src="/ean-logo.svg"
            alt="Effectief Altruïsme Nederland"
            className="h-7 w-auto"
          />
          <span aria-hidden className="h-5 w-px bg-slate-300" />
          <span className="font-serif font-medium text-lg text-slate-900">
            Office
          </span>
        </Link>
        {user ? (
          <nav className="flex items-center gap-1 text-sm overflow-x-auto">
            <NavLink href="/">Today</NavLink>
            <NavLink href="/book">Book</NavLink>
            <NavLink href="/me">Me</NavLink>
            <NavLink href="/info">Info</NavLink>
            {user.role === "admin" && (
              <NavLink href="/admin" accent>
                Admin
              </NavLink>
            )}
          </nav>
        ) : (
          <nav className="flex items-center gap-1 text-sm">
            <NavLink href="/info">Info</NavLink>
            <NavLink href="/join">Join</NavLink>
            <NavLink href="/login" accent>
              Log in
            </NavLink>
          </nav>
        )}
      </div>
    </header>
  );
}

