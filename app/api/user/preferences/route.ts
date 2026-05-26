import { NextResponse } from "next/server";
import { getUserPreferences, updateUserPreferences } from "@/lib/services/audit-service";
import { z } from "zod";

const preferencesSchema = z.object({
  currency: z.string().optional(),
  teamSize: z.number().optional(),
});

export async function GET() {
  const prefs = await getUserPreferences("");
  return NextResponse.json(prefs);
}

export async function PUT(request: Request) {
  const body = await request.json();
  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await updateUserPreferences("", parsed.data);
  return NextResponse.json(updated);
}
