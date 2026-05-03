import { NextRequest } from "next/server"
import { addWorkspace, type WorkspaceConfig } from "@/lib/config"
import { randomUUID } from "crypto"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, workspaceGid, standUpProjectGid, calendarProjectGid, projectName } = body

    if (!name || !workspaceGid || !standUpProjectGid || !calendarProjectGid) {
      return Response.json({ error: "name, workspaceGid, standUpProjectGid, and calendarProjectGid are required" }, { status: 400 })
    }

    const workspace: WorkspaceConfig = {
      id: randomUUID(),
      name,
      workspaceGid,
      standUpProjectGid,
      calendarProjectGid,
      projectName: projectName || undefined,
      isDefault: false,
    }

    const updated = await addWorkspace(workspace)
    return Response.json({ success: true, config: updated })
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
