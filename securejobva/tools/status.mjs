/* Is everything actually running?

   One command that answers it end to end: the repos, the build, the live site,
   and which migrations have really landed in the database. Nothing here writes
   a row — every insert probe deliberately violates a constraint or names a
   column that does not exist, so it fails before anything is stored.

   Run: node tools/status.mjs

   Exit status is 1 if something is wrong, so it can be scheduled. */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const B = "https://hmgravlkatfmerzbozct.supabase.co/rest/v1";
const KEY = (readFileSync("index.html", "utf8").match(/"apikey":\s*"([^"]+)"/) || [])[1];
const SITE = (readFileSync("build.mjs", "utf8").match(/const SITE = "([^"]+)"/) || [])[1];

const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", Prefer: "return=minimal" };
const bad = [];
const soft = [];

const pad = (s, n) => String(s).padEnd(n);
function line(state, what, note) {
  const mark = state === "ok" ? "ok  " : state === "warn" ? "warn" : "FAIL";
  console.log("  " + mark + "  " + pad(what, 42) + (note || ""));
  if (state === "fail") bad.push(what);
  if (state === "warn") soft.push(what);
}
function head(t) { console.log("\n" + t + "\n"); }

/* Exists but locked (401/403), missing (404), or readable — which is a breach. */
async function table(name) {
  try {
    const r = await fetch(B + "/" + name + "?select=*&limit=1", { headers: H });
    if (r.ok) return "readable";
    if (r.status === 404) return "missing";
    return "locked";
  } catch { return "unreachable"; }
}
async function fn(name, body) {
  try {
    const r = await fetch(B + "/rpc/" + name, { method: "POST", headers: H, body: JSON.stringify(body || {}) });
    if (r.status === 404) return "missing";
    if (r.ok) return "callable";
    return "locked";
  } catch { return "unreachable"; }
}
/* A column that exists reaches a constraint; one that does not gives PGRST204. */
async function column(tbl, col, filler) {
  try {
    const payload = {}; payload[col] = filler;
    payload.name = "x".repeat(250);          /* guarantees the length constraint fires */
    const r = await fetch(B + "/" + tbl, { method: "POST", headers: H, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (j.code === "PGRST204") return "missing";
    if (j.code === "23514" || j.code === "22P02") return "present";
    if (j.code === "42501") return "no access";
    return "unclear";
  } catch { return "unreachable"; }
}

/* ── the repos ───────────────────────────────────────────────────────────── */

head("repos");
try {
  execFileSync("git", ["fetch", "--all", "--quiet"], { stdio: "pipe" });
  const local = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
  const remotes = execFileSync("git", ["remote"]).toString().trim().split(/\s+/).filter(Boolean);
  let synced = true;
  for (const r of remotes) {
    let tip = "?";
    try { tip = execFileSync("git", ["rev-parse", "--short", r + "/main"]).toString().trim(); } catch {}
    const counts = execFileSync("git", ["rev-list", "--left-right", "--count", r + "/main...HEAD"]).toString().trim().split(/\s+/);
    const behind = Number(counts[0]), ahead = Number(counts[1]);
    if (behind || ahead) synced = false;
    line(behind ? "warn" : ahead ? "warn" : "ok", r + " " + tip,
      behind ? behind + " commit(s) to pull" : ahead ? ahead + " commit(s) to push" : "in sync with local " + local);
  }
  const dirty = execFileSync("git", ["status", "--porcelain", "."]).toString().trim();
  line(dirty ? "warn" : "ok", "working tree", dirty ? dirty.split("\n").length + " uncommitted file(s)" : "clean");
  if (synced && !dirty) { /* nothing */ }
} catch (e) {
  line("warn", "git", "could not read: " + e.message.split("\n")[0]);
}

/* ── the build ───────────────────────────────────────────────────────────── */

head("build");
try {
  execFileSync(process.execPath, ["build.mjs"], { stdio: "pipe" });
  line("ok", "build.mjs", "dist/ written");
} catch { line("fail", "build.mjs", "failed — run it directly"); }
try {
  const out = execFileSync(process.execPath, ["tools/check.mjs"], { stdio: "pipe" }).toString();
  const m = out.match(/(\d+) checks, (\d+) failed/);
  line("ok", "tools/check.mjs", m ? m[1] + " checks, 0 failed" : "passed");
} catch (e) {
  const out = (e.stdout || "").toString();
  const m = out.match(/(\d+) checks, (\d+) failed/);
  line("fail", "tools/check.mjs", m ? m[2] + " of " + m[1] + " failed — run it directly" : "failed");
}

/* ── the live site ───────────────────────────────────────────────────────── */

head("live site");
for (const [path, want] of [["/", 200], ["/careers", 200], ["/status", 200], ["/admin", 200],
                            ["/careers.html", 308], ["/apply", 308], ["/nope-" + Math.floor(1e9 * 0.5), 404]]) {
  try {
    const r = await fetch(SITE + path, { redirect: "manual" });
    line(r.status === want ? "ok" : "fail", "GET " + path, r.status + (r.status === want ? "" : " (wanted " + want + ")"));
  } catch (e) { line("fail", "GET " + path, "unreachable"); }
}
try {
  const r = await fetch(SITE + "/", { redirect: "manual" });
  const need = ["strict-transport-security", "x-content-type-options", "x-frame-options",
                "referrer-policy", "permissions-policy"];
  const got = need.filter((h) => r.headers.get(h));
  line(got.length === need.length ? "ok" : "warn", "security headers", got.length + "/" + need.length);
} catch {}

/* Is what is deployed what is committed? */
try {
  const live = await (await fetch(SITE + "/?cb=" + Math.floor(1e9 * 0.7))).text();
  const local = readFileSync("dist/index.html", "utf8");
  const marker = "Math.round(h * CFG.rate)";
  line(live.includes(marker) ? "ok" : "fail", "deployed build is current",
    live.includes(marker) ? "the weekly fix is live" : "production is behind — deploy");
  line(Math.abs(live.length - local.length) < live.length * 0.05 ? "ok" : "warn",
    "deployed size matches local", live.length + " vs " + local.length + " bytes");
} catch { line("warn", "deployed build", "could not compare"); }

/* ── the migrations ──────────────────────────────────────────────────────── */

head("migrations — what has actually landed");

const checks = [
  ["001 forms",           () => table("seat_requests"),        ["locked"]],
  ["002 tracks",          () => column("applications", "tracks", ["x"]), ["present"]],
  ["003 portal",          () => table("admins"),               ["locked"]],
  ["003 is_admin()",      () => fn("is_admin"),                ["locked"]],
  ["004 roles",           () => table("user_roles"),           ["locked"]],
  ["004 socials",         () => table("application_socials"),  ["locked"]],
  ["004 social_tokens",   () => table("social_tokens"),        ["locked"]],
  ["005 tracking",        () => table("application_tracking"), ["locked"]],
  ["005 queue view",      () => table("application_queue"),    ["locked"]],
  ["007 set_role()",      () => fn("set_role", { target_email: "x@y.z", role_key: "admin", grant_it: false }), ["locked"]],
  ["009 account types",   () => fn("my_account_requests"),     ["locked"]],
  ["010 contact",         () => table("contact_messages"),     ["locked"]]
];

for (const [what, run, good] of checks) {
  const got = await run();
  if (got === "readable") line("fail", what, "READABLE BY ANON — breach");
  else if (good.includes(got)) line("ok", what, got === "locked" ? "present, anon denied" : got);
  else if (got === "missing") line("fail", what, "not run yet");
  else line("warn", what, got);
}

/* ── the public paths that must keep working ─────────────────────────────── */

head("the forms still accept work");
for (const [what, tbl, payload, wanted] of [
  ["seat request", "seat_requests", { hours: 999 }, "23514"],
  ["application",  "applications",  { name: "x".repeat(250) }, "23514"]
]) {
  try {
    const r = await fetch(B + "/" + tbl, { method: "POST", headers: H, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    line(j.code === wanted ? "ok" : "fail", what,
      j.code === wanted ? "reaches the constraint — inserts work, nothing written" : "unexpected " + (j.code || r.status));
  } catch { line("fail", what, "unreachable"); }
}

/* ── what cannot be checked from here ────────────────────────────────────── */

head("needs a signed-in session");
console.log("  These are invisible to the public key by design, so open the pages:");
console.log("");
console.log("    " + SITE + "/status   an applicant sees their own row, and nothing else");
console.log("    " + SITE + "/admin    the queue, the stages, the role manager");
console.log("");
console.log("  A page that loads but shows nothing means sign-in worked and no role");
console.log("  was granted — that is step 9, not a broken login.");

/* ── verdict ─────────────────────────────────────────────────────────────── */

console.log("");
if (bad.length) {
  console.log("FAILED: " + bad.join(", "));
  if (soft.length) console.log("also worth a look: " + soft.join(", "));
  console.log("");
  process.exit(1);
}
if (soft.length) {
  console.log("Running, with " + soft.length + " thing(s) worth a look: " + soft.join(", "));
  console.log("");
  process.exit(0);
}
console.log("Everything checked is running. No rows were written.");
console.log("");
