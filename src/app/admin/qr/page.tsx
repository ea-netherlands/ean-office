import QRCode from "qrcode";
import { appUrl } from "@/lib/auth";
import { Page, H1, Sub } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { PrintQrButton } from "./print-button";

export const dynamic = "force-dynamic";

// Printable signage: two big check-in posters, then one numbered label per
// desk plus the lunch table. The number labels the desk to match the floor
// plan on /book; the code checks you in. One static URL, never expires.
export default async function QrPage() {
  const cfg = await getSettings();
  const url = `${appUrl()}/checkin`;
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    width: 320,
    errorCorrectionLevel: "M",
  });
  const short = url.replace(/^https?:\/\//, "");

  return (
    <Page>
      <div className="no-print">
        <H1>Check-in QR codes</H1>
        <Sub>
          Print this page, then cut it up. The two big posters go by the door
          and on the lunch table. The numbered labels go one per desk — the
          number has to match the floor plan in the booking page, so desk 1 is
          the one nearest the door, then 2/3 and 4/5 as pairs, and 6 at the far
          end. The code never changes, so reprint any time.
        </Sub>
        <PrintQrButton />
      </div>

      <div className="space-y-10 mt-6">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-white"
            style={{ pageBreakInside: "avoid" }}
          >
            <h2 className="text-2xl font-bold mb-1">Working here today?</h2>
            <p className="text-slate-500 mb-4">
              Scan to check in — two taps. It helps us show funders the office
              is being used.
            </p>
            <div
              className="mx-auto w-64 [&_svg]:w-full [&_svg]:h-auto"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <p className="mt-3 font-mono text-lg">{short}</p>
            <p className="text-xs text-slate-400 mt-2">
              Camera not cooperating? Just type the address.
            </p>
          </div>
        ))}
        {/* One numbered label per desk: the number labels the desk itself,
            the code checks you in. Desk numbers must match /book's floor plan. */}
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: cfg.desk_count }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              className="border-2 border-dashed border-slate-300 rounded-xl p-4 flex items-center gap-4 bg-white"
              style={{ pageBreakInside: "avoid" }}
            >
              <div className="text-center shrink-0">
                <p className="text-5xl font-bold leading-none">{n}</p>
                <p className="text-[10px] text-slate-500 mt-1">desk</p>
              </div>
              <div className="flex-1 text-center">
                <div
                  className="mx-auto w-24 [&_svg]:w-full [&_svg]:h-auto"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
                <p className="mt-1 font-mono text-[9px]">{short}</p>
                <p className="text-[9px] text-slate-500">scan to check in</p>
              </div>
            </div>
          ))}
        </div>
        <div
          className="border-2 border-dashed border-slate-300 rounded-xl p-4 flex items-center gap-4 bg-white"
          style={{ pageBreakInside: "avoid" }}
        >
          <div className="text-center shrink-0 px-2">
            <p className="text-2xl font-bold leading-none">Lunch</p>
            <p className="text-2xl font-bold leading-none">table</p>
          </div>
          <div className="flex-1 text-center">
            <div
              className="mx-auto w-24 [&_svg]:w-full [&_svg]:h-auto"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <p className="mt-1 font-mono text-[9px]">{short}</p>
            <p className="text-[9px] text-slate-500">scan to check in</p>
          </div>
        </div>
      </div>
    </Page>
  );
}
