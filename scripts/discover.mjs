// discover.mjs
const PAT = process.env.ASANA_PAT;
if (!PAT) { console.error("Set ASANA_PAT env var"); process.exit(1); }

const headers = { "Authorization": `Bearer ${PAT}`, "Accept": "application/json" };
const api = async (path) => {
  const res = await fetch(`https://app.asana.com/api/1.0${path}`, { headers });
  const data = await res.json();
  if (data.errors) { console.error(`ERROR on ${path}:`, data.errors); return null; }
  return data.data;
};

(async () => {
  // 1. Workspace
  const workspaces = await api("/workspaces?limit=10");
  console.log("\n=== WORKSPACES ===");
  workspaces?.forEach(w => console.log(`  ${w.gid} | ${w.name}`));
  const wsGid = workspaces?.[0]?.gid;

  // 2. Projects — search for Pod 3
  console.log("\n=== PROJECTS (matching 'Pod 3') ===");
  const projects = await api(`/workspaces/${wsGid}/projects?limit=100&opt_fields=name`);
  projects?.filter(p => p.name.toLowerCase().includes("pod 3") || p.name.toLowerCase().includes("pod3"))
    .forEach(p => console.log(`  ${p.gid} | ${p.name}`));

  // 3. Users — search for our 3 analysts
  console.log("\n=== USERS ===");
  const targetNames = ["nikhil", "jinay", "jai"];
  const users = await api(`/workspaces/${wsGid}/users?limit=100&opt_fields=name,email`);
  users?.filter(u => targetNames.some(t => u.name.toLowerCase().includes(t)))
    .forEach(u => console.log(`  ${u.gid} | ${u.name} | ${u.email || "no email"}`));

  // 4. Custom fields — find Effort Level
  console.log("\n=== CUSTOM FIELDS (matching 'effort') ===");
  const fields = await api(`/workspaces/${wsGid}/custom_fields?limit=100&opt_fields=name,enum_options,type`);
  fields?.filter(f => f.name.toLowerCase().includes("effort"))
    .forEach(f => {
      console.log(`  ${f.gid} | ${f.name} (${f.type})`);
      f.enum_options?.forEach(o => console.log(`    └─ ${o.gid} | ${o.name} | enabled: ${o.enabled}`));
    });

  console.log("\n=== DONE ===");
  console.log("Paste everything above back to Claude.");
})();