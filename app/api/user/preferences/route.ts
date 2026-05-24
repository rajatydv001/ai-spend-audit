import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserPreferences, updateUserPreferences } from "@/lib/services/audit-service";
import { z } from "zod";

const preferencesSchema = z.object({
  currency: z.string().optional(),
  teamSize: z.number().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prefs = await getUserPreferences(session.user.id);
  return NextResponse.json(prefs);
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await updateUserPreferences(session.user.id, parsed.data);
  return NextResponse.json(updated);
}
