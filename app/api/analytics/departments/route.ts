import { NextResponse } from "next/server";
import { getDepartmentAnalytics } from "@/lib/services/analytics-service";

export async function GET() {
  const data = await getDepartmentAnalytics("");
  return NextResponse.json(data);
}
