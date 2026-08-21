import { redirect } from "next/navigation";
import { getCurrentUser, isActiveMember } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub } from "@/components/ui";
import { GuestForm } from "./guest-form";

export const dynamic = "force-dynamic";

export default async function GuestPage() {
  const user = await getCurrentUser();
  if (!isActiveMember(user)) redirect("/login?next=/guest");

  return (
    <>
      <Nav user={user} />
      <Page>
        <H1>Bring someone</H1>
        <Sub>
          Ask for a desk for someone who doesn&apos;t have an account yet. Tell
          us who they are and why, and the team will approve it or come back to
          you — usually within one working day. Your guest hears nothing until
          it&apos;s approved.
        </Sub>
        <GuestForm />
      </Page>
    </>
  );
}
