/**
 * Promotes an existing account to ADMIN.
 *
 * The seeder can create an admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD,
 * but that is only useful before you have an account. Once you have registered
 * through the UI, this promotes the account you already use — no second set of
 * credentials to keep, and no password handled on the command line.
 *
 *   npm run db:make:admin --workspace=@videohub/api -- you@example.com
 *   npm run db:make:admin --workspace=@videohub/api -- you@example.com --demote
 *
 * Moderation is an ADMIN capability; there is no separate moderator role.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const demote = process.argv.includes('--demote');
  const email = args[0]?.trim().toLowerCase();

  if (!email) {
    console.error('Usage: npm run db:make:admin --workspace=@videohub/api -- you@example.com');
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, displayName: true },
  });

  if (!user) {
    console.error(`No account with that email. Register at /register first, then re-run this.`);
    process.exitCode = 1;
    return;
  }

  const role = demote ? 'USER' : 'ADMIN';

  if (user.role === role) {
    console.log(`${user.email} is already ${role}. Nothing to do.`);
    return;
  }

  // Refuse to remove the last admin — that would lock moderation out entirely,
  // in the same spirit as the dashboard's self-demotion guard.
  if (demote) {
    const admins = await prisma.user.count({ where: { role: 'ADMIN' } });
    if (admins <= 1) {
      console.error('That is the only ADMIN. Promote someone else first.');
      process.exitCode = 1;
      return;
    }
  }

  await prisma.user.update({ where: { id: user.id }, data: { role } });

  console.log(`${user.email} (${user.displayName}) is now ${role}.`);
  if (!demote) console.log('Sign out and back in, then open /admin.');
}

main()
  .catch((error: unknown) => {
    console.error('Could not change the role:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
