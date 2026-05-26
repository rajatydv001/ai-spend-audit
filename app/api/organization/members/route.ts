import { NextResponse } from "next/server";
import { inviteMember, updateMemberRole, removeMember } from "@/lib/services/organization-service";
import { DEFAULT_USER_ID } from "@/lib/defaults";

export async function POST(request: Request) {
  const { orgId, email, role } = await request.json();
  if (!orgId || !email) {
    return NextResponse.json({ error: "orgId and email required" }, { status: 400 });
  }
  const invite = await inviteMember(orgId, email, role, DEFAULT_USER_ID);
  return NextResponse.json(invite, { status: 201 });
}

export async function PATCH(request: Request) {
  const { orgId, memberId, role } = await request.json();
  if (!orgId || !memberId) {
    return NextResponse.json({ error: "orgId and memberId required" }, { status: 400 });
  }
  await updateMemberRole(orgId, memberId, role);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const { orgId, memberId } = await request.json();
  if (!orgId || !memberId) {
    return NextResponse.json({ error: "orgId and memberId required" }, { status: 400 });
  }
  await removeMember(orgId, memberId);
  return NextResponse.json({ success: true });
}
