import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt } from "@/lib/auth/session";

const protectedRoutePrefixes = ["/dashboard"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const sessionCookie = request.cookies.get("session")?.value;
  const session = await decrypt(sessionCookie);

  const isProtected = protectedRoutePrefixes.some(
    (p) => path === p || path.startsWith(`${p}/`)
  );
  const isAuthPage = path === "/login" || path === "/signup";

  if (isProtected && !session?.userId) {
    const loginUrl = new URL("/login", request.nextUrl);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && session?.userId) {
    const dashboardUrl = new URL("/dashboard", request.nextUrl);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/signup",
  ],
};
