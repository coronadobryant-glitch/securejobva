/* Pre-deploy guard. Fails loudly on the things that otherwise break silently.

   The pages POST straight into Postgres through PostgREST, which rejects a
   whole insert over a single unknown key or a number of the wrong type — and
   the visitor sees only "that did not send". Nothing in a browser catches that
   before a real person has already lost their place in the queue. This does.

   Run: node tools/check.mjs          static checks only
        node tools/check.mjs --live   also check the running site

   Exit status is 1 if anything failed, so it can gate a deploy. */
import { readFileSync, existsSync } from "node:fs";
import { Script } from "node:vm";

const LIVE = process.argv.includes("--live");
const fails = [];
const warns = [];
let ran = 0;

async function check(name, fn) {
  ran++;
  try {
    const note = await fn();
    console.log("  ok    " + name + (note ? "  — " + note : ""));
  } catch (e) {
    if (e && e.warning) { warns.push(name); console.log("  warn  " + name + "  — " + e.message); }
    else { fails.push(name); console.log("  FAIL  " + name + "  — " + e.message); }
  }
}

const PAGES = [
  { file: "index.html",   table: "seat_requests" },
  { file: "careers.html", table: "applications"  }
];
const read = (f) => readFileSync(f, "utf8");

/* ── the schema, as the database actually defines it ─────────────────────── */

function columns(sql, table) {
  const m = sql.match(
    new RegExp("create table if not exists public\\." + table + "\\s*\\(([\\s\\S]*?)\\n\\);", "i")
  );
  if (!m) throw new Error("no create table for " + table + " in supabase.sql");
  const out = {};
  for (const line of m[1].split("\n")) {
    const c = line.trim().replace(/--.*$/, "").trim();
    const f = c.match(/^([a-z_][a-z0-9_]*)\s+(text\[\]|timestamptz|integer|uuid|text|boolean|numeric)/i);
    if (f && !/^constraint$/i.test(f[1])) out[f[1]] = f[2].toLowerCase();
  }
  return out;
}

/* ── the payload, as the page actually sends it ──────────────────────────── */

function payload(html) {
  const at = html.indexOf("  function collect() {");
  if (at < 0) throw new Error("collect() not found");
  const end = html.indexOf("\n  }", at);
  const body = html.slice(at, end);
  const out = {};
  for (const line of body.split("\n")) {
    const m = line.match(/^\s{6}([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+?),?\s*$/);
    if (m) out[m[1]] = m[2].replace(/,$/, "").trim();
  }
  return out;
}

console.log("\nstatic\n");

/* Every inline script has to parse. These files are edited by hand and by
   script, and a stray brace in the dialog takes the whole form down while the
   page around it still renders perfectly — so nothing looks wrong. */
/* Every page that ships, not just the two with forms. admin.html and
   status.html carry a sign-in flow and a stage editor; a stray brace there
   takes the portal down while the markup around it still renders fine. */
const SHIPPED = [...PAGES.map((p) => p.file), "status.html", "admin.html"]
  .filter((f) => existsSync(f));

for (const p of SHIPPED.map((file) => ({ file }))) {
  await check(p.file + ": inline JS parses", () => {
    const html = read(p.file);
    const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    if (!blocks.length) throw new Error("no inline script found — did the markup change?");
    blocks.forEach((b, i) => {
      try { new Script(b[1]); }
      catch (e) { throw new Error("block " + (i + 1) + ": " + e.message); }
    });
    return blocks.length + " blocks";
  });
}

const sql = read("supabase.sql");

for (const p of PAGES) {
  const cols = columns(sql, p.table);
  const keys = payload(read(p.file));

  /* PostgREST rejects the entire insert when one key has no column, so a field
     added to a form without its column loses every submission after it. */
  await check(p.file + ": every form field has a column", () => {
    const missing = Object.keys(keys).filter((k) => !(k in cols));
    if (missing.length) {
      throw new Error("no column in " + p.table + " for: " + missing.join(", ") +
        " — add them to supabase.sql in this commit");
    }
    return Object.keys(keys).length + " fields -> " + p.table;
  });

  /* An integer column will not take 232.5. This is exactly how the 30-hour
     preset silently failed: 30 x 7.75, straight into `weekly integer`. */
  await check(p.file + ": integer fields cannot arrive fractional", () => {
    const risky = [];
    for (const [k, expr] of Object.entries(keys)) {
      if (cols[k] !== "integer") continue;
      if (/[*/]/.test(expr) && !/Math\.(round|floor|ceil)|parseInt/.test(expr)) {
        risky.push(k + ": " + expr);
      }
    }
    if (risky.length) {
      throw new Error("unrounded arithmetic into an integer column — " + risky.join("; ") +
        " — wrap it in Math.round()");
    }
    const ints = Object.keys(cols).filter((c) => cols[c] === "integer");
    return ints.length ? ints.join(", ") + " guarded" : "no integer columns";
  });
}

/* The queue is the last thing standing between a failed POST and a lost lead,
   so its behaviour is driven, not just parsed. tools/test-queue.mjs pulls the
   real block out of index.html and runs it against a mocked store. */
await check("lead queue behaves", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync(process.execPath, ["tools/test-queue.mjs"], { stdio: "pipe" });
    return "11 behaviours";
  } catch (e) {
    throw new Error("tools/test-queue.mjs failed — run it directly for the detail");
  }
});

/* The one rule from supabase.sql, asserted rather than trusted.

   The rule is about `anon` — the key that sits in the page source where anyone
   can read it. `authenticated` is a different thing entirely: a session Supabase
   issues only after Google has vouched for an email, and every read it can do is
   still fenced by a policy. So grants to `authenticated` are allowed here and
   grants to `anon` are held to insert-only.

   An earlier version of this check failed any grant that was not insert,
   whatever the grantee, and flagged the admin portal as a breach. A guard that
   cries wolf gets switched off, which is worse than not having one. */
await check("anon can still only INSERT", () => {
  /* A grant can span lines and carry a column list —
        grant select ( id, created_at, … ) on public.applications to authenticated;
     so match to the statement terminator, not to end of line. */
  const stmts = sql.match(/grant\b[\s\S]*?;/gi) || [];
  if (!stmts.length) throw new Error("no grants found — has the file been rewritten?");

  const offenders = [];
  for (const s of stmts) {
    const to = (s.match(/\sto\s+([a-z_, ]+);/i) || [])[1] || "";
    const grantees = to.split(",").map((g) => g.trim().toLowerCase());
    if (!grantees.some((g) => g === "anon" || g === "public")) continue;
    const privs = (s.match(/grant\s+([\s\S]*?)\s+on\s/i) || [])[1] || "";
    const clean = privs.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    if (clean !== "insert") offenders.push(clean + " -> " + grantees.join(", "));
  }
  if (offenders.length) {
    throw new Error("anon/public granted more than insert: " + offenders.join("; ") +
      " — this publishes the applicant list");
  }
  if (/for\s+select\s+to\s+(anon|public)\b/i.test(sql)) {
    throw new Error("a SELECT policy for anon would publish the applicant list");
  }
  const authed = stmts.filter((s) => /\sto\s+[^;]*authenticated/i.test(s)).length;
  return stmts.length + " grants — anon insert-only, " + authed + " to signed-in users";
});

/* ── built output ────────────────────────────────────────────────────────── */

console.log("\ndist\n");

if (!existsSync("dist/index.html")) {
  console.log("  warn  dist/ not built — run node build.mjs first");
  warns.push("dist not built");
} else {
  const site = (read("build.mjs").match(/const SITE = "([^"]+)"/) || [])[1];

  for (const p of PAGES) {
    await check("dist/" + p.file + ": share and search meta", () => {
      const d = read("dist/" + p.file);
      const need = ['rel="canonical"', "og:url", "og:image", "og:title",
                    "twitter:card", "<title>", 'name="description"'];
      const missing = need.filter((t) => !d.includes(t));
      if (missing.length) throw new Error("missing: " + missing.join(", "));
      if (!d.startsWith("<!doctype html>")) throw new Error("no doctype — the wrap step did not run");
      return "complete";
    });

    await check("dist/" + p.file + ": no artifact URLs survive", () => {
      const d = read("dist/" + p.file);
      const left = [...d.matchAll(/https:\/\/claude\.ai\/code\/artifact\/[0-9a-f-]+/g)].map((m) => m[0]);
      if (left.length) throw new Error("REWRITE missed " + left.length + ", first: " + left[0]);
      return "rewritten to paths";
    });

    await check("dist/" + p.file + ": canonical uses the primary host", () => {
      const d = read("dist/" + p.file);
      const canon = (d.match(/rel="canonical" href="([^"]+)"/) || [])[1] || "";
      if (!canon.startsWith(site)) throw new Error("canonical " + canon + " does not sit on " + site);
      return canon;
    });
  }
}

/* ── against the running site ────────────────────────────────────────────── */

if (LIVE) {
  console.log("\nlive\n");
  const site = (read("build.mjs").match(/const SITE = "([^"]+)"/) || [])[1];

  /* A canonical naming a URL that immediately redirects splits the ranking
     signal. Vercel's primary host can be flipped in a dashboard with nothing
     in this repo changing, so it is checked rather than assumed. */
  await check("canonical host is the one that does not redirect", async () => {
    const r = await fetch("https://securejobva.com/", { redirect: "manual" });
    const to = r.headers.get("location");
    const primary = to ? new URL(to).origin : "https://securejobva.com";
    if (primary !== site) {
      throw new Error("build.mjs SITE is " + site + " but the apex redirects to " + primary +
        " — update SITE, or flip the primary domain in Vercel");
    }
    return primary + " (apex " + r.status + ")";
  });

  for (const [label, url, want] of [
    ["/careers serves",   site + "/careers",            200],
    [".html redirects",   site + "/careers.html",       308],
    ["/apply lands",      site + "/apply",              308],
    ["a bad path 404s",   site + "/nope-" + Date.now(), 404]
  ]) {
    await check("live: " + label, async () => {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status !== want) throw new Error(url + " gave " + r.status + ", wanted " + want);
      return String(r.status);
    });
  }
}

console.log("");
console.log(ran + " checks, " + fails.length + " failed, " + warns.length + " warned");
if (!LIVE) console.log("(--live also checks the running site)");
console.log("");
process.exit(fails.length ? 1 : 0);
