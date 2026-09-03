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
  ["010 contact",         () => table("contact_messages"),     ["locked"]],
  ["026 leave",           () => table("leave_requests"),       ["locked"]],
  ["026 notices",         () => table("notices"),              ["locked"]],
  ["030 timesheets",      () => table("timesheets"),           ["locked"]],
  ["030 timesheet days",  () => table("timesheet_days"),       ["locked"]],
  ["032 clients",         () => table("clients"),              ["locked"]],
  ["032 placements",      () => table("placements"),           ["locked"]],
  ["032 billing rate",    () => table("placement_billing"),    ["locked"]],
  ["032 pay rate",        () => table("placement_pay"),        ["locked"]],
  ["032 swap requests",   () => table("swap_requests"),        ["locked"]],
  /* Not a column probe. placement_id is granted to nobody by design, and
     PostgREST hides columns the asking role holds no privilege on — so probing
     it reports "not run yet" forever, however well the migration ran. The
     function 033 adds is the honest signal: present and refusing anon. */
  ["033 week to client",  () => fn("timesheet_is_clients", { ts: "00000000-0000-0000-0000-000000000000" }), ["locked"]],
  /* 039 splits the client in two. The new table is the honest signal that it
     ran: before it, client_private does not exist at all. */
  ["039 client details",  () => table("client_private"),        ["locked"]],
  /* 041 can be probed and 040 cannot: this one makes a table, where 040 only
     adds a trigger function PostgREST will not expose. A probe for 040 would
     report "present" whether or not it had run, which is the shape 034 already
     refuses. Its verification block is the honest test there. */
  ["041 assistant name",  () => table("application_public"),    ["locked"]]
  /* 034 has no probe, deliberately. It adds one column, trial_week, granted to
     nobody — so the public key cannot see it, exactly as with placement_id.
     Probing the timesheets table instead would report "present" whether or not
     034 had run, which is a check that cannot fail pretending to be one that
     can. Its verification query at the bottom of the file is the honest test. */
];

for (const [what, run, good] of checks) {
  const got = await run();
  if (got === "readable") line("fail", what, "READABLE BY ANON — breach");
  else if (good.includes(got)) line("ok", what, got === "locked" ? "present, anon denied" : got);
  else if (got === "missing") line("fail", what, "not run yet");
  else line("warn", what, got);
}

/* ── the same question, asked of the database instead of guessed ─────────── */
//
// The probes above can only see what PostgREST exposes to the publishable key,
// so a migration adding a trigger function or a column granted to nobody is
// invisible to them however well it ran — 034, 040 and 043 all are, and each
// said so rather than faking a probe. 044 gave every migration a place to
// record its own number, so this reads the answer instead of inferring it.
//
// A file with no row is reported by which side of 044 it falls on, because the
// two silences mean opposite things: after 044 a missing stamp means the file
// did not run, before it means only that 044 had no detector for that shape.

head("migrations — what the database says");

const onDisk = readdirSync("sql")
  .filter((f) => /^\d+.*\.sql$/.test(f) && !f.endsWith(".local.sql"))
  .map((f) => ({ n: Number(f.match(/^(\d+)/)[1]), file: f }))
  .sort((a, b) => a.n - b.n);

try {
  const r = await fetch(B + "/schema_migrations?select=n", { headers: H });
  if (r.status === 404) {
    line("warn", "schema_migrations", "044 has not been pasted yet — paste sql/044-what-has-landed.sql");
  } else if (!r.ok) {
    line("fail", "schema_migrations", "exists but the public key cannot read n (" + r.status + ")");
  } else {
    const landed = new Set((await r.json()).map((row) => row.n));
    const after = onDisk.filter((m) => m.n >= 44);
    const before = onDisk.filter((m) => m.n < 44);

    const missing = after.filter((m) => !landed.has(m.n));
    line(missing.length ? "fail" : "ok", "since 044, all stamped",
      missing.length ? missing.map((m) => m.file).join(", ") + " — not run yet"
                     : after.length + " of " + after.length + " landed");

    const quiet = before.filter((m) => !landed.has(m.n));
    line("ok", "001–043, detected by 044",
      (before.length - quiet.length) + " of " + before.length + " confirmed");
    if (quiet.length) {
      line("ok", "  no detector, so no signal",
        quiet.map((m) => String(m.n).padStart(3, "0")).join(" ") +
        " — grants, policies and constraints leave no artifact to find");
    }
  }
} catch { line("warn", "schema_migrations", "unreachable"); }

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

/* ── where an emailed link actually lands ────────────────────────────────
 *
 * Every link this product mails carries a redirect_to saying which page to
 * come back to: the reset link, the sign-up confirmation, the resend, the
 * client invite in api/invite.js, and the Google sign-in itself. GoTrue
 * accepts none of them unless the URL is on the project's Redirect URLs
 * allow-list, and silently substitutes the Site URL when it is not.
 *
 * Silently is the problem. Nothing errors. The mail arrives, the link works,
 * and it drops somebody on the home page — which has nothing that reads an
 * auth fragment, so the token sits in the address bar and the password is
 * never set. It looks exactly like an email that did not arrive, and it has
 * now cost this project the same afternoon twice.
 *
 * It is dashboard configuration rather than code, so no amount of reading
 * this repo can catch it. Asking is the only way. generate_link returns the
 * link WITHOUT sending anything, so this costs nobody an email.
 *
 * Needs the service role key, which lives in .env.local and is not in CI —
 * skipped with a note rather than failed when it is not there. */
/* Whose recovery token to spend, given every account and the clock.

   Oldest first, and an account that has never had one is oldest of all —
   there is no live link to break. That ordering is the safety property, not
   a tidiness one: whoever has just asked for a reset carries the newest
   timestamp, which makes them the last address this will ever pick.

   When even the oldest is inside the window, every link in existence is live
   and there is nothing safe to spend, so it declines. Pure, and separate from
   the fetch, because that declining branch is the one that will never happen
   on the machine where it is written. */
export function chooseProbe(users, now, windowMs) {
  const cand = (users || [])
    .filter((x) => x && x.email)
    .map((x) => ({
      email: x.email,
      at: x.recovery_sent_at ? new Date(x.recovery_sent_at).getTime() : 0
    }))
    .sort((a, b) => a.at - b.at)[0];
  if (!cand) return { email: null, held: null };
  if (cand.at && now - cand.at < windowMs) return { email: null, held: cand.email };
  return { email: cand.email, held: null };
}

head("where an emailed link lands");

const envFile = ".env.local";
let SERVICE = null;
if (existsSync(envFile)) {
  const m = readFileSync(envFile, "utf8").match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m);
  if (m) SERVICE = m[1].trim().replace(/^"|"$/g, "");
}

if (!SERVICE) {
  line("warn", "redirect targets", "no service role key here — run this where .env.local is");
} else {
  const AUTH = B.replace(/\/rest\/v1$/, "") + "/auth/v1";
  const H2 = { apikey: SERVICE, Authorization: "Bearer " + SERVICE, "Content-Type": "application/json" };

  /* A recovery link can only be generated for an account that exists, so the
     probe borrows a real one rather than inventing an address. Inventing one
     fails for "no such user" and reads identically to a rejected redirect —
     a check that cannot tell those apart would cry wolf forever.

     Borrowing is not free. A recovery token is single use and issuing one
     invalidates the token before it, so every run of this quietly killed the
     reset link sitting in somebody's inbox. It took the first account in the
     list every time — always the same person — and that person then clicked a
     brand new email and was told it had expired. The check meant to prove
     password reset works was breaking password reset.

     So: the account whose recovery link is oldest, nulls first, and never one
     that has had a link issued in the last hour, because that link is live in
     a mailbox right now. It rotates rather than picking on one address, and
     when the only candidates are recent it declines and says so, which is a
     check skipping itself rather than doing damage to run.

     No email is sent by any of this — generate_link only mints the link. The
     harm was never a message; it was the token underneath one. */
  const LIVE_LINK_MS = 60 * 60 * 1000;
  let probe = null, probeHeld = null;
  try {
    const u = await (await fetch(AUTH + "/admin/users?per_page=100", { headers: H2 })).json();
    const pick = chooseProbe(u.users || [], Date.now(), LIVE_LINK_MS);
    probe = pick.email;
    probeHeld = pick.held;
  } catch { /* handled below */ }

  /* redirect_to goes at the top level of the body. Nested under `options` —
     where supabase-js puts it, which is why it was written that way — GoTrue
     never reads it, quietly falls back to the Site URL, and every target comes
     back substituted. That reports "0 of 4 allowed" against a perfectly good
     allow-list, and did for two days across two handovers, each time sending
     somebody into the dashboard to fix a setting that was already right.

     The tell was in the output the whole time: the only target it ever called
     allowed was the bare Site URL, because the Site URL is what the fallback
     is. Every reading agreed with every other because none of them were
     measurements. */
  const ask = async (target) => {
    const r = await fetch(AUTH + "/admin/generate_link", {
      method: "POST",
      headers: H2,
      body: JSON.stringify({ type: "recovery", email: probe, redirect_to: target })
    });
    const j = await r.json();
    if (!j.action_link) throw new Error(j.msg || j.message || ("HTTP " + r.status));
    return new URL(j.action_link).searchParams.get("redirect_to");
  };

  /* A probe that cannot fail is not proving anything. This target must be
     refused: it is not this site. If it comes back untouched then either the
     allow-list admits the whole internet or the request has stopped reaching
     the field again — and in both cases every answer below is worthless, so
     say that instead of reporting a number nobody can trust. */
  const CONTROL = "https://not-securejobva.example.invalid/status";

  /* Every page a link is ever sent to. /seats is the one api/invite.js uses. */
  const WANTED = ["/status", "/seats", "/hub", "/pay"];
  let asked = 0, kept = 0, sub = null, why = null, blind = false;
  if (probe) {
    try { blind = (await ask(CONTROL)) === CONTROL; }
    catch (e) { why = e.message; }
  }
  for (const path of (probe && !blind) ? WANTED : []) {
    const want = SITE + path;
    try {
      const got = await ask(want);
      asked++;
      if (got === want) kept++; else sub = got;
    } catch (e) { why = e.message; }
  }
  if (probeHeld) {
    line("warn", "redirect targets", "not asked — every account has had a reset link " +
      "issued within the hour, and asking would invalidate one that is live in a mailbox. " +
      "Run again later, or after that link has been used.");
  } else if (!probe) {
    line("warn", "redirect targets", "no account to probe with");
  } else if (blind) {
    line("fail", "the redirect probe proved nothing",
      "a target that is not even this site came back allowed — either the list admits " +
      "anything, or redirect_to is not reaching GoTrue again. Fix the probe before " +
      "trusting anything it says about the list.");
  } else if (!asked) {
    line("warn", "redirect targets", "could not ask the auth server" + (why ? " — " + why : ""));
  } else if (kept === WANTED.length) {
    line("ok", "every emailed link lands where it says",
      asked + " of " + asked + " paths allowed — asked with " + probe +
      ", whose reset link (if any) is now void");
  } else {
    line("fail", "emailed links land on the wrong page",
      kept + " of " + asked + " allowed — the rest become " + sub +
      ". Add " + SITE + "/** to Authentication → URL Configuration → Redirect URLs");
  }
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
