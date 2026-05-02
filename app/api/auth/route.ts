// app/api/auth/route.ts — InAFlow login + logout
// POST: validate password, set session cookie
// DELETE: clear session cookie

import { cookies } from "next/headers"
import { NextRequest } from "next/server"

async function createToken(secret: string): Promise<string> {
  const payload = `inaflow:${Date.now()}`
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload))
  const sigHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `${payload}.${sigHex}`
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const password: string = body?.password ?? ""

  const expected = process.env.INAFLOW_PASSWORD
  const secret = process.env.SESSION_SECRET

  if (!expected || !secret) {
    return Response.json({ error: "Server not configured" }, { status: 500 })
  }

  // Constant-length comparison to mitigate timing attacks
  const passBuf = Buffer.from(password.padEnd(64).slice(0, 64))
  const expectedBuf = Buffer.from(expected.padEnd(64).slice(0, 64))
  const match =
    password.length === expected.length &&
    passBuf.every((b, i) => b === expectedBuf[i])

  if (!match) {
    return Response.json({ error: "Incorrect password" }, { status: 401 })
  }

  const token = await createToken(secret)
  const cookieStore = await cookies()
  cookieStore.set("inaflow-session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  })

  return Response.json({ success: true })
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete("inaflow-session")
  return Response.json({ success: true })
}
