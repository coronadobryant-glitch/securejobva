/* Pre-deploy guard. Fails loudly on the things that otherwise break silently.

   The pages POST straight into Postgres through PostgREST, which rejects a
   whole insert over a single unknown key or a number of the wrong type — and
   the visitor sees only "that did not send". Nothing in a browser catches that
   before a real person has already lost their place in the queue. This does.

   Run: node tools/check.mjs          static checks only
        node tools/check.mjs --live   also check the running site

   Exit status is 1 if anything failed, so it can gate a deploy. */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
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
const SHIPPED = [...PAGES.map((p) => p.file), "status.html", "admin.html", "hub.html",
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

/* Everything below about dist/ reads files build.mjs wrote. If the build failed,
   those files are whatever the last successful run left behind — and the checks
   then pass against a version of the site that no longer exists.

   That is not hypothetical. Removing the site header from /admin broke the
   head-from-body split in build.mjs; the build threw, dist/ kept yesterday's
   copies, and the checks went green on them through four commits while every
   deploy failed. The build command runs them in sequence for exactly this
   reason, and running them out of sequence is what hid it.

   A file on disk that is older than its source means the build did not write
   it. Cheap, and it fails in precisely the case that fooled me. */
await check("dist was written by this build", () => {
  const stale = [];
  for (const f of SHIPPED) {
    const out = "dist/" + f;
    if (!existsSync(out)) { stale.push(f + " is missing from dist/"); continue; }
    const src = statSync(f).mtimeMs;
    const built = statSync(out).mtimeMs;
    if (built < src) stale.push(f + " is newer than dist/" + f);
  }
  if (stale.length) {
    throw new Error(stale.join("; ") + " — run node build.mjs. These checks read " +
      "dist/, so without it they pass against the last build that worked");
  }
  return SHIPPED.length + " pages, all rebuilt";
});

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
  /* 018 granted SELECT on the whole table for exactly this reason, and Postgres
     extends a table-level grant to columns added afterwards — so once that
     statement is in the folder, select=* cannot fail on a new column and the
     column-by-column list is not the thing keeping anyone safe.

     This check predates it and only ever looked for column lists, so the first
     column added after 018 failed it: payout_method in 026, which select=*
     could read perfectly well. Still worth keeping for the day somebody revokes
     the table grant — then the columns have to carry it again. */
  /* Statement by statement. Matched against the whole file, `[a-z,\s]*` walks
     across semicolons and pairs a `grant` in one statement with `on
     public.applications` in another — which it did, and the check went green
     with 018's grant deleted. */
  const wholeTable = sql.replace(/--[^\n]*/g, " ").split(";").some((stmt) =>
    /grant\s+[a-z,\s]*\bselect\b[a-z,\s]*\s+on\s+public\.applications\s+to\s+[a-z_,\s]*authenticated/i.test(stmt) &&
    !/grant\s+select\s*\(/i.test(stmt));
  if (wholeTable) return declared.size + " columns, SELECT granted on the table";

  const missing = [...declared].filter((c) => !granted.has(c));
  if (missing.length) {
    throw new Error(missing.join(", ") + " — declared on applications but never granted SELECT to " +
      "authenticated. Any select=* against the table refuses the whole statement with 42501. " +
      "Grant it, or move it to its own table if it truly must be hidden.");
  }
  return declared.size + " columns, all granted individually";
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

/* ── 030, the timesheet ──────────────────────────────────────────────────
   These numbers are what somebody gets paid on, and every rule protecting
   them lives in a policy body or a trigger — places where a wrong word does
   not fail loudly, it just quietly permits something. Each of the checks
   below was written by first breaking the thing it watches and confirming it
   went red; two of them did not, and had to be rewritten.

   The bare table name is enough to find a statement, because a migration is
   never edited after it has been run: nothing later can redefine these. */

function policyBody(name) {
  const m = sql.match(new RegExp('create policy "' + name + '"[\\s\\S]*?;', "i"));
  if (!m) throw new Error('no policy named "' + name + '" in the sql/ folder');
  return m[0];
}

function functionBody(name) {
  const m = sql.match(new RegExp(
    "create or replace function public\\." + name + "[\\s\\S]*?\\$fn\\$;", "i"));
  if (!m) throw new Error(name + "() is not defined in the sql/ folder");
  return m[0];
}

await check("an assistant cannot approve their own week", () => {
  const p = policyBody("an assistant edits an open week");
  const at = p.toLowerCase().lastIndexOf("with check");
  if (at < 0) throw new Error("the assistant's update policy has no WITH CHECK at all, so it " +
    "constrains nothing about the row left behind");
  const leaves = p.slice(at);
  if (/'approved'/i.test(leaves)) {
    throw new Error("WITH CHECK admits 'approved' — an assistant holds UPDATE(status) on their " +
      "own week, so this is the only thing stopping them approving it themselves");
  }
  if (!/'submitted'/i.test(leaves)) {
    throw new Error("WITH CHECK does not admit 'submitted', so nobody can send a week at all");
  }
  return "admits draft, returned, submitted — not approved";
});

await check("a sent week is locked to the person who sent it", () => {
  const p = policyBody("an assistant edits an open week");
  const lower = p.toLowerCase();
  const using = p.slice(lower.indexOf("using"), lower.lastIndexOf("with check"));
  if (!/status\s+in\s*\(\s*'draft'\s*,\s*'returned'\s*\)/i.test(using)) {
    throw new Error("USING does not restrict which states may be touched — a week stays editable " +
      "after it is sent, and the total you approved is not necessarily the total in the row");
  }
  return "USING admits draft and returned only";
});

await check("days cannot be changed after the week is sent", () => {
  for (const n of ["an assistant writes days on an open week",
                   "an assistant edits days on an open week",
                   "an assistant clears days on an open week"]) {
    if (!/timesheet_open\s*\(/i.test(policyBody(n))) {
      throw new Error('"' + n + '" does not go through timesheet_open(), so locking the week ' +
        "leaves the hours in it editable — which locks nothing");
    }
  }
  const fn = functionBody("timesheet_open");
  if (!/status\s+in\s*\(\s*'draft'\s*,\s*'returned'\s*\)/i.test(fn)) {
    throw new Error("timesheet_open() does not look at the status, so every policy leaning on it " +
      "is open on every week");
  }
  if (!/owns_application\s*\(/i.test(fn)) {
    throw new Error("timesheet_open() does not check ownership — it would be open on everybody's weeks");
  }
  return "three policies, all through timesheet_open()";
});

await check("nobody may write who approved a timesheet", () => {
  const guarded = ["submitted_at", "decided_at", "decided_by"];
  const bad = [];
  for (const stmt of sql.replace(/--[^\n]*/g, " ").split(";")) {
    if (!/on\s+public\.timesheets\s+to\s+/i.test(stmt)) continue;
    const cols = stmt.match(/grant\s+(?:insert|update)\s*\(([^)]*)\)/i);
    if (cols) {
      for (const c of cols[1].split(",")) {
        const t = c.trim();
        if (guarded.includes(t)) bad.push(t + " is granted");
      }
      continue;
    }
    if (/grant\s+[a-z,\s]*\b(?:insert|update|all)\b[a-z,\s]*\s+on\s+public\.timesheets/i.test(stmt)) {
      bad.push("a table-level INSERT/UPDATE grant covers every column");
    }
  }
  if (bad.length) {
    throw new Error(bad.join("; ") + " — these are stamped by the trigger from the verified token. " +
      "Granted, they become numbers a request body can choose.");
  }
  return "submitted_at, decided_at, decided_by: trigger only";
});

await check("an assistant cannot rewrite why a week came back", () => {
  const fn = functionBody("timesheet_stamp");
  if (!/if\s+not\s+public\.has_permission\('applications\.edit'\)[\s\S]{0,200}?new\.note\s*:=\s*old\.note/i.test(fn)) {
    throw new Error("the trigger does not put note back for a non-staff writer. An assistant holds " +
      "UPDATE(note) on their own open week — staff and assistants are the same role, so the grant " +
      "cannot separate them and this is the only thing that does.");
  }
  if (!/create\s+trigger\s+timesheets_stamp\s+before\s+update\s+on\s+public\.timesheets/i.test(sql)) {
    throw new Error("timesheet_stamp() is defined but no BEFORE UPDATE trigger runs it");
  }
  return "note reverted for non-staff, trigger wired";
});

await check("a day cannot be filed against the wrong week", () => {
  const fn = functionBody("timesheet_day_in_week");
  if (!/worked_on\s*<\s*wk\s+or\s+new\.worked_on\s*>\s*wk\s*\+\s*6/i.test(fn)) {
    throw new Error("the trigger does not compare the day against both ends of its week, so hours " +
      "can be filed against any week and a weekly total stops meaning the hours worked in it");
  }
  if (!/create\s+trigger\s+timesheet_days_in_week\s+before\s+insert\s+or\s+update/i.test(sql)) {
    throw new Error("the function exists but no BEFORE INSERT OR UPDATE trigger runs it");
  }
  return "checked on insert and update";
});

/* A migration ships as code first and is pasted by hand some time later, so
   there is always a window where /hub asks for a table that does not exist.
   Inside Promise.all that rejection is not confined to the card that needed
   it — it takes leave and the notice board down too, and the whole portal
   reads "We could not open your portal just now". */
await check("the portal survives 030 not being pasted yet", () => {
  const hub = read("hub.html");
  const at = hub.indexOf('api("timesheets?select=');
  if (at < 0) throw new Error("the hub does not read timesheets at all");
  const call = hub.slice(at, at + 900);
  if (!/\.catch\(/.test(call)) {
    throw new Error("the timesheets request is not caught, so a missing table takes the whole " +
      "portal down and not just the hours card");
  }
  if (!/TS_OFF\s*=\s*true/.test(call)) {
    throw new Error("the failure is swallowed without recording it — the card would render as " +
      "merely empty and invite somebody to type hours that cannot save");
  }
  if (!/signed out[\s\S]{0,40}throw/.test(call)) {
    throw new Error("an expired session is caught here too, so the page shows an empty hours " +
      "card instead of asking them to sign in again");
  }
  return "caught, flagged, and a signed-out session still rethrows";
});

/* ── 032, the two rates ──────────────────────────────────────────────────
   Your cut is the gap between two numbers, and it stays confidential only
   because neither side can reach the other's. That property lives entirely in
   two policy bodies naming two different functions. Nothing about the page
   protects it, and nothing about it fails loudly when it goes. */

await check("neither side of a placement can read the other's rate", () => {
  const billing = policyBody("a client reads what they are charged");
  const pay = policyBody("an assistant reads what they are paid");

  if (!/is_placement_client\s*\(/i.test(billing)) {
    throw new Error("the billing rate is not fenced to the client of that placement");
  }
  if (/is_placement_assistant\s*\(/i.test(billing)) {
    throw new Error("an assistant can read what the client is charged — that is the cut, " +
      "visible to the person on the other side of it");
  }
  if (!/is_placement_assistant\s*\(/i.test(pay)) {
    throw new Error("the pay rate is not fenced to the assistant on that placement");
  }
  if (/is_placement_client\s*\(/i.test(pay)) {
    throw new Error("a client can read what the assistant is paid — that is the cut, " +
      "visible to the person paying it");
  }
  return "billing to the client, pay to the assistant, staff to both";
});

/* Two rates on one row cannot be fenced: a column grant separates roles, and a
   client and an assistant are both `authenticated`. The moment either rate is
   moved onto placements, the policy protecting it protects nothing. */
await check("the two rates are not on the same table", () => {
  const cols = Object.keys(columns(sql, "placements"));
  const money = cols.filter((c) => /rate|salary|pay|charge|cost|price/i.test(c));
  if (money.length) {
    throw new Error(money.join(", ") + " on placements — both sides can read that row, so a " +
      "rate living on it is readable by whichever of them was not meant to see it. " +
      "Rates belong in placement_billing and placement_pay.");
  }
  for (const t of ["placement_billing", "placement_pay"]) {
    const c = Object.keys(columns(sql, t));
    if (!c.includes("rate")) throw new Error(t + " has no rate column");
    if (c.length > 2) {
      throw new Error(t + " carries more than a placement and a rate (" + c.join(", ") +
        ") — anything else added here inherits that table's audience");
    }
  }
  return "placements holds no money; one rate per table";
});

/* The assistant must not learn from a page that a client asked to replace
   them. Only two things may read that table: the client who asked, and staff. */
await check("an assistant cannot read a swap request about them", () => {
  const p = policyBody("a client reads their own swap requests");
  if (/is_placement_assistant\s*\(|owns_application\s*\(/i.test(p)) {
    throw new Error("the assistant can read swap requests — somebody would find out from a " +
      "portal that a client asked for them to be replaced");
  }
  if (!/is_placement_client\s*\(/i.test(p)) {
    throw new Error("swap requests are not fenced to the client who raised them");
  }
  return "the client who asked, and staff";
});

await check("only one placement per assistant can be live", () => {
  if (!/create\s+unique\s+index[\s\S]{0,200}?on\s+public\.placements\s*\(application_id\)[\s\S]{0,120}?where\s+status\s+in\s*\(\s*'matched'\s*,\s*'trial'\s*,\s*'ongoing'\s*\)/i.test(sql)) {
    throw new Error("nothing stops a second live placement, so an assistant can be billed to " +
      "two clients for the same hours");
  }
  return "partial unique index on the live states";
});

/* ── 033, who a week belongs to and who may agree to it ─────────────────── */

await check("a page cannot choose who a week is billed to", () => {
  for (const stmt of sql.replace(/--[^\n]*/g, " ").split(";")) {
    if (!/on\s+public\.timesheets\s+to\s+/i.test(stmt)) continue;
    const cols = stmt.match(/grant\s+(?:insert|update)\s*\(([^)]*)\)/i);
    if (cols && cols[1].split(",").some((c) => c.trim() === "placement_id")) {
      throw new Error("placement_id is granted, so a request body can name the client a week " +
        "is billed to. The trigger works it out; nothing else may.");
    }
    if (!cols && /grant\s+[a-z,\s]*\b(?:insert|update|all)\b[a-z,\s]*\s+on\s+public\.timesheets/i.test(stmt)) {
      throw new Error("a table-level INSERT/UPDATE grant on timesheets covers placement_id");
    }
  }
  const fn = functionBody("timesheet_placement");
  if (/'matched'/.test(fn)) {
    throw new Error("a matched placement counts, so hours can be billed against a client the " +
      "assistant has only been introduced to");
  }
  if (!/new\.placement_id/.test(fn)) throw new Error("the trigger never sets placement_id");
  return "trigger only, and never a placement that has not started";
});

await check("a client can only decide a week that is waiting on them", () => {
  const p = policyBody("a client decides a week");
  const lower = p.toLowerCase();
  const using = p.slice(lower.indexOf("using"), lower.lastIndexOf("with check"));
  const leaves = p.slice(lower.lastIndexOf("with check"));

  if (!/status\s*=\s*'submitted'/i.test(using)) {
    throw new Error("a client can reach a week that is not submitted — a draft they should not " +
      "see the inside of, or an approved one whose number an invoice was already built from");
  }
  if (!/is_placement_client\s*\(/i.test(using)) {
    throw new Error("the policy does not check the client is the client of that placement");
  }
  if (/'draft'|'submitted'/i.test(leaves)) {
    throw new Error("WITH CHECK lets a client leave a week un-decided, which is a way to reopen " +
      "somebody else's week rather than answer it");
  }
  if (!/'approved'[\s\S]{0,30}'returned'|'returned'[\s\S]{0,30}'approved'/i.test(leaves)) {
    throw new Error("a client cannot both approve and send back");
  }
  return "submitted only, left approved or returned";
});

await check("anon holds nothing on the placement tables", () => {
  for (const t of ["clients", "placements", "placement_billing", "placement_pay", "swap_requests"]) {
    if (!new RegExp("revoke\\s+all\\s+on\\s+public\\." + t + "\\s+from\\s+[a-z_,\\s]*\\banon\\b", "i").test(sql)) {
      throw new Error("nothing revokes anon on " + t);
    }
    if (!new RegExp("alter\\s+table\\s+public\\." + t + "\\s+enable\\s+row\\s+level\\s+security", "i").test(sql)) {
      throw new Error("row-level security is never enabled on " + t);
    }
  }
  return "five tables, all revoked and all RLS on";
});

await check("anon holds nothing on the timesheet tables", () => {
  for (const t of ["timesheets", "timesheet_days"]) {
    if (!new RegExp("revoke\\s+all\\s+on\\s+public\\." + t + "\\s+from\\s+[a-z_,\\s]*\\banon\\b", "i").test(sql)) {
      throw new Error("nothing revokes anon on " + t);
    }
    const granted = sql.replace(/--[^\n]*/g, " ").split(";").some((s) =>
      new RegExp("grant[\\s\\S]*?on\\s+public\\." + t + "\\s+to\\s+[a-z_,\\s]*\\banon\\b", "i").test(s));
    if (granted) throw new Error(t + " is granted to anon somewhere");
    if (!new RegExp("alter\\s+table\\s+public\\." + t + "\\s+enable\\s+row\\s+level\\s+security", "i").test(sql)) {
      throw new Error("row-level security is never enabled on " + t);
    }
  }
  return "both revoked, both RLS on";
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
    const out = execFileSync(process.execPath, ["tools/test-steps.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {2}ok/gm) || []).length + " behaviours, both dialogs";
  } catch (e) {
    throw new Error("tools/test-steps.mjs failed — run it directly for the detail");
  }
});

/* Which Monday a week belongs to is worked out on the assistant's own clock,
   in their own timezone, and the database cannot check that for us — it only
   sees the date it is handed. A wrong answer files a week of hours against the
   week before and looks like nothing at all. */
await check("the timesheet's weeks and totals hold up", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync(process.execPath, ["tools/test-timesheet.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {2}ok/gm) || []).length + " behaviours";
  } catch (e) {
    throw new Error("tools/test-timesheet.mjs failed — run it directly for the detail");
  }
});

/* Everything else here checks a piece. This walks one person from applying to
   being billed for, through the cards the pages actually render and the real
   notify handler, and asserts what each party can see at every step —
   including that no screen ever holds both rates. */
await check("the whole walk holds together", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync(process.execPath, ["tools/simulate.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {4}ok/gm) || []).length + " behaviours, applied to billed";
  } catch (e) {
    throw new Error("tools/simulate.mjs failed — run it directly to see which step");
  }
});

await check("lead queue behaves", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync(process.execPath, ["tools/test-queue.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {2}ok/gm) || []).length + " behaviours";
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
/* One function may ask on another's behalf. owns_timesheet() reads no token
   itself; it asks owns_application(), which does. Demanding the primitives
   appear in every body would mean copying the ownership test into each new
   function, and 026 is explicit about why that is worse: one fence with two
   gates is a fence, two fences are two things to keep in step.

   So a body counts as gated if it names a primitive OR calls a function that
   is itself gated, worked out to a fixpoint. Delegating to something ungated
   still fails, which is the property worth keeping — verified by pointing
   owns_timesheet() at a stub that asks nothing and watching this go red. */
await check("SECURITY DEFINER functions check the caller", () => {
  const fns = [...sql.matchAll(
    /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)([\s\S]*?)\$fn\$([\s\S]*?)\$fn\$/gi
  )];
  if (!fns.length) return "no definer functions defined";

  const bodies = new Map(fns.map(([, name, , body]) => [name, body]));
  const gated = new Set();
  for (const [name, body] of bodies) {
    if (/has_permission|auth\.uid\(\)|auth\.jwt\(\)/i.test(body)) gated.add(name);
  }
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, body] of bodies) {
      if (gated.has(name)) continue;
      for (const other of gated) {
        if (new RegExp("public\\." + other + "\\s*\\(", "i").test(body)) {
          gated.add(name); grew = true; break;
        }
      }
    }
  }

  const ungated = [];
  const definers = [];
  for (const [, name, sig] of fns) {
    if (!/security\s+definer/i.test(sig)) continue;
    definers.push(name);
    if (!new RegExp("grant\\s+execute\\s+on\\s+function\\s+public\\." + name + "\\b[^;]*authenticated", "i").test(sql)) continue;
    if (!gated.has(name)) ungated.push(name);
  }
  if (ungated.length) {
    throw new Error(ungated.join(", ") + " — SECURITY DEFINER, executable by any signed-in " +
      "user, and never asks who is calling, directly or through anything it calls. " +
      "Gate it with has_permission() or auth.jwt().");
  }
  return definers.length + " gated: " + definers.join(", ");
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
