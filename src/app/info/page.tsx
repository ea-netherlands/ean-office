import { getCurrentUser } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { Page, H1, Sub, Card, Icon } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { WEEKDAY_NAMES } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function InfoPage() {
  const user = await getCurrentUser();
  const cfg = await getSettings();
  const coverage = cfg.host_coverage_days
    .map((d) => WEEKDAY_NAMES[d - 1])
    .join(", ");

  return (
    <>
      <Nav user={user} />
      <Page>
        <H1>Practical info</H1>
        <Sub>Everything you need for a day at the office.</Sub>
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold mb-1"><Icon name="map-pin" className="text-teal-600 mr-1.5" />Where</h2>
            <p className="text-sm text-slate-600">{cfg.office_address}</p>
          </Card>
          <Card>
            <h2 className="font-semibold mb-1"><Icon name="door" className="text-teal-600 mr-1.5" />Getting in</h2>
            <p className="text-sm text-slate-600">
              The door has a key box — a host or any member present can let you
              in. First visits are scheduled on hosted days ({coverage}) at
              11:00 or 13:00 so someone is there to welcome you.
            </p>
          </Card>
          <Card>
            <h2 className="font-semibold mb-1"><Icon name="armchair" className="text-teal-600 mr-1.5" />The space</h2>
            <p className="text-sm text-slate-600">
              {cfg.desk_count} proper desks plus a lunch table with{" "}
              {cfg.flex_count} workable spots. The lunch table is used for
              lunch from {cfg.flex_unavailable_window} — if you&apos;re working
              there, you&apos;ll need to pack up for that hour. Lounge seats
              are informal overflow: no booking needed, just sit.
            </p>
          </Card>
          <Card>
            <h2 className="font-semibold mb-1"><Icon name="tools-kitchen-2" className="text-teal-600 mr-1.5" />Lunch</h2>
            <p className="text-sm text-slate-600">
              Communal lunch around 12:00–13:00 at the lunch table. Bring your
              own or join the group run. Mention dietary needs in your first
              visit request and we&apos;ll make it work.
            </p>
          </Card>
          <Card>
            <h2 className="font-semibold mb-1"><Icon name="circle-check" className="text-teal-600 mr-1.5" />Checking in</h2>
            <p className="text-sm text-slate-600">
              Scan the QR code by the door (or on the lunch table) when you
              arrive. It takes two taps and it&apos;s how we show funders the
              office is being used — which keeps it free. Nobody is ever
              turned away for not checking in.
            </p>
          </Card>
          <Card>
            <h2 className="font-semibold mb-1"><Icon name="wifi" className="text-teal-600 mr-1.5" />Wifi</h2>
            <p className="text-sm text-slate-600">
              Network details are in your welcome email
              {user ? <> — password: <strong>{cfg.wifi_password}</strong></> : ", or ask anyone in the room"}
              .
            </p>
          </Card>
          <Card>
            <h2 className="font-semibold mb-1"><Icon name="heart-handshake" className="text-teal-600 mr-1.5" />House guidelines</h2>
            <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
              <li>Calls in the hallway or lounge, not at the desks.</li>
              <li>Cancel bookings you won&apos;t use — with eight desks, one tap makes a real difference.</li>
              <li>Leave your desk as you found it.</li>
              <li>Newcomers get priority for a warm welcome — say hi.</li>
            </ul>
          </Card>
        </div>
      </Page>
    </>
  );
}
