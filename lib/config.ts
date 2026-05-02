// lib/config.ts — InAFlow analyst config storage (Vercel Blob)
// inaflow-config.json stores the analyst roster; everything else stays hardcoded.

import { put, list } from "@vercel/blob"

export type AnalystPod = "pod-2" | "pod-3" | "shared"
export type AnalystStatus = "active" | "ramping" | "on-leave" | "offboarded"

export interface AnalystConfig {
  gid: string
  name: string
  email: string
  jobTitle: string
  photoUrl: string
  pod: AnalystPod
  status: AnalystStatus
  clients: string[]
}

export interface InAFlowConfig {
  analysts: AnalystConfig[]
  updatedAt: string
}

const SEED_CONFIG: InAFlowConfig = {
  analysts: [
    {
      gid: "1207090544588174",
      name: "Nikhil Asudani",
      email: "nikhil.asudani@acadia.io",
      jobTitle: "Analyst",
      photoUrl: "",
      pod: "pod-3",
      status: "active",
      clients: [],
    },
    {
      gid: "1209071959445400",
      name: "Jinay Keniya",
      email: "",
      jobTitle: "Analyst",
      photoUrl: "",
      pod: "pod-3",
      status: "active",
      clients: [],
    },
  ],
  updatedAt: new Date().toISOString(),
}

export async function getConfig(): Promise<InAFlowConfig> {
  try {
    const { blobs } = await list({ prefix: "inaflow-config" })
    if (blobs.length === 0) {
      await saveConfig({ ...SEED_CONFIG, updatedAt: new Date().toISOString() })
      return { ...SEED_CONFIG }
    }
    const res = await fetch(blobs[0].url, { cache: "no-store" })
    return (await res.json()) as InAFlowConfig
  } catch {
    return { ...SEED_CONFIG }
  }
}

export async function saveConfig(config: InAFlowConfig): Promise<void> {
  config.updatedAt = new Date().toISOString()
  await put("inaflow-config.json", JSON.stringify(config), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  })
}

export async function addAnalyst(analyst: AnalystConfig): Promise<InAFlowConfig> {
  const config = await getConfig()
  if (config.analysts.some((a) => a.gid === analyst.gid)) {
    throw new Error("Analyst already exists")
  }
  config.analysts.push(analyst)
  await saveConfig(config)
  return config
}

export async function updateAnalyst(
  gid: string,
  updates: Partial<AnalystConfig>
): Promise<InAFlowConfig> {
  const config = await getConfig()
  const idx = config.analysts.findIndex((a) => a.gid === gid)
  if (idx === -1) throw new Error(`Analyst ${gid} not found`)
  config.analysts[idx] = { ...config.analysts[idx], ...updates }
  await saveConfig(config)
  return config
}

export async function removeAnalyst(gid: string): Promise<InAFlowConfig> {
  return updateAnalyst(gid, { status: "offboarded" })
}
