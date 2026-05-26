import { NextResponse } from "next/server";
import { createOrganization, getOrganization } from "@/lib/services/organization-service";
import { DEFAULT_USER_ID } from "@/lib/defaults";

export async function POST(request: Request) {
  const { name } = await request.json();
  if (!name) {
    return NextResponse.json({ error: "Organization name required" }, { status: 400 });
  }

  const org = await createOrganization(name, DEFAULT_USER_ID);
  return NextResponse.json(org, { status: 201 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 });
  }
  const org = await getOrganization(orgId);
  return NextResponse.json(org);
}
