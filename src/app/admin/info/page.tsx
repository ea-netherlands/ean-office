import { getSettings } from "@/lib/settings";
import { Page, H1, Sub } from "@/components/ui";
import { InfoEditor } from "./info-editor";

export const dynamic = "force-dynamic";

export default async function AdminInfoPage() {
  const cfg = await getSettings();
  return (
    <Page wide>
      <H1>Info page</H1>
      <Sub>
        What visitors and members see at /info — this replaces the old Notion
        page. Markdown; use {"{{office_address}}"} and{" "}
        {"{{flex_window}}"} to insert the values from settings.
      </Sub>
      <InfoEditor
        publicMd={cfg.info_public_md}
        membersMd={cfg.info_members_md}
      />
    </Page>
  );
}
