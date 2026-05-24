import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createOrganization } from "@/lib/services/organization-service";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationName, currency, teamSize } = await request.json();

  if (organizationName) {
    await createOrganization(organizationName, session.user.id);
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      currency: currency || "USD",
      teamSize: teamSize || 1,
      onboarded: true,
    },
  });

  return NextResponse.json({ success: true });
}
