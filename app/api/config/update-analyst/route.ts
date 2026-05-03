// app/api/config/update-analyst/route.ts — update pod, status, or clients for an analyst

import { NextRequest } from "next/server"
import { updateAnalyst, type AnalystPod, type AnalystStatus } from "@/lib/config"

const VALID_PODS: AnalystPod[] = ["pod-2", "pod-3", "shared"]
const VALID_STATUSES: AnalystStatus[] = ["active", "ramping", "on-leave", "offboarded"]

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { gid, pod, status, clients } = body

    if (!gid) {
      return Response.json({ error: "gid is required" }, { status: 400 })
    }
    if (pod !== undefined && !VALID_PODS.includes(pod)) {
      return Response.json(
        { error: `pod must be one of: ${VALID_PODS.join(", ")}` },
        { status: 400 }
      )
    }
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return Response.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      )
    }

    const updates: Record<string, any> = {}
    if (pod !== undefined) updates.pod = pod
    if (status !== undefined) updates.status = status
    if (clients !== undefined) updates.clients = clients

    const updated = await updateAnalyst(gid, updates)
    return Response.json({ success: true, config: updated })
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
