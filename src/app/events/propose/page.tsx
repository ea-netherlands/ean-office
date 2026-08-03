import { redirect } from "next/navigation";
import { getCurrentUser, isActiveMember } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub } from "@/components/ui";
import { ProposeForm } from "./propose-form";

export const dynamic = "force-dynamic";

export default async function ProposeEventPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/events/propose");
  if (!isActiveMember(user)) redirect("/");

  return (
    <>
      <Nav user={user} />
      <Page>
        <H1>Propose an event</H1>
        <Sub>
          Members can host EA-aligned events at the office outside office hours
          — reading groups, discussions, workshops, talks, socials. Tell us
          what you have in mind and an admin will come back to you.
        </Sub>
        <ProposeForm />
      </Page>
    </>
  );
}
