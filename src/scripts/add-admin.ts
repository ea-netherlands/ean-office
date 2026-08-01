/**
 * Create the first admin (or promote an existing member).
 *
 *   npm run admin:add -- "Full Name" name@example.org
 *   DATABASE_URL="postgres://…" npm run admin:add -- "Full Name" name@example.org
 *
 * Only needed to bootstrap the very first admin on a fresh database —
 * after that, admins add each other from /admin/members.
 */
import { db, ensureMigrated, users } from "../db";
import { sql, eq } from "drizzle-orm";
import { newId } from "../lib/ids";

async function main() {
  const [name, email] = process.argv.slice(2);
  if (!name || !email || !email.includes("@")) {
    console.error('Usage: npm run admin:add -- "Full Name" email@example.org');
    process.exit(1);
  }
  await ensureMigrated();

  const normalised = email.toLowerCase().trim();
  const [existing] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalised}`);

  if (existing) {
    await db
      .update(users)
      .set({ role: "admin", status: "active" })
      .where(eq(users.id, existing.id));
    console.log(`${existing.name} <${normalised}> is now an admin.`);
  } else {
    await db.insert(users).values({
      id: newId("usr"),
      name,
      email: normalised,
      role: "admin",
      status: "active",
      approvedAt: new Date(),
    });
    console.log(`Created admin ${name} <${normalised}>.`);
  }
  console.log("Log in at /login with that address to get a magic link.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
