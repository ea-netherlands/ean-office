import { Page, H1, Sub } from "@/components/ui";
import { TransferClient } from "./transfer-client";
import { requireAdminPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TransferPage() {
  await requireAdminPage();
  return (
    <Page wide>
      <H1>Move bookings across</H1>
      <Sub>
        Brings the old hotdesk spreadsheet&apos;s future bookings into the app.
        Every booking is made the same way a member making it would, so the
        office can&apos;t end up over-booked.
      </Sub>
      <TransferClient />
    </Page>
  );
}
