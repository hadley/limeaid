import { NextRequest, NextResponse } from "next/server";

// Shared-password gate. If APP_PASSWORD is unset, auth is disabled.
export function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (
    pathname === "/login" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.[a-z0-9]+$/i.test(pathname) // static files (recipe images, etc.)
  ) {
    return NextResponse.next();
  }

  if (req.cookies.get("mealime_auth")?.value === password) {
    return NextResponse.next();
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next).*)"],
};
