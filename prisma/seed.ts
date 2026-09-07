import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { seedPricingCatalog } from "../lib/services/pricing-catalog-service";
import { shouldSeedAdmin } from "../lib/services/seed-guard";

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
});

const SEED_EMAIL = "admin@aispendingaudit.com";
const DEV_SEED_PASSWORD = "ChangeMe123!";

async function main() {
  const seedCheck = shouldSeedAdmin(process.env);
  if (!seedCheck.allowed) {
    console.log("Skipping admin seed:", seedCheck.reason);
  } else {
    await seedAdmin(process.env.SEED_ADMIN_PASSWORD || DEV_SEED_PASSWORD);
  }
}

async function seedAdmin(seedPassword: string) {
  const existing = await prisma.user.findUnique({ where: { email: SEED_EMAIL } });
  if (existing) {
    // Idempotent upgrade: the canonical seed account is the platform admin.
    await prisma.user.update({
      where: { email: SEED_EMAIL },
      data: { isPlatformAdmin: true },
    });
    console.log("Seed user already exists; ensured isPlatformAdmin");
    return;
  }

  const passwordHash = await bcrypt.hash(seedPassword, 10);

  const user = await prisma.user.create({
    data: {
      email: SEED_EMAIL,
      name: "Admin User",
      passwordHash,
      role: "ADMIN",
      isPlatformAdmin: true,
      onboarded: true,
    },
  });
  console.log("Created seed user:", user.id);

  const org = await prisma.organization.create({
    data: {
      name: "Default Organization",
      slug: "default-org",
    },
  });
  console.log("Created default organization:", org.id);

  await prisma.user.update({
    where: { id: user.id },
    data: { organizationId: org.id },
  });
  console.log("Linked user to organization");
}

main()
  .then(() => seedPricingCatalog(prisma))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
