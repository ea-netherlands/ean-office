import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { Page } from "@/components/ui";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  const { next } = await searchParams;
  if (user) redirect(next || "/");
  return (
    <>
      <Nav user={null} />
      <Page>
        <div className="max-w-sm mx-auto mt-8">
          <h1 className="text-2xl mb-2">Log in</h1>
          <p className="text-slate-500 text-sm mb-6">
            No passwords here — enter your email and we&apos;ll send you a link.
          </p>
          <Suspense>
            <LoginForm redirectTo={next} />
          </Suspense>
          <p className="text-sm text-slate-500 mt-6">
            Never been to the office?{" "}
            <a href="/join" className="text-teal-700 font-medium">
              Request a first visit
            </a>
            .
          </p>
        </div>
      </Page>
    </>
  );
}
