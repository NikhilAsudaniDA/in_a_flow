import { NextRequest } from "next/server"
import { removeWorkspace } from "@/lib/config"

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json()
    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 })
    }
    const updated = await removeWorkspace(id)
    return Response.json({ success: true, config: updated })
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
