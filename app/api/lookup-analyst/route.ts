// app/api/lookup-analyst/route.ts — look up an Asana user by email

import { NextRequest } from "next/server"

const WORKSPACE_GID = "16282293647760"

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase()
  if (!email) {
    return Response.json({ error: "Email is required" }, { status: 400 })
  }

  const pat = process.env.ASANA_PAT
  if (!pat) {
    return Response.json({ error: "ASANA_PAT not configured" }, { status: 500 })
  }

  const headers = {
    Authorization: `Bearer ${pat}`,
    Accept: "application/json",
  }

  // Try direct email-as-identifier lookup first (Asana supports this)
  try {
    const res = await fetch(
      `https://app.asana.com/api/1.0/users/${encodeURIComponent(email)}?opt_fields=gid,name,email,photo`,
      { headers }
    )
    if (res.ok) {
      const json = await res.json()
      const user = json.data
      return Response.json({
        gid: user.gid,
        name: user.name,
        email: user.email,
        jobTitle: "",
        photoUrl: user.photo?.image_60x60 || "",
      })
    }
  } catch {
    // fall through to workspace search
  }

  // Fallback: search all workspace users
  try {
    const listRes = await fetch(
      `https://app.asana.com/api/1.0/users?workspace=${WORKSPACE_GID}&opt_fields=gid,name,email,photo`,
      { headers }
    )
    if (!listRes.ok) {
      return Response.json(
        { error: "Could not search Asana users" },
        { status: 404 }
      )
    }
    const listJson = await listRes.json()
    const users: any[] = listJson.data || []
    const match = users.find(
      (u: any) => u.email?.toLowerCase() === email
    )
    if (!match) {
      return Response.json(
        { error: "No Asana user found with that email" },
        { status: 404 }
      )
    }
    return Response.json({
      gid: match.gid,
      name: match.name,
      email: match.email,
      jobTitle: "",
      photoUrl: match.photo?.image_60x60 || "",
    })
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
