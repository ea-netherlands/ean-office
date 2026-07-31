import QRCode from "qrcode";
import { appUrl } from "@/lib/auth";
import { Page, H1, Sub, btnSecondary } from "@/components/ui";
import { PrintQrButton } from "./print-button";

export const dynamic = "force-dynamic";

// Printable check-in stickers: one for the door, one for the lunch table,
// small ones per desk. The QR encodes one static URL and never expires.
export default async function QrPage() {
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
          Print this page and put one by the door, one on the lunch table, and
          a small one on each desk. The code never changes — reprint any time.
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
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center bg-white"
              style={{ pageBreakInside: "avoid" }}
            >
              <p className="font-semibold text-sm mb-2">Check in</p>
              <div
                className="mx-auto w-28 [&_svg]:w-full [&_svg]:h-auto"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              <p className="mt-1.5 font-mono text-[10px]">{short}</p>
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}
