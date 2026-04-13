import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionCookieSignature,
} from "@/lib/auth";
import { countAdmins } from "@/lib/db/users";
import { listWorkspaces } from "@/lib/db/workspaces";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/health"];
const SETUP_PATHS = ["/setup", "/api/setup/"];
const MCP_PATHS = ["/api/mcp", "/llm.txt"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isSetupPath(pathname: string): boolean {
  return SETUP_PATHS.some((p) => pathname === p || pathname.startsWith(p));
}

function isMcpPath(pathname: string): boolean {
  return MCP_PATHS.some((p) => pathname === p || pathname.startsWith(p));
}

function isStaticPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg")
  );
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets — always pass through
  if (isStaticPath(pathname)) {
    return NextResponse.next();
  }

  // Setup check: if setup is not complete (no admin OR no workspaces),
  // allow setup paths and redirect everything else to /setup
  const needsSetup = countAdmins() === 0 || listWorkspaces().length === 0;

  if (needsSetup) {
    if (isSetupPath(pathname) || isPublicPath(pathname)) {
      return NextResponse.next();
    }
    const setupUrl = new URL("/setup", request.nextUrl.origin);
    return NextResponse.redirect(setupUrl);
  }

  // From here on, setup is complete — normal auth flow

  // Setup paths — redirect away if setup is complete
  if (isSetupPath(pathname)) {
    return NextResponse.redirect(new URL("/", request.nextUrl.origin));
  }

  // MCP paths — check MCP_API_KEY if configured
  if (isMcpPath(pathname)) {
    const apiKey = process.env.MCP_API_KEY;
    if (apiKey) {
      const auth = request.headers.get("authorization");
      if (auth !== `Bearer ${apiKey}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
    return NextResponse.next();
  }

  // Public auth paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // All other paths require authentication
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!sessionCookie?.value || !verifySessionCookieSignature(sessionCookie.value)) {
    const isApiRoute = pathname.startsWith("/api/");
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
