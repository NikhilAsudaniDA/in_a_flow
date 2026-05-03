// lib/config.ts — InAFlow config storage (Vercel Blob)
// inaflow-config.json stores the analyst roster and workspace configs.

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

export interface WorkspaceConfig {
  id: string
  name: string
  workspaceGid: string
  standUpProjectGid: string
  calendarProjectGid: string
  projectName?: string
  isDefault: boolean
}

export interface InAFlowConfig {
  analysts: AnalystConfig[]
  workspaces: WorkspaceConfig[]
  updatedAt: string
}

const DEFAULT_WORKSPACE: WorkspaceConfig = {
  id: "default",
  name: "Acadia",
  workspaceGid: "16282293647760",
  standUpProjectGid: "1204969864314028",
  calendarProjectGid: "1207246447954463",
  projectName: "Pod 3 Stand Up",
  isDefault: true,
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
  workspaces: [DEFAULT_WORKSPACE],
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
    const config = (await res.json()) as InAFlowConfig
    // Backfill workspaces for blobs written before this field existed
    if (!config.workspaces) {
      config.workspaces = [DEFAULT_WORKSPACE]
      await saveConfig(config)
    }
    // Backfill projectName on default workspace
    const def = config.workspaces.find(w => w.id === "default")
    if (def && !def.projectName) {
      def.projectName = "Pod 3 Stand Up"
      await saveConfig(config)
    }
    return config
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
  const existingIdx = config.analysts.findIndex((a) => a.gid === analyst.gid)
  if (existingIdx !== -1) {
    if (config.analysts[existingIdx].status === "offboarded") {
      // Replace the offboarded record with the fresh one
      config.analysts[existingIdx] = analyst
    } else {
      throw new Error("Analyst already exists")
    }
  } else {
    config.analysts.push(analyst)
  }
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
  const config = await getConfig()
  config.analysts = config.analysts.filter((a) => a.gid !== gid)
  await saveConfig(config)
  return config
}

export async function addWorkspace(workspace: WorkspaceConfig): Promise<InAFlowConfig> {
  const config = await getConfig()
  if (config.workspaces.some((w) => w.id === workspace.id)) {
    throw new Error("Workspace already exists")
  }
  // If this is the first workspace or marked default, clear other defaults
  if (workspace.isDefault || config.workspaces.length === 0) {
    config.workspaces.forEach((w) => (w.isDefault = false))
    workspace.isDefault = true
  }
  config.workspaces.push(workspace)
  await saveConfig(config)
  return config
}

export async function removeWorkspace(id: string): Promise<InAFlowConfig> {
  const config = await getConfig()
  const target = config.workspaces.find((w) => w.id === id)
  if (!target) throw new Error(`Workspace ${id} not found`)
  config.workspaces = config.workspaces.filter((w) => w.id !== id)
  // If we removed the default, promote the first remaining workspace
  if (target.isDefault && config.workspaces.length > 0) {
    config.workspaces[0].isDefault = true
  }
  await saveConfig(config)
  return config
}

export async function setDefaultWorkspace(id: string): Promise<InAFlowConfig> {
  const config = await getConfig()
  const idx = config.workspaces.findIndex((w) => w.id === id)
  if (idx === -1) throw new Error(`Workspace ${id} not found`)
  config.workspaces.forEach((w) => (w.isDefault = false))
  config.workspaces[idx].isDefault = true
  await saveConfig(config)
  return config
}
