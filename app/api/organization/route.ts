import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createOrganization, getOrganization } from "@/lib/services/organization-service";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await request.json();
  if (!name) {
    return NextResponse.json({ error: "Organization name required" }, { status: 400 });
  }

  const org = await createOrganization(name, session.user.id);
  return NextResponse.json(org, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await (await import("@/lib/db")).prisma.user.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true },
  });

  if (!user?.organizationId) {
    return NextResponse.json({ organization: null });
  }

  const org = await getOrganization(user.organizationId);
  return NextResponse.json(org);
}
