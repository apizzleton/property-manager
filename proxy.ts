import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const tenantBlockedPrefixes = [
  "/properties",
  "/tenants",
  "/leases",
  "/accounting",
  "/reports",
  "/maintenance",
  "/documents",
];

export function proxy(request: NextRequest) {
  const role = request.cookies.get("dev_role")?.value;
  const pathname = request.nextUrl.pathname;

  // Only apply tenant page restrictions in development role-switch mode.
  if (role !== "tenant") {
    return NextResponse.next();
  }

  // Block exact routes and nested subpaths, but avoid partial-prefix false matches
  // like "/maintenance-suite" accidentally matching "/maintenance".
  const isBlockedRoute = tenantBlockedPrefixes.some((prefix) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ));
  if (!isBlockedRoute) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("denied", "tenant");
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api (API routes should use route-level auth/scoping)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
