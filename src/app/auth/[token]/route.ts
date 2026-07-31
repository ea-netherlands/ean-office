import { NextRequest, NextResponse } from "next/server";
import { consumeLoginToken, createSession, setSessionCookie } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const result = await consumeLoginToken(token);
  const base = request.nextUrl.origin;
  if (!result) {
    return NextResponse.redirect(`${base}/login?expired=1`);
  }
  const session = await createSession(result.user.id);
  await setSessionCookie(session);
  return NextResponse.redirect(`${base}${result.redirectTo || "/"}`);
}
