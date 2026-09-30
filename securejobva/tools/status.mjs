/* Is everything actually running?

   One command that answers it end to end: the repos, the build, the live site,
   and which migrations have really landed in the database.

   What it touches, said plainly, because this header used to say "nothing here
   writes a row" and was believed — by a checkup brief that listed this script
   as known safe — while it was minting password-recovery tokens on a real
   account five times a run:

     - git fetch --all, so the repo comparison is against the remotes as they
       are now rather than as they were the last time somebody fetched.
     - node build.mjs, which rewrites dist/ in this checkout.
     - the database, through the publishable key: reads, and insert probes that
       each violate a constraint or name a column that does not exist, so they
       fail before anything is stored. No row is written by those.
     - with the service role key from .env.local: reads of the paying half.
       Reads only.
     - ONLY with --auth-probe (and the service key): five calls to GoTrue's
       admin generate_link, type recovery, on one real account. No email is
       sent, but each call rewrites that account's recovery token in
       auth.users, so any reset link already in that person's inbox stops
       working. That is a write, on somebody else's row, to answer a question
       about dashboard configuration — so it is asked for by name, never done
       by default. The section below says how it picks the account.

   Run: node tools/status.mjs                  everything except the auth probe
        node tools/status.mjs --auth-probe     also check where emailed links land

   Exit status is 1 if something is wrong, so it can be scheduled. */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const AUTH_PROBE = process.argv.includes("--auth-probe");

const B = "https://hmgravlkatfmerzbozct.supabase.co/rest/v1";
const KEY = (readFileSync("index.html", "utf8").match(/"apikey":\s*"([^"]+)"/) || [])[1];
const SITE = (readFileSync("build.mjs", "utf8").match(/const SITE = "([^"]+)"/) || [])[1];

const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", Prefer: "return=minimal" };
const bad = [];
const soft = [];

const pad = (s, n) => String(s).padEnd(n);
/* "skip" is a check deliberately not run — not a failure, and not something
   worth a look either, so it is counted as neither. */
function line(state, what, note) {
  const mark = state === "ok" ? "ok  " : state === "warn" ? "warn" : state === "skip" ? "skip" : "FAIL";
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
/* Kept outside the block: the deployed-page comparison further down needs to
   know whether the pages it just built are the committed ones. */
let dirty = "";
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
  dirty = execFileSync("git", ["status", "--porcelain", "."]).toString().trim();
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
                            /* A literal, not Math.floor(1e9 * 0.5), which is the constant
                               500000000 and only looked random. Any path that does not
                               exist answers this question, and one that reads the same
                               every run is one you can diff against yesterday's output. */
                            ["/careers.html", 308], ["/apply", 308], ["/nope-no-such-page", 404]]) {
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

/* The verdict on its own, named and reading nothing but its arguments, so
   tools/test-deploy-verdict.mjs can drive all four of its answers. Only one of
   them can happen on any given day, and the one that matters most — production
   is behind — is the one you would otherwise never see until the day it was
   true and you needed it to be right. */
function deployVerdict(shipped, built, here, behind, seen) {
  /* A warn and not a fail. Production carries no stamp until the first deploy
     after build.mjs started writing one, and calling that a failure would cry
     wolf for a reason nobody can act on except by deploying. */
  if (!shipped) {
    return { state: "warn",
             note: "no build stamp on the live page — deploy once to start stamping" + seen };
  }
  if (shipped === here) {
    return { state: "ok", note: shipped + ", built " + built + seen };
  }
  return { state: "fail",
           note: "live is " + shipped + ", local is " + here +
                 (behind ? " — " + behind + " commit(s) behind" : " — not a commit this clone has") +
                 ", deploy" + seen };
}

/* Is what is deployed what is committed?
 *
 * This used to ask for "/?cb=" + Math.floor(1e9 * 0.7), which is not a cache
 * buster. It is the constant 700000000 — the same URL every run, written to
 * look like Math.random() and never checked because the answer came back right
 * anyway. It came in with this file on 26 August, the day of the nine-hour
 * invisible outage, in the tool written to make sure that did not happen twice.
 *
 * Removed rather than fixed, because a working cache buster is not available
 * here either: asked for this page with a random query string, with cache:
 * "no-store", with Cache-Control: no-cache and with Pragma, the edge answers
 * x-vercel-cache: HIT every time and at the same age. Vercel does not vary its
 * cache key on the query string, and nothing a client sends makes it refetch.
 * A constant that pretends to be random implies a protection that is not there
 * and cannot be, which is worse than no protection at all.
 *
 * What actually makes this check honest is that Vercel purges the edge on
 * deploy. So the age of the copy is the thing worth seeing: if this check ever
 * disagrees with what you just shipped, an age older than the deploy is the
 * reason, and it is now on screen rather than needing to be guessed at. */
try {
  const r = await fetch(SITE + "/");
  const live = await r.text();
  const local = readFileSync("dist/index.html", "utf8");
  const age = r.headers.get("age");
  const from = (r.headers.get("x-vercel-cache") || "").toLowerCase();
  const seen = age ? ", edge copy " + age + "s old" : from ? ", " + from : "";

  /* build.mjs stamps the commit into every page. This used to look for one
     hardcoded string instead — "Math.round(h * CFG.rate)", the shape of a fix
     that shipped in August — which answers whether THAT change is live and,
     once it is, answers yes forever. A build six months stale passed it as
     happily as one from this morning. The stamp changes every build, so it
     answers the question the line has always claimed to. */
  const stamp = (live.match(/<meta name="build" content="([^"]+)"/) || [])[1];
  const shipped = stamp ? stamp.split(" ")[0] : null;
  const built = stamp ? stamp.split(" ")[1] : null;
  const here = execFileSync("git", ["rev-parse", "--short=7", "HEAD"]).toString().trim();

  /* How far behind, when the commit is one this clone knows. It may not be: a
     deploy from another branch, or from a commit never fetched here. */
  let behind = null;
  if (shipped && shipped !== here) {
    try {
      behind = execFileSync("git", ["rev-list", "--count", shipped + "..HEAD"],
        { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {}
  }

  const v = deployVerdict(shipped, built, here, behind, seen);
  line(v.state, "deployed build is current", v.note);
  /* The same page, compared by content rather than by length.

     This used to pass when the two lengths were within a twentieth of each
     other, and print both. The gap it printed every day — about two percent —
     was line endings: git here checks the sources out with CRLF, build.mjs
     copies them as they are, and the deploy is built on Linux from LF. Take
     the carriage returns out, and the build stamp (which is meant to differ
     when the commits do), and all seventeen pages were byte-identical. So the
     number on screen suggested a content drift that did not exist, while the
     tolerance would have let a real one of up to five percent through.

     Normalised, hashed, equal or not. The lengths are printed only when they
     differ, as a clue to how much. And only when the deploy is this commit:
     a different commit is meant to be a different page, and the line above
     has already said so. */
  const norm = (t) => t.replace(/\r/g, "").replace(/<meta name="build" content="[^"]*">\n?/g, "");
  const hash = (t) => createHash("sha256").update(norm(t)).digest("hex").slice(0, 12);
  if (v.state !== "ok") {
    line("skip", "deployed page matches local dist/", "not compared — the deploy is not this commit");
  } else if (hash(live) === hash(local)) {
    line("ok", "deployed page matches local dist/",
      "identical, line endings and build stamp aside (" + hash(live) + ")");
  } else {
    /* dist/ was rebuilt a few lines up, so it cannot be stale. What it can be
       is built from a working tree with uncommitted edits, under the same HEAD
       stamp — the usual cause by far, and the one to name first. Only a clean
       tree leaves the edge as the suspect. */
    line("warn", "deployed page matches local dist/",
      "same commit, different page — " + norm(live).length + " vs " + norm(local).length +
      " bytes. " + (dirty
        ? "The working tree has uncommitted edits, and dist/ was built from it under the same commit"
        : "The tree is clean, so something between this build and the edge is changing it"));
  }
} catch { line("warn", "deployed build", "could not compare"); }

/* ── the migrations ──────────────────────────────────────────────────────── */

head("migrations — what has actually landed");

/* The tracks probe sends a real track. It sent ["x"], which reached the length
   constraint on name only because nothing looked at the value first; 091 now
   refuses a track that is not one of the three before any constraint runs,
   so "x" would come back as a refusal this reads as "unclear", and 002 would
   look missing on a database that has every file in it. */
const checks = [
  ["001 forms",           () => table("seat_requests"),        ["locked"]],
  ["002 tracks",          () => column("applications", "tracks", ["Customer Service"]), ["present"]],
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

/* What this run wrote, for the last line. It used to end "No rows were
   written" whatever had happened above it, the five tokens included. */
const minted = { count: 0, on: null };

if (!AUTH_PROBE) {
  line("skip", "redirect targets", "not asked — it rewrites a real account's recovery token. " +
    "Run with --auth-probe when you mean to");
} else if (!SERVICE) {
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
    /* Every account, a page at a time. This read the first hundred and
       stopped, so past a hundred users the "oldest link" it chose was only
       the oldest of whichever hundred came back first — and the safety
       property above is a claim about all of them. */
    const users = [];
    for (let page = 1; page <= 100; page++) {
      const u = await (await fetch(AUTH + "/admin/users?per_page=200&page=" + page, { headers: H2 })).json();
      const got = (u && u.users) || [];
      users.push(...got);
      if (got.length < 200) break;
    }
    const pick = chooseProbe(users, Date.now(), LIVE_LINK_MS);
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
    /* Counted before the answer is read: a call that errors afterwards may
       still have rewritten the token, and the last line should not undersell
       what was done. */
    minted.count++;
    minted.on = probe;
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

/* ── who is actually being billed ────────────────────────────────────────────

   Named, not counted. Between 7 and 11 September a business called "Northwind
   Test Co" sat on this half with a placement still ongoing, two approved weeks
   and $306.13 against it — test data left behind by a run that was killed, and
   nobody saw it for four days because nothing routinely looked. Counts would
   not have helped: "clients 1" reads as progress. The name is what gives it
   away, so the name is what gets printed.

   Read with the service key, because the anon key is denied all of this by
   design — which is the whole reason the section above it can only ask whether
   a table is locked. No row is written and nothing here ever fails: a client
   with money against them is the point of the business, not a fault. It is
   here to be read by somebody who knows which businesses are real. */

/* Named and pulled out so tools/test-paying-status.mjs can drive it with rows
   shaped like the ones Northwind actually left. The live half is empty again,
   so against the real database this only ever renders "nobody is being billed
   yet" — which is the half of it that cannot be wrong. Nothing in here reads
   anything but its own arguments, so the test can lift it out by source text
   the way test-billing.mjs lifts billingBlock() out of /seats. */
function payingLines(firms, places, weeks, paid) {
  if (!firms || !places || !weeks || !paid) {
    return [{ state: "warn", what: "who is being billed",
              note: "the paying half could not be read" }];
  }
  if (!firms.length) {
    return [{ state: "ok", what: "nobody is being billed yet",
              note: "no client, no placement, no week, no payment" }];
  }
  const out = firms.map(function (f) {
    /* An ended placement is history, not a live one. A business that finished
       with somebody months ago should not read as still having them. */
    const live = places.filter((p) => p.client_id === f.id && p.status !== "ended").length;
    /* Summed, because a client pays more than once and showing only the last
       one would understate what has come in — the mistake /seats made. */
    const cents = paid.filter((p) => p.client_id === f.id)
      .reduce((s, p) => s + Number(p.amount_cents || 0), 0);
    return { state: "ok", what: f.name,
             note: live + " live placement(s), $" + (cents / 100).toFixed(2) + " recorded paid" };
  });
  out.push({ state: "ok", what: "weeks",
             note: weeks.length + " total, " +
                   weeks.filter((w) => w.status === "approved").length + " approved" });
  return out;
}

head("the paying half");

if (!SERVICE) {
  line("warn", "who is being billed", "no service role key here — run this where .env.local is");
} else {
  const payH = { apikey: SERVICE, Authorization: "Bearer " + SERVICE };
  const grab = async (p) => {
    try {
      const r = await fetch(B + "/" + p, { headers: payH });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  };

  const [firms, places, weeks, paid] = await Promise.all([
    grab("clients?select=id,name&order=name"),
    grab("placements?select=id,client_id,status"),
    grab("timesheets?select=id,status"),
    grab("client_payments?select=id,client_id,amount_cents")
  ]);

  for (const r of payingLines(firms, places, weeks, paid)) line(r.state, r.what, r.note);

  if (firms && firms.length) {
    console.log("");
    console.log("  Every business above should be one you recognise. If one is not, it is");
    console.log("  test data: node tools/walk-paying.mjs --sweep, or sql/cleanup-paying-half.sql.");
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

/* Said on every exit, pass or fail, because what a run wrote does not depend
   on whether it found anything. */
const wrote = minted.count
  ? "No table rows were written. " + minted.count + " password-recovery token(s) were minted on " +
    minted.on + " (--auth-probe) — any reset link already in that inbox no longer works."
  : "Nothing was written to the database. dist/ was rebuilt here.";

console.log("");
if (bad.length) {
  console.log("FAILED: " + bad.join(", "));
  if (soft.length) console.log("also worth a look: " + soft.join(", "));
  console.log(wrote);
  console.log("");
  process.exit(1);
}
if (soft.length) {
  console.log("Running, with " + soft.length + " thing(s) worth a look: " + soft.join(", "));
  console.log(wrote);
  console.log("");
  process.exit(0);
}
console.log("Everything checked is running. " + wrote);
console.log("");
