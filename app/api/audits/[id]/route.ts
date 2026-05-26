import { NextResponse } from "next/server";
import { getAuditById, deleteAudit } from "@/lib/services/audit-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const audit = await getAuditById(id, "");
  if (!audit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(audit);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteAudit(id, "");
  return NextResponse.json({ success: true });
}
