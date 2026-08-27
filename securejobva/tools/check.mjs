/* Pre-deploy guard. Fails loudly on the things that otherwise break silently.

   The pages POST straight into Postgres through PostgREST, which rejects a
   whole insert over a single unknown key or a number of the wrong type — and
   the visitor sees only "that did not send". Nothing in a browser catches that
   before a real person has already lost their place in the queue. This does.

   Run: node tools/check.mjs          static checks only
        node tools/check.mjs --live   also check the running site

   Exit status is 1 if anything failed, so it can gate a deploy. */
import { readFileSync, existsSync, readdirSync } from "node:fs";
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
  if (!m) throw new Error("no create table for " + table + " in the sql/ folder");
  const out = {};
  for (const line of m[1].split("\n")) {
    const c = line.trim().replace(/--.*$/, "").trim();
    const f = c.match(/^([a-z_][a-z0-9_]*)\s+(text\[\]|timestamptz|integer|uuid|text|boolean|numeric)/i);
    if (f && !/^constraint$/i.test(f[1])) out[f[1]] = f[2].toLowerCase();
  }

  /* A column can also arrive by ALTER, which is how every migration after the
     first adds one. The note above says a column added in 002 counts the same
     as one declared in 001, and until now that was only true when the column
     also appeared in the create table — `tracks` does, which is why nothing
     caught it. A migration that only alters would have been invisible.

     Cheap to be wrong in the safe direction here: a column this finds that is
     not really there shows up immediately as a rejected insert, whereas one it
     misses blocks a form field that is perfectly fine. */
  const alterRe = new RegExp(
    "alter\\s+table\\s+(?:only\\s+)?public\\." + table +
      "\\s+add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?" +
      "([a-z_][a-z0-9_]*)\\s+(text\\[\\]|timestamptz|integer|uuid|text|boolean|numeric)",
    "gi"
  );
  let a;
  while ((a = alterRe.exec(sql)) !== null) out[a[1]] = a[2].toLowerCase();
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

/* Every page that ships, not just the two with forms. admin.html and
   status.html carry a sign-in flow and a stage editor; a stray brace there
   takes the portal down while the markup around it still renders fine. */
const SHIPPED = [...PAGES.map((p) => p.file), "status.html", "admin.html",
  "privacy.html", "terms.html", "refunds.html", "contact.html", "seats.html"]
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

/* An unbalanced <style> is invisible to every check above. The JS still parses,
   the markup still renders, and the page simply prints the rest of its own
   stylesheet as text across the top with everything below it unstyled.

   It shipped exactly that way: build-portal.mjs spliced blocks out of
   careers.html by hardcoded line number, careers.html grew, and one slice
   drifted into the stylesheet and carried a closing tag with it. */
for (const p of SHIPPED.map((file) => ({ file }))) {
  await check(p.file + ": style and script tags balance", () => {
    const html = read(p.file);
    const pairs = [["<style", "</style>"], ["<script", "</script>"]];
    for (const [open, close] of pairs) {
      const o = (html.match(new RegExp(open + "\\b", "gi")) || []).length;
      const c = (html.match(new RegExp(close, "gi")) || []).length;
      if (o !== c) {
        throw new Error(o + " " + open + "> against " + c + " " + close +
          " — the extra tag closes the block early and prints the rest as text");
      }
    }
    /* A CSS rule sitting outside any style block is the shape of that failure
       even when the counts happen to balance. */
    const body = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "");
    const stray = body.match(/^\s*[.#@][a-zA-Z][\w-]*[^\n]*\{/m);
    if (stray) throw new Error("a CSS rule is loose in the document: " + stray[0].trim().slice(0, 60));
    return "balanced";
  });
}

/* esc() turns & into &amp;, which is the whole point of it — it is what stops a
   name containing markup from becoming markup. So an HTML entity handed to it
   comes out as its own source text: `esc(a.track || "&mdash;")` renders the
   five characters &mdash; on the page, sitting where a dash should be.

   It reached production and stayed there, because it breaks nothing. The page
   renders, the JS parses, the tags balance, and every check passed while the
   admin queue showed `&mdash; · ? · applied Aug 25` beside real applicants.
   Only a person looking at it can tell, which is what this is for.

   The fallback is the character itself — "—" — which esc() passes through
   untouched. Entities in raw markup are fine and not matched here: it is the
   trip through esc() that ruins them. */
for (const p of SHIPPED.map((file) => ({ file }))) {
  await check(p.file + ": no HTML entity gets escaped", () => {
    const html = read(p.file);
    /* One level of nesting is enough for the real calls — esc(x || "y") and
       esc((a.list || []).join(", ") || "y"). */
    const calls = html.match(/esc\((?:[^()]|\([^()]*\))*\)/g) || [];
    const bad = calls.filter((c) => /&[a-z]+;|&#\d+;/i.test(c));

    /* The first version of this check looked only inside esc(), and missed the
       bug that prompted it:

         var tracks = (… ) || "&mdash;";      // here
         … esc(tracks) …                       // escaped over there

       The entity and the escaping are in different statements, so no esc() call
       contains one. What both forms share is the entity being a FALLBACK — the
       value a field takes when it is empty — and a fallback is by definition
       something a person reads. Entities elsewhere are raw markup and correct,
       which is why the match is on `|| "&…;"` and not on the entity alone. */
    for (const [, ent] of html.matchAll(/\|\|\s*\\?"(&[a-z]+;|&#\d+;)\\?"/gi)) {
      bad.push('a fallback of "' + ent + '"');
    }

    if (bad.length) {
      throw new Error(bad.length + " place(s) escape an entity, e.g. " +
        bad[0].slice(0, 80) + " — it prints as its own source text. " +
        "Use the character itself, or keep the entity outside esc()");
    }
    return calls.length + " esc() calls";
  });
}

/* The schema lives in sql/ as numbered files that get pasted into the Supabase
   editor one at a time. For checking purposes they are one document — a column
   added in 002 is just as real as one declared in 001. verify.sql is excluded:
   it is read-only diagnostics, not schema. */
/* A file ending .local.sql is a filled-in copy of the migration beside it, with
   a real secret pasted where the placeholder is. It is git-ignored, it exists
   only so the copy you are meant to paste sits next to the copy you are not,
   and it is a duplicate of a numbered file by design — so it is not schema and
   must not be read as any. */
const SQL_DIR = "sql";
const sqlFiles = readdirSync(SQL_DIR)
  .filter((f) => /^\d+.*\.sql$/.test(f) && !f.endsWith(".local.sql"))
  .sort();
if (!sqlFiles.length) throw new Error("no numbered .sql files in " + SQL_DIR + "/");

/* Two people writing migrations against the same folder collided on 008, 014
   and 017 in a single day — each time discovered by a merge rather than by
   either author, and each time needing a rename after the file had already
   been pasted into the database under its old number.

   The number is the running order, so two files sharing one have no defined
   order between them. Caught here it costs a rename; caught later it is a
   migration somebody ran twice or not at all. */
await check("no two migrations share a number", () => {
  const byNumber = new Map();
  for (const f of sqlFiles) {
    const n = (f.match(/^(\d+)/) || [])[1];
    if (!byNumber.has(n)) byNumber.set(n, []);
    byNumber.get(n).push(f);
  }
  const clashes = [...byNumber.entries()].filter(([, files]) => files.length > 1);
  if (clashes.length) {
    throw new Error(clashes.map(([n, files]) => n + ": " + files.join(" and ")).join("; ") +
      " — renumber the later one. Claim the number in sql/README.md before writing the file.");
  }
  return sqlFiles.length + " migrations, 001–" + [...byNumber.keys()].sort().pop();
});
const sql = sqlFiles.map((f) => read(SQL_DIR + "/" + f)).join("\n");

for (const p of PAGES) {
  const cols = columns(sql, p.table);
  const keys = payload(read(p.file));

  /* PostgREST rejects the entire insert when one key has no column, so a field
     added to a form without its column loses every submission after it. */
  await check(p.file + ": every form field has a column", () => {
    const missing = Object.keys(keys).filter((k) => !(k in cols));
    if (missing.length) {
      throw new Error("no column in " + p.table + " for: " + missing.join(", ") +
        " — add them to a new file in sql/ in this commit");
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

/* Every column on applications must be granted, not just the named ones.

   The earlier check below compares the columns a page names in `select=`. That
   missed the failure that reached production, because nothing named the column:
   the admin page PATCHes a stage without `Prefer: return=minimal`, PostgREST
   returns the updated row, and returning a row reads every column in it. One
   ungranted column — user_id, added by 004 — refused the whole statement, and
   the operator saw an error about SELECT on an update they had not made.

   So the rule is the stronger one: if a column exists on applications, a
   signed-in user may read it. Row-level security decides *which rows* they see,
   which is the part that actually protects anyone. Withholding a column on a
   row they can already read buys nothing and breaks `select=*`.

   A column that genuinely must be hidden belongs in its own table — that is
   exactly why 005 put the internal pipeline in application_tracking rather
   than adding columns here. */
await check("every applications column is granted", () => {
  const declared = new Set(Object.keys(columns(sql, "applications")));
  const granted = new Set();
  for (const stmt of sql.split(";")) {
    const m = stmt.match(/grant\s+select\s*\(([^)]*)\)\s*on\s+public\.applications\s+to\s+authenticated/i);
    if (m) for (const c of m[1].split(",")) {
      const t = c.trim().replace(/--.*/, "").trim();
      if (t) granted.add(t);
    }
  }
  const missing = [...declared].filter((c) => !granted.has(c));
  if (missing.length) {
    throw new Error(missing.join(", ") + " — declared on applications but never granted SELECT to " +
      "authenticated. Any select=* against the table refuses the whole statement with 42501. " +
      "Grant it, or move it to its own table if it truly must be hidden.");
  }
  return declared.size + " columns, all granted";
});

/* The mirror of the form check, for the pages that read rather than write.

   Grants on applications are column-level, and PostgREST refuses the whole
   statement over a single ungranted column rather than returning the rest.
   That is the safe direction to fail in, but it means one missing column looks
   identical to a broken database: /status showed "We could not load your
   application just now" and /admin showed 42501, both because posting_consent
   was granted for UPDATE in 006 and never for SELECT. */
await check("portal reads only columns it is granted", () => {
  const granted = new Set();
  for (const stmt of sql.split(";")) {
    const m = stmt.match(/grant\s+select\s*\(([^)]*)\)\s*on\s+public\.applications\s+to\s+authenticated/i);
    if (m) {
      for (const c of m[1].split(",")) {
        const t = c.trim().replace(/--.*/, "").trim();
        if (t) granted.add(t);
      }
    }
  }
  if (!granted.size) throw new Error("no column-level SELECT grant on applications found");

  const asked = new Set();
  for (const f of ["status.html", "admin.html"]) {
    if (!existsSync(f)) continue;
    for (const q of read(f).match(/applications\?select=([^"'`&]+)/g) || []) {
      for (const c of q.replace(/^applications\?select=/, "").split(",")) {
        const t = c.trim();
        if (t && t !== "*") asked.add(t);
      }
    }
  }
  const missing = [...asked].filter((c) => !granted.has(c));
  if (missing.length) {
    throw new Error("selected but not granted: " + missing.join(", ") +
      " — PostgREST refuses the whole query with 42501, so the page shows nothing at all. " +
      "Add them to a grant select (...) on public.applications to authenticated.");
  }
  return asked.size + " columns read, all granted";
});

/* The queue is the last thing standing between a failed POST and a lost lead,
   so its behaviour is driven, not just parsed. tools/test-queue.mjs pulls the
   real block out of index.html and runs it against a mocked store. */
/* 016 fixed a bug worth not having twice: user_id was added to applications in
   004 and never granted, and nothing noticed until a PATCH returned the row —
   because returning a row means reading every column in it, and one ungranted
   column refuses the whole statement. The operator saw a SELECT error on an
   UPDATE they had not made.

   The general shape: asking for select=* against a table whose grant is a
   column list is a bet that the list is complete. It is complete right up until
   somebody adds a column and forgets, and then the failure lands somewhere else
   entirely. So either grant the whole table, or never ask it for everything. */
await check("select=* only where the whole table is granted", () => {
  const pages = ["status.html", "admin.html", "seats.html", "index.html", "careers.html"]
    .filter((f) => existsSync(f));

  /* A grant with a column list looks like  grant select (a, b) on public.t
     A table-wide one looks like  grant select, insert on public.t  */
  const columnLimited = new Set();
  const tableWide = new Set();
  for (const m of sql.matchAll(/grant\s+select\s*\(([^)]*)\)\s*on\s+public\.([a-z_]+)/gi)) {
    columnLimited.add(m[2].toLowerCase());
  }
  for (const m of sql.matchAll(/grant\s+([a-z,\s]*select[a-z,\s]*)\s+on\s+public\.([a-z_]+)\s+to/gi)) {
    if (!/\(/.test(m[1])) tableWide.add(m[2].toLowerCase());
  }

  const offenders = [];
  for (const f of pages) {
    const html = read(f);
    /* both the REST path form and a bare select=* query */
    for (const m of html.matchAll(/["'`]([a-z_]+)\?select=\*/gi)) {
      const t = m[1].toLowerCase();
      if (tableWide.has(t)) continue;
      if (columnLimited.has(t)) offenders.push(f + ": select=* on " + t);
    }
  }

  if (offenders.length) {
    throw new Error(offenders.join("; ") +
      " — that table is granted column by column, so select=* fails the moment " +
      "a column is added without being listed. Name the columns, or grant the table.");
  }

  const limited = [...columnLimited].filter((t) => !tableWide.has(t));
  return limited.length + " column-limited tables, none queried with select=*";
});

/* save() on /admin decides what changed and builds the writes. A wrong
   comparison there is invisible: the row looks saved and nothing was sent. */
await check("admin saves what changed and nothing else", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync(process.execPath, ["tools/test-admin-save.mjs"], { stdio: "pipe" });
    return "6 checks";
  } catch (e) {
    throw new Error("tools/test-admin-save.mjs failed — run it directly");
  }
});

/* The questionnaire is asked by careers.html and scored by sql/021, and both
   are generated from tools/disc-items.mjs. If they ever drift, nothing errors
   — every applicant simply gets a wrong profile. tools/test-disc.mjs
   regenerates and diffs, and drives the page's own rules. */
await check("the DISC questionnaire holds together", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync(process.execPath, ["tools/test-disc.mjs"], { stdio: "pipe" });
    return "13 checks";
  } catch (e) {
    throw new Error("tools/test-disc.mjs failed — run it directly");
  }
});

/* The CSV is the one place applicant-typed text leaves this system and is
   opened in a program that executes formulas. Both failure modes are silent. */
await check("CSV escaping holds", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync(process.execPath, ["tools/test-csv.mjs"], { stdio: "pipe" });
    return "16 checks, injection guarded";
  } catch (e) {
    throw new Error("tools/test-csv.mjs failed — run it directly");
  }
});

/* A sweep for the bug classes that do not announce themselves: colliding ids,
   anchors and links that go nowhere, JS reaching for an element the markup no
   longer has, controls with no accessible name. All of them render fine. */
await check("pages survive the audit", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync(process.execPath, ["tools/audit.mjs"], { stdio: "pipe" });
    return "ids, links, labels, form columns";
  } catch (e) {
    throw new Error("tools/audit.mjs found problems — run it directly for the list");
  }
});

/* Chart geometry fails silently: a bar of width NaN simply does not paint, and
   nobody notices until a number is wrong in a meeting. tools/test-charts.mjs
   pulls countBy() and bars() out of the built page and drives them. */
await check("admin charts compute", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync(process.execPath, ["tools/test-charts.mjs"], { stdio: "pipe" });
    return "16 checks";
  } catch (e) {
    throw new Error("tools/test-charts.mjs failed — run it directly for the detail");
  }
});

/* The notification endpoint is reachable from the internet and describes real
   applicants, so its refusals are as much the point as its sending. Driven
   rather than parsed: a wrong secret, a missing secret, an unlisted table, an
   escaped field, and a Resend outage that must ask for a retry rather than
   swallow the row. */
await check("notify refuses and sends correctly", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    /* Counted from the run, not written down here. The label said 27 while the
       file asserted 48, because a number in a string does not move when the
       thing it describes does. */
    const out = execFileSync(process.execPath, ["tools/test-notify.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {2}ok {4}/gm) || []).length + " behaviours";
  } catch (e) {
    throw new Error("tools/test-notify.mjs failed — run it directly for the detail");
  }
});

/* The apply dialog went blank because show() accepted an index past the end:
   every step hidden, the counter frozen, every rail segment lit, and then a
   throw. An applicant saw an empty box with their answers still in it and no
   way forward, and nothing anywhere said so.

   Driven against the real show() pulled out of both pages. */
await check("a step index past the end is refused", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync(process.execPath, ["tools/test-steps.mjs"], { stdio: "pipe" });
    return "32 behaviours, both dialogs";
  } catch (e) {
    throw new Error("tools/test-steps.mjs failed — run it directly for the detail");
  }
});

await check("lead queue behaves", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync(process.execPath, ["tools/test-queue.mjs"], { stdio: "pipe" });
    return "11 behaviours";
  } catch (e) {
    throw new Error("tools/test-queue.mjs failed — run it directly for the detail");
  }
});

/* A SECURITY DEFINER function runs as its owner, so it reaches past every
   policy that applies to the caller. That is the point — is_admin() has to read
   a table the caller cannot — but it means the function body is the only thing
   standing between any signed-in user and the data it touches.

   So a definer function executable by `authenticated` must ask who is calling:
   has_permission(), auth.uid() or auth.jwt(). One that asks nothing is a
   privilege escalation with a friendly name, and set_role() is the shape that
   matters — anyone can call it, and only the first line stops them. */
await check("SECURITY DEFINER functions check the caller", () => {
  const fns = [...sql.matchAll(
    /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)([\s\S]*?)\$fn\$([\s\S]*?)\$fn\$/gi
  )];
  if (!fns.length) return "no definer functions defined";
  const ungated = [];
  for (const [, name, sig, body] of fns) {
    if (!/security\s+definer/i.test(sig)) continue;
    if (!new RegExp("grant\\s+execute\\s+on\\s+function\\s+public\\." + name + "\\b[^;]*authenticated", "i").test(sql)) continue;
    if (!/has_permission|auth\.uid\(\)|auth\.jwt\(\)/i.test(body)) ungated.push(name);
  }
  if (ungated.length) {
    throw new Error(ungated.join(", ") + " — SECURITY DEFINER, executable by any signed-in " +
      "user, and never asks who is calling. Gate it with has_permission() or auth.jwt().");
  }
  const checked = fns.filter(([, , sig]) => /security\s+definer/i.test(sig)).map((f) => f[1]);
  return checked.length + " gated: " + checked.join(", ");
});

/* A view is the quiet way to undo every policy underneath it.

   By default a Postgres view runs with its OWNER's rights, not the caller's,
   so a view over `applications` granted to `authenticated` hands every row to
   every signed-in applicant — RLS on the table below is simply not consulted.
   Nothing errors, nothing logs, and the page looks like it is working.

   `security_invoker = true` runs it as the caller, which puts the policies
   back. application_queue has it. Any view added later must too. */
/* CREATE OR REPLACE VIEW may only APPEND columns to the end of an existing
   view. Rename one, reorder them, or insert in the middle and Postgres refuses
   with 42P16 — which is not caught until someone pastes the file and the
   migration stops halfway, leaving the database in neither state.

   008 rewrote application_queue with the score columns where is_ghosted had
   been, and failed exactly that way. So a file rewriting a view an earlier file
   already created must drop it first. */
await check("a rewritten view is dropped first", () => {
  const created = new Map();          /* view name -> file that first created it */
  const offenders = [];
  for (const f of sqlFiles) {
    const text = read(SQL_DIR + "/" + f);
    for (const [, name] of text.matchAll(/create\s+(?:or\s+replace\s+)?view\s+public\.(\w+)/gi)) {
      if (created.has(name) && created.get(name) !== f) {
        const drops = new RegExp("drop\\s+view\\s+if\\s+exists\\s+public\\." + name + "\\b", "i").test(text);
        if (!drops) offenders.push(f + " rewrites " + name + " (first made in " + created.get(name) + ")");
      }
      if (!created.has(name)) created.set(name, f);
    }
  }
  if (offenders.length) {
    throw new Error(offenders.join("; ") + " — add `drop view if exists` before it, " +
      "or the paste fails with 42P16 partway through and re-grant what the drop takes with it");
  }
  return created.size ? created.size + " view(s) tracked" : "no views";
});

await check("views run as the caller, not the owner", () => {
  const views = [...sql.matchAll(
    /create\s+(?:or\s+replace\s+)?view\s+public\.(\w+)([\s\S]*?)\sas\s/gi
  )];
  if (!views.length) return "no views defined";
  const unsafe = views
    .filter(([, , opts]) => !/security_invoker\s*=\s*true/i.test(opts))
    .map(([, name]) => name);
  if (unsafe.length) {
    throw new Error(unsafe.join(", ") + " — a view without security_invoker = true runs as its " +
      "owner and ignores the RLS underneath it, handing every row to every signed-in user");
  }
  return views.map((v) => v[1]).join(", ") + " — security_invoker set";
});

/* The one rule from sql/001-forms.sql, asserted rather than trusted.

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
     so match to the statement terminator, not to end of line.

     Comments come out first. Matching to the next semicolon across a `--` line
     means the word "grant" in a sentence about grants starts a statement that
     runs on into the real one below it, and the privileges this then reads are
     whatever prose sat in between. It fired as a false alarm on 021, but the
     same hole hides a real grant just as easily: a `grant select … to anon`
     with a comment above it gets swallowed into that phantom statement and is
     never checked on its own. */
  const stmts = sql.replace(/--[^\n]*/g, "").match(/grant\b[\s\S]*?;/gi) || [];
  if (!stmts.length) throw new Error("no grants found — has the file been rewritten?");

  /* Insert-only is the rule, and 015 is the first honest exception: client
     logos are marketing, shown by an <img> to visitors who are not signed in,
     and signing those URLs would break the strip for everyone it is for.

     So the exception is allowed, but it has to be *declared*. A table opens to
     anon reads only when its file says so in as many words:

       -- ANON MAY READ client_logos — public marketing, no personal data

     which means the next one cannot be waved through by whoever is reading the
     diff in a hurry. A table holding a person's details should never carry that
     line, and writing it is a decision somebody has to make on purpose. */
  /* These hold people. No declaration opens them — the line above is for
     marketing tables, not an override anyone can type over a table of names,
     emails, phone numbers, CVs or tokens. If one of these ever genuinely has
     to be readable by anon, that is a conversation, not a comment. */
  const NEVER_PUBLIC = new Set([
    "applications", "seat_requests", "contact_messages", "application_notes",
    "application_note_log", "application_disc", "application_disc_read",
    "application_tracking", "application_socials", "application_documents",
    "application_queue", "social_tokens", "admins", "user_roles",
    "role_requests", "roles", "permissions", "role_permissions"
  ]);

  const declaredPublic = new Set(
    [...sql.matchAll(/--\s*ANON MAY READ\s+(\w+)/gi)]
      .map((m) => m[1].toLowerCase())
      .filter((t) => !NEVER_PUBLIC.has(t))
  );

  const offenders = [];
  for (const s of stmts) {
    const to = (s.match(/\sto\s+([a-z_, ]+);/i) || [])[1] || "";
    const grantees = to.split(",").map((g) => g.trim().toLowerCase());
    if (!grantees.some((g) => g === "anon" || g === "public")) continue;
    const table = ((s.match(/\son\s+public\.(\w+)/i) || [])[1] || "").toLowerCase();
    const privs = (s.match(/grant\s+([\s\S]*?)\s+on\s/i) || [])[1] || "";
    const clean = privs.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    if (clean === "insert") continue;
    if (declaredPublic.has(table)) {
      /* The declaration opens a table to READING. It is not a general waiver:
         `grant update on client_logos to anon` would otherwise slip through
         here and let anyone with the page source rewrite who we say we work
         for. Declared-public means public to read, nothing more. */
      if (clean !== "select") {
        offenders.push(clean + " on " + table + " -> " + grantees.join(", ") +
          " (declared public means readable, not writable)");
      }
      continue;
    }
    offenders.push(clean + " on " + table + " -> " + grantees.join(", "));
  }
  if (offenders.length) {
    throw new Error("anon/public granted more than insert: " + offenders.join("; ") +
      " — this publishes the applicant list");
  }
  /* Same rule for the policy that pairs with the grant: a SELECT policy aimed
     at anon is how a table becomes public, so it needs the same declaration. */
  for (const [, table] of sql.matchAll(
    /create\s+policy\s+[^\n]*?\son\s+public\.(\w+)\s+for\s+select\s+to\s+(?:anon|public)\b/gi
  )) {
    if (!declaredPublic.has(table.toLowerCase())) {
      offenders.push("a SELECT policy for anon on " + table);
    }
  }
  if (offenders.length) {
    throw new Error(offenders.join("; ") + " — declare it with a `-- ANON MAY READ <table>` " +
      "line if it is genuinely public, or this publishes personal data");
  }
  const authed = stmts.filter((s) => /\sto\s+[^;]*authenticated/i.test(s)).length;
  return stmts.length + " grants — anon insert-only, " + authed + " to signed-in users";
});

/* A signed-in applicant may write their own row. Which COLUMNS they may write
   is decided by the column list on the grant and by nothing else — the policy
   in 006 checks that the row is theirs and stops there. So `grant update` with
   no column list on a table holding applicants is the difference between an
   applicant fixing their phone number and an applicant writing
   status = 'approved' on themselves.

   This is not hypothetical. Postgres answers a refused write with

     permission denied for table applications
     Grant the required privileges with: GRANT UPDATE ON public.applications TO authenticated;

   which is correct advice about permissions and terrible advice about this
   table, arrives at the exact moment somebody is stuck, and is one paste away
   from being run. The real cause of that error has always been a missing column
   grant — 020 is what it looks like fixed properly.

   INSERT is not included: an insert makes a new row rather than rewriting an
   existing one, and 001 grants it to anon by design. */
await check("no whole-table UPDATE where the subject writes their own row", () => {
  /* Only these two. Everywhere else a signed-in person may write — the notes,
     the tracking, the contact inbox — the policy behind it is staff-only, so a
     table-level grant hands nothing to the person the row is about. It is these
     two, where the policy's whole test is "is this row yours", that need the
     column list to be doing the other half of the work.

     Flagging the staff tables as well was the first version of this check. It
     failed on grants that were deliberate and correct, and a guard that cries
     wolf gets switched off. */
  const SUBJECT_WRITES_OWN_ROW = new Set(["applications", "seat_requests"]);

  /* Comments here run to hundreds of lines and say the word `grant` often, and
     several of them quote the dangerous statement in order to warn against it.
     Match against the SQL with the prose taken out. */
  const bare_sql = sql.replace(/--[^\n]*/g, " ");

  const offenders = [];
  for (const s of bare_sql.match(/grant\b[\s\S]*?;/gi) || []) {
    const table = ((s.match(/\son\s+public\.(\w+)/i) || [])[1] || "").toLowerCase();
    if (!SUBJECT_WRITES_OWN_ROW.has(table)) continue;

    /* The privileges as written, with any column list left in place: it is the
       presence of the parentheses that makes the grant safe. */
    const privs = ((s.match(/grant\s+([\s\S]*?)\s+on\s/i) || [])[1] || "").toLowerCase();

    /* `update (a, b)` is a column grant. `update` alone, or `all`, is the table. */
    const bare = /\ball\b(?!\s*\()/.test(privs) || /\bupdate\b(?!\s*\()/.test(privs);
    if (!bare) continue;

    const to = ((s.match(/\sto\s+([a-z_, ]+);/i) || [])[1] || "").trim();
    offenders.push(privs.replace(/\s+/g, " ").trim() + " on " + table + " -> " + to);
  }

  if (offenders.length) {
    throw new Error(offenders.join("; ") + " — name the columns: `grant update (status, " +
      "status_changed_at) on public.applications to authenticated`. Without a column list " +
      "the only thing deciding what an applicant may write is a policy that never looks at " +
      "columns, so they can set their own status");
  }
  return SUBJECT_WRITES_OWN_ROW.size + " tables — every UPDATE grant names its columns";
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
