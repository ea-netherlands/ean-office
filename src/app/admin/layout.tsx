import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Icon } from "@/components/ui";
import { db, users, ensureMigrated } from "@/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await ensureMigrated();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin") redirect("/");

  const admins = await db.select().from(users).where(eq(users.role, "admin"));

  return (
    <>
      <Nav user={user} />
      <div className="mx-auto w-full max-w-5xl px-4 pt-4">
        <nav className="no-print flex gap-1 text-sm overflow-x-auto pb-2 border-b border-slate-200">
          <AdminLink href="/admin/requests">Requests</AdminLink>
          <AdminLink href="/admin/today">Today</AdminLink>
          <AdminLink href="/admin/members">Members</AdminLink>
          <AdminLink href="/admin/import">Import</AdminLink>
          <AdminLink href="/admin/events">Events</AdminLink>
          <AdminLink href="/admin/reports">Reports</AdminLink>
          <AdminLink href="/admin/emails">Emails</AdminLink>
          <AdminLink href="/admin/info">Info page</AdminLink>
          <AdminLink href="/admin/qr">QR</AdminLink>
          <AdminLink href="/admin/settings">Settings</AdminLink>
        </nav>
        {admins.length < 3 && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-900 text-sm rounded-xl px-4 py-3">
            <Icon name="alert-triangle" className="mr-1" /> Only {admins.length} admin{admins.length === 1 ? "" : "s"} exist.
            The minimum is three — single-admin is the failure mode this app
            exists to fix. Promote someone from the{" "}
            <Link href="/admin/members" className="underline font-medium">
              members page
            </Link>
            .
          </div>
        )}
      </div>
      {children}
    </>
  );
}

function AdminLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-lg whitespace-nowrap text-slate-600 hover:bg-slate-100 font-medium"
    >
      {children}
    </Link>
  );
}
