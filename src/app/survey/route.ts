import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SURVEY } from "@/lib/survey";

export const dynamic = "force-dynamic";

// Every survey link goes through here so opening it from anywhere hides the
// card in this browser. Nothing about the member is passed on: the survey
// promises people they can answer anonymously.
export async function GET() {
  const jar = await cookies();
  jar.set(SURVEY.cookie, "opened", {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 24 * 60 * 60,
    path: "/",
  });
  redirect(SURVEY.url);
}
