// app/api/config/add-analyst/route.ts — add a new analyst to the config

import { NextRequest } from "next/server"
import { addAnalyst, type AnalystConfig, type AnalystPod, type AnalystStatus } from "@/lib/config"

const VALID_PODS: AnalystPod[] = ["pod-2", "pod-3", "shared"]
const VALID_STATUSES: AnalystStatus[] = ["active", "ramping", "on-leave", "offboarded"]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.gid || !body.name || !body.pod) {
      return Response.json(
        { error: "gid, name, and pod are required" },
        { status: 400 }
      )
    }
    if (!VALID_PODS.includes(body.pod)) {
      return Response.json(
        { error: `pod must be one of: ${VALID_PODS.join(", ")}` },
        { status: 400 }
      )
    }

    const analyst: AnalystConfig = {
      gid: body.gid,
      name: body.name,
      email: body.email || "",
      jobTitle: body.jobTitle || "",
      photoUrl: body.photoUrl || "",
      pod: body.pod as AnalystPod,
      status: (VALID_STATUSES.includes(body.status) ? body.status : "active") as AnalystStatus,
      clients: Array.isArray(body.clients) ? body.clients : [],
    }

    const updated = await addAnalyst(analyst)
    return Response.json({ success: true, config: updated })
  } catch (error: any) {
    const status = error.message?.includes("already exists") ? 409 : 500
    return Response.json({ error: error.message }, { status })
  }
}
