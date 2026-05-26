import { NextResponse } from "next/server";
import { createDepartment, getDepartments } from "@/lib/services/organization-service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }
  const departments = await getDepartments(orgId);
  return NextResponse.json(departments);
}

export async function POST(request: Request) {
  const { orgId, name } = await request.json();
  if (!orgId || !name) {
    return NextResponse.json({ error: "orgId and name required" }, { status: 400 });
  }
  const dept = await createDepartment(orgId, name);
  return NextResponse.json(dept, { status: 201 });
}
