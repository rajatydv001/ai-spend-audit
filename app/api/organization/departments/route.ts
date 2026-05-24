import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createDepartment, getDepartments } from "@/lib/services/organization-service";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.organizationId) {
    return NextResponse.json([]);
  }

  const departments = await getDepartments(user.organizationId);
  return NextResponse.json(departments);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can create departments" }, { status: 403 });
  }
  if (!user?.organizationId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const { name } = await request.json();
  const dept = await createDepartment(user.organizationId, name);
  return NextResponse.json(dept, { status: 201 });
}
