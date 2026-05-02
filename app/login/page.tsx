"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        router.push("/")
        router.refresh()
      } else {
        const json = await res.json().catch(() => ({}))
        setError(json.error || "Sign in failed")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-xs">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-foreground">InAFlow</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Analyst Workload Dashboard
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="bg-card border border-border rounded-xl p-6 space-y-4"
        >
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full h-9 px-3 text-sm bg-muted/50 border border-border rounded-md placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-xs text-[#E24B4A]">{error}</p>}
          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full h-9 bg-foreground text-background text-sm font-medium rounded-md hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}
