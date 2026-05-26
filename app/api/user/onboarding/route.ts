import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createOrganization } from "@/lib/services/organization-service";

export async function POST(request: Request) {
  const { organizationName, currency, teamSize } = await request.json();

  if (organizationName) {
    await createOrganization(organizationName, "");
  }

  return NextResponse.json({ success: true });
}
