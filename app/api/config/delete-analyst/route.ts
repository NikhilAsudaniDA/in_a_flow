import { NextRequest } from "next/server"
import { removeAnalyst } from "@/lib/config"

export async function DELETE(request: NextRequest) {
  try {
    const { gid } = await request.json()
    if (!gid) {
      return Response.json({ error: "gid is required" }, { status: 400 })
    }
    const updated = await removeAnalyst(gid)
    return Response.json({ success: true, config: updated })
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
