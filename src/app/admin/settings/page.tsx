import { getSettings } from "@/lib/settings";
import { Page, H1, Sub } from "@/components/ui";
import { SettingsForm } from "./settings-form";
import { requireAdminPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdminPage();
  const cfg = await getSettings();
  return (
    <Page>
      <H1>Settings</H1>
      <Sub>
        Everything configurable lives here — no developer needed. Changes take
        effect immediately.
      </Sub>
      <SettingsForm cfg={cfg} />
    </Page>
  );
}
