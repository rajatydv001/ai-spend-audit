import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDepartmentAnalytics } from "@/lib/services/analytics-service";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true },
  });

  if (!user?.organizationId) {
    return NextResponse.json([]);
  }

  const data = await getDepartmentAnalytics(user.organizationId);
  return NextResponse.json(data);
}
