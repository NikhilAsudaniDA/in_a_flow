import { getConfig } from "@/lib/config"

export async function GET() {
  try {
    const config = await getConfig()
    return Response.json({ workspaces: config.workspaces })
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
