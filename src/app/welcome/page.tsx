import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub } from "@/components/ui";
import { CommunityProfileCard } from "@/components/community-profile-card";
import { WelcomeForm } from "./welcome-form";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/welcome");
  if (user.status !== "imported") redirect("/book");

  return (
    <>
      <Nav user={user} />
      <Page>
        <H1>Welcome back, {user.name.split(" ")[0]}</H1>
        <Sub>One quick step and you&apos;re booking desks again.</Sub>

        <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 mb-5 text-sm text-slate-700 space-y-3">
          <p>
            We&apos;ve moved desk booking off the old shared spreadsheet and
            into this app.
          </p>
          <div>
            <p className="font-medium text-slate-900">Better for you:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>Block-book your regular days in one go, instead of adding your name to the sheet week by week</li>
              <li>Works properly from your phone — no squinting at a spreadsheet</li>
              <li>Pick exactly which desk you want, or move if you change your mind</li>
              <li>Opt in to share what you&apos;re working on, so people can put a face to a name and it&apos;s easier to strike up a conversation</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-slate-900">Better for us:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>Approvals and booking no longer run through one person&apos;s inbox</li>
              <li>The QR check-in at the door tracks who&apos;s actually attending, not just who signed up</li>
              <li>That same data builds our funder reports automatically, instead of us reconstructing it by hand</li>
            </ul>
          </div>
          <p>
            You&apos;re already on our list from before, so there&apos;s
            nothing to apply for — just confirm a couple of details below and
            you&apos;re straight through to booking.
          </p>
        </div>

        <WelcomeForm defaultName={user.name} />

        <div className="mt-4">
          <CommunityProfileCard
            defaultOpen
            community={{
              profileVisible: user.profileVisible,
              bio: user.bio ?? user.about,
              expertise: user.expertise,
              publicCauseAreas: user.publicCauseAreas,
              publicLink: user.publicLink ?? user.profileUrl,
            }}
          />
        </div>
      </Page>
    </>
  );
}
