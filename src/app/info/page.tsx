import { marked } from "marked";
import { getCurrentUser, isActiveMember } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub, Card, Badge } from "@/components/ui";
import { getSettings, Settings } from "@/lib/settings";

export const dynamic = "force-dynamic";

function renderInfoMd(md: string, cfg: Settings): string {
  const withVars = md
    .replaceAll("{{office_address}}", cfg.office_address)
    .replaceAll("{{flex_window}}", cfg.flex_unavailable_window);
  return marked.parse(withVars, { async: false });
}

// Content is admin-edited markdown from settings (see /admin/info) — the
// public part for everyone, the practical part for logged-in members only.
// This replaces the old semi-private Notion page.
export default async function InfoPage() {
  const user = await getCurrentUser();
  const cfg = await getSettings();
  const member = isActiveMember(user);

  return (
    <>
      <Nav user={user} />
      <Page>
        <H1>Practical info</H1>
        <Sub>Everything you need for a day at the office.</Sub>
        <div className="space-y-4">
          <Card>
            <InfoProse html={renderInfoMd(cfg.info_public_md, cfg)} />
          </Card>
          {member ? (
            <Card>
              <p className="mb-3">
                <Badge tone="teal">members only</Badge>
              </p>
              <InfoProse html={renderInfoMd(cfg.info_members_md, cfg)} />
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-slate-500">
                Members see more here — door instructions, wifi, meeting
                rooms, facilities.{" "}
                {user?.status === "imported" ? (
                  <a href="/welcome" className="text-teal-700 font-medium">
                    Finish setting up your account
                  </a>
                ) : (
                  <a href="/login?next=/info" className="text-teal-700 font-medium">
                    Log in
                  </a>
                )}{" "}
                to view it.
              </p>
            </Card>
          )}
        </div>
      </Page>
    </>
  );
}

function InfoProse({ html }: { html: string }) {
  return (
    <div
      className="text-sm text-slate-700 leading-relaxed space-y-3
        [&_h2]:font-serif [&_h2]:font-medium [&_h2]:text-lg [&_h2]:text-slate-900 [&_h2]:mt-5 [&_h2]:mb-1 [&_h2:first-child]:mt-0
        [&_h3]:font-semibold [&_h3]:text-slate-900 [&_h3]:mt-4
        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1
        [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1
        [&_a]:text-teal-700 [&_a]:underline
        [&_em]:text-slate-400"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
