import { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim().toLowerCase() || ""
  const pat = process.env.ASANA_PAT
  if (!pat) return Response.json({ error: "ASANA_PAT not configured" }, { status: 500 })

  try {
    const res = await fetch("https://app.asana.com/api/1.0/workspaces?limit=100", {
      headers: { Authorization: `Bearer ${pat}`, Accept: "application/json" },
    })
    const json = await res.json()
    if (!res.ok) return Response.json({ error: json.errors?.[0]?.message || "Asana error" }, { status: 502 })

    const workspaces: { gid: string; name: string }[] = json.data || []
    const filtered = name
      ? workspaces.filter((w) => w.name.toLowerCase().includes(name))
      : workspaces

    return Response.json({ workspaces: filtered.map((w) => ({ gid: w.gid, name: w.name })) })
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
