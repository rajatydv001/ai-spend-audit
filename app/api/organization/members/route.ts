import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { inviteMember, updateMemberRole, removeMember } from "@/lib/services/organization-service";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can invite members" }, { status: 403 });
  }
  if (!user?.organizationId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const { email, role } = await request.json();
  const invite = await inviteMember(user.organizationId, email, role, session.user.id);
  return NextResponse.json(invite, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can change roles" }, { status: 403 });
  }
  if (!user?.organizationId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const { memberId, role } = await request.json();
  await updateMemberRole(user.organizationId, memberId, role, session.user.id);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can remove members" }, { status: 403 });
  }
  if (!user?.organizationId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const { memberId } = await request.json();
  await removeMember(user.organizationId, memberId);
  return NextResponse.json({ success: true });
}
