import { Page, H1, Sub } from "@/components/ui";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <Page wide>
      <H1>Import members</H1>
      <Sub>
        Bring in a name/email list from a spreadsheet. Nobody is notified and
        nobody is counted as a member yet — they land as{" "}
        <strong>imported</strong>, and become a real, counted member only
        once they log in and accept the guidelines at{" "}
        <code className="text-xs bg-slate-100 rounded-lg px-1 py-0.5">
          /welcome
        </code>
        . Safe to re-run after fixing a typo: anyone already in the system is
        left untouched.
      </Sub>
      <ImportClient />
    </Page>
  );
}
