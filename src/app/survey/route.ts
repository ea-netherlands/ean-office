import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SURVEY, typeformUrl } from "@/lib/survey";

export const dynamic = "force-dynamic";

// Every survey link goes through here: it remembers that this browser has
// seen the survey (so the card stops asking) and forwards to Typeform with
// the member's id attached. Email links carry `?u=` because the click often
// lands in a browser that isn't logged in.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  const fromLink = new URL(req.url).searchParams.get("u");
  const jar = await cookies();
  jar.set(SURVEY.cookie, "opened", {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 24 * 60 * 60,
    path: "/",
  });
  redirect(typeformUrl(user?.id ?? fromLink));
}
