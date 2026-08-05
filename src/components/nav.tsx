/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { SessionUser } from "@/lib/auth";
import { NavLink } from "./nav-link";

export function Nav({ user }: { user: SessionUser | null }) {
  return (
    <header className="no-print sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-slate-200">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 whitespace-nowrap">
          <img src="/ean-logo-mark.svg" alt="" className="h-7 w-auto" />
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

