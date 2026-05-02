// middleware.ts — InAFlow session auth gate (Edge Runtime)
// Protects all routes except /login, /api/auth, /api/sync.

import { NextRequest, NextResponse } from "next/server"

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/sync"]

async function verifySession(token: string, secret: string): Promise<boolean> {
  try {
    const dotIdx = token.lastIndexOf(".")
    if (dotIdx === -1) return false
    const payload = token.slice(0, dotIdx)
    const sigHex = token.slice(dotIdx + 1)

    // Check expiry (7 days)
    const parts = payload.split(":")
    const ts = parseInt(parts[1] || "0", 10)
    if (isNaN(ts) || Date.now() - ts > 7 * 24 * 60 * 60 * 1000) return false

    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    )
    const hexPairs = sigHex.match(/../g)
    if (!hexPairs) return false
    const sigBytes = new Uint8Array(hexPairs.map((h) => parseInt(h, 16)))
    return await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payload))
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  )

  const secret = process.env.SESSION_SECRET

  // If SESSION_SECRET is not set, skip auth (allows local dev without env vars)
  if (!secret) {
    return NextResponse.next()
  }

  const sessionToken = request.cookies.get("inaflow-session")?.value
  const isAuthenticated = sessionToken
    ? await verifySession(sessionToken, secret)
    : false

  // Redirect authenticated users away from /login
  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  if (!isPublic && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon|.*\\.png|.*\\.svg|.*\\.ico|.*\\.webp|.*\\.jpg|.*\\.jpeg).*)",
  ],
}
