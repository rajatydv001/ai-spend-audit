import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
});

const DEFAULT_USER_ID = "default-user-id-000001";

async function main() {
  const existing = await prisma.user.findUnique({ where: { id: DEFAULT_USER_ID } });
  if (existing) {
    console.log("Default user already exists");
    return;
  }

  const user = await prisma.user.create({
    data: {
      id: DEFAULT_USER_ID,
      email: "default@local",
      name: "Default User",
      role: "ADMIN",
      onboarded: true,
    },
  });
  console.log("Created default user:", user.id);

  const org = await prisma.organization.create({
    data: {
      name: "Default Organization",
      slug: "default-org",
    },
  });
  console.log("Created default organization:", org.id);

  await prisma.user.update({
    where: { id: DEFAULT_USER_ID },
    data: { organizationId: org.id },
  });
  console.log("Linked user to organization");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
