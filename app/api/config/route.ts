// app/api/config/route.ts — read the analyst config from Vercel Blob

import { getConfig } from "@/lib/config"

export async function GET() {
  try {
    const config = await getConfig()
    return Response.json(config)
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
