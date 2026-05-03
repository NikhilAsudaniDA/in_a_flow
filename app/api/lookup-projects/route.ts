import { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  const workspaceGid = request.nextUrl.searchParams.get("workspaceGid")?.trim()
  if (!workspaceGid) return Response.json({ error: "workspaceGid is required" }, { status: 400 })

  const pat = process.env.ASANA_PAT?.trim()
  if (!pat) return Response.json({ error: "ASANA_PAT not configured" }, { status: 500 })

  try {
    const projects: { gid: string; name: string }[] = []
    let url: string | null = `https://app.asana.com/api/1.0/projects?workspace=${workspaceGid}&limit=100&opt_fields=gid,name`
    while (url) {
      const res: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${pat}`, Accept: "application/json" },
      })
      const json: any = await res.json()
      if (!res.ok) return Response.json({ error: json.errors?.[0]?.message || "Asana error", detail: json }, { status: 502 })
      projects.push(...(json.data || []).map((p: any) => ({ gid: p.gid, name: p.name })))
      url = json.next_page?.uri ?? null
    }

    return Response.json({ projects: projects.sort((a, b) => a.name.localeCompare(b.name)) })
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
