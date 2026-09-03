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
  "privacy.html", "terms.html", "refunds.html", "contact.html", "seats.html", "pay.html"]
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

/* 044 gave the database a place to record which migrations have landed, so
   that tools/status.mjs stops being blind to the ones PostgREST cannot see —
   a trigger function, a column granted to nobody. That only works if every
   migration from 044 on actually writes its number, and forgetting the line is
   both easy and silent: the file runs, the schema changes, and the one report
   that says what has landed simply never mentions it. Silence there reads as
   "no detector", which is exactly the answer that must stay true.

   Only from 044. The files before it cannot stamp themselves — editing a
   migration that has already been run is the one thing sql/README.md forbids —
   and 044 backfills those by detection instead. */
await check("every migration since 044 stamps its number", () => {
  const missing = [];
  let stamped = 0;
  for (const f of sqlFiles) {
    const n = Number((f.match(/^(\d+)/) || [])[1]);
    if (!Number.isFinite(n) || n < 44) continue;
    /* Comments out first: 044 quotes the line it is asking for in its own
       header, and a check satisfied by the prose about it is not a check. */
    const body = read(SQL_DIR + "/" + f).replace(/--[^\n]*/g, " ");
    const stamp = new RegExp(
      "insert\\s+into\\s+public\\.schema_migrations\\b[^;]*?\\bvalues\\s*\\(\\s*" + n + "\\s*\\)", "i");
    if (stamp.test(body)) stamped++;
    else missing.push(f);
  }
  if (missing.length) {
    throw new Error(missing.join(", ") + " — add `insert into public.schema_migrations (n) " +
      "values (<number>) on conflict (n) do nothing;` as the last statement, or nothing will " +
      "ever report whether it ran");
  }
  return stamped ? stamped + " stamped, 001–043 by detection in 044" : "none since 044 yet";
});

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

  /* The sibling of the check above, and it cost a lead in exactly the same
     shape. A CHECK constraint that a form can exceed is not a validation, it
     is a refusal — PostgREST answers 400, post() reads any 4xx as the
     payload's own fault, and the visitor is handed the write-it-yourself email
     over a quote the page had already shown them.

     index.html clamped custom hours to 200 while seat_requests_sane permitted
     168, so anybody staffing four or five seats fell into it. Nothing caught
     that: every field had a column, the arithmetic was rounded, and the number
     was simply larger than the database would take. */
  await check(p.file + ": a number the form allows is a number the table takes", () => {
    const html = read(p.file);
    const bounds = [];
    /* `coalesce(hours, 0) between 0 and 168` — the constraint's own words. */
    for (const m of sql.matchAll(
      /coalesce\(\s*([a-z_]+)\s*,\s*\d+\s*\)\s+between\s+(-?\d+)\s+and\s+(\d+)/gi)) {
      if (m[1] in keys) bounds.push({ col: m[1], lo: Number(m[2]), hi: Number(m[3]) });
    }
    const bad = [];
    for (const b of bounds) {
      /* Math.min(n, 200) is how a form says "no larger than this". */
      for (const m of html.matchAll(/Math\.min\(\s*[A-Za-z_$][\w$]*\s*,\s*(\d+)\s*\)/g)) {
        if (Number(m[1]) > b.hi) {
          bad.push(b.col + ": the page clamps at " + m[1] + ", the table stops at " + b.hi);
        }
      }
    }
    if (bad.length) {
      throw new Error(bad.join("; ") + " — a value between the two is quoted on screen and " +
        "then refused by the constraint, and the lead goes to the email fallback");
    }
    return bounds.length
      ? bounds.map((b) => b.col + " <= " + b.hi).join(", ") + " agreed with the form"
      : "no bounded numeric columns on this form";
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

/* The check above guards a select list against a grant, and skips `*` because
   asking for everything cannot name a column it failed to ask for. The queue is
   read with select=*, so it fell in that gap entirely: the page reads fields off
   the row in JavaScript, and nothing tied those names to what the view returns.

   `a.experience` was undefined for every applicant since the view was first
   written. It reads `a.experience || "?"`, so every row in /admin showed `?`
   where the answer should be — for a question every applicant is asked, whose
   answer is stored, and which is quoted back to them in their own confirmation
   email. A missing column and an unanswered question look identical once a
   fallback has spoken for both, which is why this reads the view rather than
   trusting the page.

   The rule: a field the row renderer reads is either a column the view selects,
   or one the page attaches itself after fetching — and the second list is read
   out of the page, not kept here, so it cannot drift. */
await check("the queue page reads only fields the queue view returns", () => {
  const defs = [...sql.matchAll(
    /create\s+(?:or\s+replace\s+)?view\s+public\.application_queue\b([\s\S]*?);/gi)];
  if (!defs.length) throw new Error("no create view public.application_queue found in sql/");

  /* Strip comments before splitting: the last definition has a comma inside a
     comment, and splitting first turns that prose into two column names. */
  const body = defs[defs.length - 1][1].replace(/--[^\n]*/g, "");
  const list = body.slice(body.search(/\bselect\b/i) + 6, body.search(/\bfrom\s+public\./i));

  /* Top-level commas only — score_avg and is_ghosted are parenthesised. */
  const items = [];
  let depth = 0, cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { items.push(cur); cur = ""; continue; }
    cur += ch;
  }
  items.push(cur);

  const returned = new Set(items.map((s) => s.trim()).filter(Boolean).map((s) => {
    const as = s.match(/\bas\s+([a-z_][a-z0-9_]*)\s*$/i);
    return as ? as[1] : s.split(".").pop().trim();
  }));
  if (returned.size < 10) throw new Error("only parsed " + returned.size + " columns out of the view");

  const page = read("admin.html");

  /* Anything the page sets on a row after the fetch — socials, docs, disc, sit
     come from four separate queries and are never the view's to return. */
  const attached = new Set(
    [...page.matchAll(/\ba\.([a-z_][a-z0-9_]*)\s*=[^=]/g)].map((m) => m[1]));

  /* Every function that is handed a queue row. */
  const FNS = ["rowHtml", "skillLine", "discLine", "sitLine", "contactLine", "scoreLine"];
  const asked = new Map();
  for (const fn of FNS) {
    const at = page.indexOf("function " + fn + "(a)");
    if (at < 0) throw new Error("no function " + fn + "(a) in admin.html — renamed? this check reads it by name");
    let d = 0, end = at;
    for (let i = page.indexOf("{", at); i < page.length; i++) {
      if (page[i] === "{") d++;
      else if (page[i] === "}") { d--; if (d === 0) { end = i; break; } }
    }
    for (const m of page.slice(at, end).matchAll(/\ba\.([a-z_][a-z0-9_]*)/g)) {
      if (!asked.has(m[1])) asked.set(m[1], fn);
    }
  }

  const missing = [...asked].filter(([c]) => !returned.has(c) && !attached.has(c));
  if (missing.length) {
    throw new Error("read off a queue row but not returned by application_queue: " +
      missing.map(([c, fn]) => c + " (in " + fn + ")").join(", ") +
      " — the row is fetched with select=*, so a column the view never selected " +
      "arrives undefined and the fallback beside it prints instead of the answer. " +
      "Add it to the view, or stop reading it.");
  }
  return asked.size + " fields read, all returned by the view or set by the page";
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

/* The LAST definition, not the first. A function may be replaced by a later
   migration — notify_decision is written in 031, again in 035 and again in
   037 — and the one the database ends up running is the last file to define
   it. Reading the first would check a version that no longer exists, which is
   worse than not checking: it passes or fails on dead code. */
function functionBody(name) {
  const all = [...sql.matchAll(new RegExp(
    "create or replace function public\\." + name + "[\\s\\S]*?\\$fn\\$;", "gi"))];
  if (!all.length) throw new Error(name + "() is not defined in the sql/ folder");
  return all[all.length - 1][0];
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

/* A row must satisfy EVERY check constraint on its table, so two constraints
   naming different status lists is not two opinions — it is the narrower one
   winning, silently, forever.

   003 wrote applications_status_valid with five stages. 026 added `hired` by
   creating applications_status_check under a new name instead of replacing the
   first, so the old one kept vetoing it. Hired was unreachable from that day
   until 038, and looked fine because nobody had tried.

   This walks the folder in order, tracks whether each named constraint ends up
   added or dropped, and requires every one still standing to permit the same
   set. */
await check("only one live constraint decides which stages exist", () => {
  const live = new Map();                       /* name -> Set of statuses */
  const text = sql.replace(/--[^\n]*/g, " ");

  for (const m of text.matchAll(
    /alter\s+table\s+(?:only\s+)?public\.(\w+)\s+drop\s+constraint\s+if\s+exists\s+(\w+)/gi)) {
    live.delete(m[2].toLowerCase());
  }
  /* Adds are collected after drops only if they appear later; walk both in one
     pass over the text so file order decides. */
  live.clear();
  const events = [...text.matchAll(
    /alter\s+table\s+(?:only\s+)?public\.(\w+)\s+(drop\s+constraint\s+if\s+exists\s+(\w+)|add\s+constraint\s+(\w+)\s+check\s*\(\s*status\s+in\s*\(([^)]*)\))/gi)];
  for (const e of events) {
    const table = e[1].toLowerCase();
    if (table !== "applications") continue;
    if (e[3]) live.delete(e[3].toLowerCase());
    else if (e[4]) {
      live.set(e[4].toLowerCase(),
        new Set(e[5].split(",").map((s) => s.trim().replace(/'/g, "")).filter(Boolean)));
    }
  }

  if (!live.size) throw new Error("nothing constrains applications.status any more");
  const lists = [...live.entries()];
  const first = [...lists[0][1]].sort().join(",");
  for (const [name, set] of lists.slice(1)) {
    const here = [...set].sort().join(",");
    if (here !== first) {
      throw new Error(lists[0][0] + " allows [" + first + "] and " + name + " allows [" + here +
        "] — both are live, so only the stages in BOTH are reachable. Replacing a constraint " +
        "under a new name doubles it rather than replacing it.");
    }
  }
  return lists.length + " live, all agreeing on " + live.get(lists[0][0]).size + " stages";
});

/* One CASE cannot cover four table shapes. PL/pgSQL prepares an expression as
   a single statement, so every field reference in it resolves against the
   actual record type of NEW — including the branches not taken. 035 added
   new.started_on to a placements branch and every application stage change in
   /admin started failing with `record "new" has no field "started_on"`, which
   no test here caught because none of them run Postgres.

   The shape is the thing to forbid: separate IF branches per table, so a
   branch that is not reached is never prepared. */
await check("the notify trigger does not read fields across table shapes", () => {
  const fn = functionBody("notify_decision");
  const body = fn.replace(/--[^\n]*/g, " ");
  const bad = [...body.matchAll(/case\s+tg_table_name([\s\S]*?)\bend\b/gi)];
  for (const [, arm] of bad) {
    const fields = [...arm.matchAll(/\bnew\.([a-z_]+)/gi)].map((m) => m[1].toLowerCase());
    const shared = new Set(["id", "status", "application_id", "client_id"]);
    const risky = [...new Set(fields.filter((f) => !shared.has(f)))];
    if (risky.length > 1) {
      throw new Error("a CASE on tg_table_name reads " + risky.join(", ") + " — those do not all " +
        "exist on every table this fires for, and PL/pgSQL resolves every branch. " +
        "Use separate IF blocks so an untaken branch is never prepared.");
    }
  }
  if (!/if\s+tg_table_name\s*=\s*'applications'/i.test(body)) {
    throw new Error("the per-table branches are gone — the payload is being built some other way");
  }
  return "per-table IF blocks, no cross-shape CASE";
});

/* 039. The hub asks for the placement with the business nested in, and an
   embed PostgREST is not allowed to read comes back null rather than as an
   error — so the page renders, the card is headed with its own fallback
   string, and nothing anywhere says no. It went out that way and was found by
   clicking.

   simulate.mjs cannot catch it: it hands the portal a PLACE with
   clients: { name } already filled in, which is the answer RLS refused. So
   the guard is here, against the policy itself. */
await check("an assistant may read the business she is placed with", () => {
  /* The query is built by concatenation and lands in hub.html split across
     two lines, so the quotes and the + have to come out before the URL can be
     read as one string. The first version of this check did not do that,
     matched nothing, and reported "nothing to guard" — passing green over the
     exact bug it was written for. */
  const hub = existsSync("hub.html")
    ? read("hub.html").replace(/"\s*\+\s*\n?\s*"/g, "")
    : "";
  if (!/placements\?select=[^"'`]*clients\(/.test(hub)) {
    throw new Error("the hub no longer asks for clients( … ) inside its placements query — " +
      "either the embed moved and this check needs rewriting, or it was dropped and " +
      "the client card has no name to show");
  }
  const policies = sql.split(";").filter((s) =>
    /create\s+policy[\s\S]*on\s+public\.clients\s+for\s+select/i.test(s));
  if (!policies.length) throw new Error("no SELECT policy on public.clients at all");
  const reaches = policies.some((p) => /is_client_assistant/i.test(p));
  if (!reaches) {
    throw new Error("the hub embeds clients(name) but no SELECT policy on public.clients " +
      "lets the placed assistant read it — the embed returns null and the card " +
      "falls through to \"your client\". Nothing errors, so only a person clicking finds it.");
  }
  /* Counting statements across every file, not live policies — 032 writes one
     and 039 replaces it by name, so both are in the folder for good. */
  return "the placed assistant is named in the policy";
});

/* seat_requests is the enquiry form on the home page. A client we matched by
   hand in /admin never filled it in, so they have no row in it — and /seats
   returned early on that emptiness, which meant the placement, the week
   waiting to be approved and the statement were unreachable for every client
   who arrived the way clients actually arrive. The page rendered, said
   "Nothing here under this address yet", and was wrong.

   Nothing could catch it but a person signing in as a client, because the two
   halves of that page come from two different tables and only one of them was
   empty. */
await check("a client with no seat request still sees their placement", () => {
  if (!existsSync("seats.html")) return "no seats page";
  const html = read("seats.html");
  const at = html.indexOf("if (!rows.length) {");
  if (at < 0) throw new Error("the empty-seats branch is gone — this check needs rewriting");
  const end = html.indexOf("return;", at);
  if (end < 0) throw new Error("could not find the end of the empty-seats branch");
  const branch = html.slice(at, end);
  if (!/clientBlock\(\)/.test(branch)) {
    throw new Error("the no-seat-request branch never calls clientBlock() — a client " +
      "matched in /admin has no seat_requests row, so they would see " +
      '"Nothing here under this address yet" while a week sits waiting for them to approve');
  }
  if (!/wireClient\(\)/.test(branch)) {
    throw new Error("the no-seat-request branch renders the placement but never calls " +
      "wireClient(), so the approve and decline buttons do nothing");
  }
  return "placement and its buttons reachable with no seat request";
});

/* These pages talk to GoTrue's REST API directly rather than through
   supabase-js, and the two disagree about where the return address goes.
   supabase-js takes options: { emailRedirectTo }. The REST endpoint takes
   ?redirect_to= and silently ignores a body it does not recognise — so the
   wrong shape does not fail, it falls back to the project's Site URL and
   drops people on the home page, which has nothing that reads an auth
   fragment. The token sits in the address bar and the account stays
   unconfirmed, which from the outside is indistinguishable from an email that
   never arrived.

   It was fixed on recover and left on signup, and cost an afternoon. */
await check("email links come back to the page that sent them", () => {
  const src = read("tools/build-portal.mjs");
  const wrong = src.match(/options\s*:\s*\{[^}]*(?:emailRedirectTo|redirectTo)/);
  if (wrong) {
    throw new Error("an auth call passes the return address as options: { emailRedirectTo } — " +
      "that is the supabase-js shape and the REST endpoint ignores it. Use " +
      "?redirect_to= on the path instead.");
  }
  const missing = [];
  for (const call of ["signup", "recover", "resend"]) {
    const re = new RegExp('authPost\\("' + call + '([^"]*)"');
    const m = src.match(re);
    if (!m) continue;
    if (!/redirect_to=/.test(m[1])) missing.push(call);
  }
  if (missing.length) {
    throw new Error("no redirect_to on: " + missing.join(", ") +
      " — the link will fall back to the project Site URL rather than the portal " +
      "the person was standing on");
  }
  return "signup, recover and resend all carry a return address";
});

/* 034 ties a week to a placement when the week is created and never again, and
   its lookup skips placements still at `matched`. That was fine while matched
   lasted seconds — staff matched somebody and moved them to trial in the same
   sitting. 042 turned that window into days, because the placement now waits on
   the client to confirm a start date, and meanwhile the assistant has been told
   she has a client and her portal is open.

   Every hour recorded in that wait belonged to nobody: never billed, never on a
   statement, and no screen anywhere saying so. 043 adopts them when the
   placement goes live. */
await check("a week worked before the client says yes is not stranded", () => {
  const fn = sql.match(/function\s+public\.adopt_orphan_weeks\(\)[\s\S]*?\$fn\$;/i);
  if (!fn) {
    throw new Error("nothing adopts weeks recorded while a placement is still matched — " +
      "034 stamps only on insert and skips matched placements, so those weeks keep a null " +
      "placement_id for good and can never be billed");
  }
  const trg = sql.split(";").find((s) =>
    /create\s+trigger\s+placement_adopts_its_weeks/i.test(s));
  if (!trg) throw new Error("adopt_orphan_weeks exists but no trigger ever runs it");
  if (!/old\.status\s*=\s*'matched'/i.test(trg)) {
    throw new Error("the adoption trigger does not restrict itself to the move out of matched, " +
      "so it re-runs on every rate change and status nudge");
  }
  /* The half that keeps 034's promise: a week that already has a placement is
     never touched, because moving one retroactively moves money already billed. */
  if (!/placement_id\s+is\s+null/i.test(fn[0])) {
    throw new Error("adoption does not limit itself to weeks with no placement — restamping one " +
      "that already has a placement moves money that has already been billed, which is the " +
      "whole reason 034 stamps once");
  }
  return "orphans adopted, stamped weeks left alone";
});

/* 042 lets a client say when work starts. The obvious build — a policy letting
   them update their own placement row — would also let them rewrite
   hours_per_week and trial_weeks, because a policy gates rows and the grant on
   those columns is shared with every other authenticated person. The two
   numbers that decide what they pay would become theirs to edit.

   So the confirmation is its own row and placements stays staff-writable. This
   fails if anybody ever takes the shortcut. */
await check("a client cannot write the terms they are billed on", () => {
  const updates = sql.split(";").filter((s) =>
    /create\s+policy[\s\S]*on\s+public\.placements\s+for\s+update/i.test(s));
  const loose = updates.filter((p) => /is_placement_client|is_client_contact/i.test(p));
  if (loose.length) {
    throw new Error("a client can UPDATE public.placements — the grant on that table covers " +
      "hours_per_week and trial_weeks, and a policy cannot separate columns. Their side of a " +
      "placement belongs in its own table, the way placement_starts and swap_requests are.");
  }
  if (!/create\s+table[^;]*public\.placement_starts/i.test(sql)) {
    return "no placement_starts yet — nothing else to guard";
  }
  const ins = sql.split(";").filter((s) =>
    /create\s+policy[\s\S]*on\s+public\.placement_starts\s+for\s+insert/i.test(s));
  if (!ins.some((p) => /is_placement_client/i.test(p))) {
    throw new Error("nothing lets the client confirm their own start date");
  }
  /* confirmed_by is the record of who agreed a date, so it is stamped from the
     token rather than sent. A grant on it would make it the browser's word. */
  if (/grant\s+insert\s*\([^)]*confirmed_by[^)]*\)\s*on\s+public\.placement_starts/i.test(sql)) {
    throw new Error("confirmed_by is grantable, so the page could send any name it liked — " +
      "the trigger stamps it from the token for exactly that reason");
  }
  return "the client names a day and nothing else";
});

/* session() used to clear storage the moment the access token expired, which
   threw the refresh token away with it. So an hour was a hard cap on being
   signed in, and it never announced itself — it simply refused the next thing
   you did. It cost a half-filled match form in /admin, where the first click
   reported nothing at all and the second said "signed out".

   The refresh token was written by two code paths and read by none. This is
   the kind of bug that looks like an ordinary session timeout for as long as
   nobody asks why the timeout is exactly an hour. */
await check("an expired token is renewed, not thrown away", () => {
  const src = read("tools/build-portal.mjs");
  if (!/grant_type=refresh_token/.test(src)) {
    throw new Error("nothing uses the refresh token — the session dies when the access " +
      "token expires and drops whoever is signed in, mid-task, with their work on screen");
  }

  const sAt = src.indexOf("function session()");
  const sEnd = src.indexOf("function tokenLive", sAt);
  if (sAt < 0 || sEnd < 0) throw new Error("session()/tokenLive are gone — this needs rewriting");
  if (/clearSession\(\)/.test(src.slice(sAt, sEnd))) {
    throw new Error("session() clears storage when the token has merely aged, which throws the " +
      "refresh token away with it — the exact bug that capped every sign-in at an hour");
  }

  const aAt = src.indexOf("function api(");
  const aEnd = src.indexOf("function storageBase", aAt);
  if (aAt < 0 || aEnd < 0) throw new Error("api() is gone — this needs rewriting");
  if (!/refreshSession\(\)/.test(src.slice(aAt, aEnd))) {
    throw new Error("api() never renews, so a 401 half way through a form ends the session " +
      "rather than retrying once with a fresh token");
  }
  return "renews on expiry and once on a 401";
});

/* A day saves on the change event, which fires on blur — so the write lands
   while the person is already typing in the next box. saveDay() used to finish
   by calling paintHours(), which replaces the card's innerHTML: the half-typed
   number went with the old DOM, along with the focus, and nothing said so. The
   only sign was the total refusing to add up. Filling a week in at speed lost
   three days out of five, and each one looked like a slip of the hand.

   Found by doing it, not by reading it. */
/* The week row is made on the first day somebody types. Five boxes filled at
   speed call ensureSheet five times before any returns, and without a held
   promise each one posts its own week — the unique key refuses four, and four
   days are silently dropped. Same shape as the token refresh: work that must
   happen once has to be held, not merely checked for.

   It hid behind the redraw bug. Once the boxes stopped being wiped, the three
   lost days sat on screen looking saved, and only the running total disagreed.
   A failed save must also put the box back, or the screen keeps the lie. */
await check("the week is made once, however fast the days are typed", () => {
  const src = read("tools/build-portal.mjs");
  const at = src.indexOf("function ensureSheet(");
  if (at < 0) throw new Error("ensureSheet is gone — this check needs rewriting");
  const end = src.indexOf("function saveDay(", at);
  const body = src.slice(at, end);
  /* The guard itself, not merely the word. The first version of this looked
     for /MAKING/ anywhere in the function, which the assignments alone satisfy
     — so it stayed green with the early return deleted, over the exact bug it
     was written for. Twice in one day. */
  if (!/if\s*\(\s*MAKING[^)]*\)\s*return\s+MAKING\s*;/.test(body)) {
    throw new Error("ensureSheet does not return the in-flight request — days typed together " +
      "each post their own week, the unique key refuses all but one, and every day that lost " +
      "is dropped without a word");
  }
  const sAt = src.indexOf("function saveDay(");
  const sEnd = src.indexOf("function wireHours", sAt);
  if (!/hrsEl\.value =/.test(src.slice(sAt, sEnd))) {
    throw new Error("a failed day save leaves the typed number on screen, so the page shows " +
      "an hour that was never stored — put the box back to what the database holds");
  }
  return "one week per burst, and a refused day is put back";
});

await check("saving a day does not redraw the boxes", () => {
  if (!existsSync("hub.html")) return "no hub page";
  const html = read("hub.html");
  const at = html.indexOf("function saveDay(");
  if (at < 0) throw new Error("saveDay is gone — this check needs rewriting");
  const end = html.indexOf("function wireHours", at);
  if (end < 0) throw new Error("could not find the end of saveDay");
  const body = html.slice(at, end);
  if (/paintHours\(\)/.test(body)) {
    throw new Error("saveDay calls paintHours(), which replaces the card's innerHTML — " +
      "the save fires on blur, so it lands while the person is typing the next day and " +
      "throws that number away with the old DOM");
  }
  if (!/refreshTotals\(\)/.test(body)) {
    throw new Error("saveDay never refreshes the total, so the running figure and the " +
      "send button go stale until something else redraws the card");
  }
  return "totals refresh, inputs left alone";
});

/* Every file in api/ is a URL on the public internet. notify describes real
   applicants and invite mails real people, so both stand on the same shared
   secret and both must refuse when it is unset rather than defaulting open. */
await check("every endpoint checks the shared secret", () => {
  const dir = "api";
  if (!existsSync(dir)) return "no api/ folder";
  const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
  if (!files.length) throw new Error("no endpoints found in api/");
  for (const f of files) {
    const src = read(dir + "/" + f);
    if (!/process\.env\.WEBHOOK_SECRET/.test(src)) {
      throw new Error("api/" + f + " never reads WEBHOOK_SECRET — it is open to anyone");
    }
    if (!/x-webhook-secret/.test(src)) {
      throw new Error("api/" + f + " reads the secret but never compares the header");
    }
    if (!/if\s*\(\s*!expected\s*\)/.test(src)) {
      throw new Error("api/" + f + " does not refuse when WEBHOOK_SECRET is unset — " +
        "an endpoint with no secret configured must close, not open");
    }
  }
  return files.length + " endpoint(s), all gated";
});

/* 040 chose the publishable key over the service-role key deliberately. The
   service key ignores every policy in this database, and the whole argument
   here is that the database decides who sees what — so it does not belong in
   a web-facing function, and this fails the build if one ever arrives. */
await check("no endpoint holds a key that bypasses the database", () => {
  const dir = "api";
  if (!existsSync(dir)) return "no api/ folder";
  const bad = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    const src = read(dir + "/" + f);
    if (/SERVICE_ROLE|service_role|SUPABASE_SECRET|sb_secret_/.test(src.replace(/^\s*\*.*$/gm, ""))) {
      bad.push(f);
    }
  }
  if (bad.length) {
    throw new Error("service-role credentials referenced in api/" + bad.join(", api/") +
      " — that key ignores every RLS policy. /auth/v1/otp with create_user does " +
      "the same job with the publishable key; see 040.");
  }
  return "publishable key only";
});

/* /hub and /seats each shadowed the shared signedOut() with a Google button
   and nothing else, while signInPassword, signUpPassword and resetPassword sat
   defined and uncalled in both files. Nothing errored: the page rendered, the
   button worked, and it worked for everybody who happened to have a Google
   account. An assistant who set a password on /status could not open her own
   portal, and a client contact on a company address had no door at all —
   they never apply, so they never had a /status account either.

   admin.html is not in this list and that is deliberate: the staff desk is the
   most privileged page here, access is granted by an administrator rather than
   asked for, and one narrow door is the design. */
await check("no portal offers only one way in", () => {
  const doors = [];
  for (const f of ["status.html", "hub.html", "seats.html"]) {
    if (!existsSync(f)) continue;
    const html = read(f);
    const google = /gbtn/.test(html);
    const form = /id="pw" novalidate/.test(html);
    const wired = /signInPassword\(em, pwd\)/.test(html);
    if (!google) throw new Error(f + " offers no Google sign-in");
    if (!form || !wired) {
      throw new Error(f + " offers Google and nothing else" +
        (form ? " — the form is there but nothing calls signInPassword" : "") +
        ". Anybody whose address is not a Google account cannot reach it, and " +
        "the page will not say so — it just shows them one button that is no use.");
    }
    doors.push(f.replace(".html", ""));
  }
  if (!doors.length) throw new Error("no portal pages found to check");
  return doors.join(", ") + " — Google, password, and a way to make one";
});

/* The same hole in the other direction, and the reason this one is separate:
   039 guarded the assistant's view of the client, and the client's view of the
   assistant went on being broken for another day because the check only
   watched the side that had been fixed. A mirror bug needs a mirror check.

   041 could not repeat 039's move — applications is the core table and 018
   grants all of it to authenticated, so the one field a client may see is
   mirrored into application_public instead. The embed must point there, not at
   applications, or the fix silently reverts to a null and a fallback string. */
await check("a client may read the name of the assistant placed with them", () => {
  if (!existsSync("seats.html")) return "no seats page";
  const html = read("seats.html").replace(/"\s*\+\s*\n?\s*"/g, "");
  const q = html.match(/placements\?select=[^"'`]+/);
  if (!q) return "the client portal no longer reads placements — nothing to guard";
  if (/\bapplications\(/.test(q[0])) {
    throw new Error("the client portal embeds applications( … ) — 018 grants that whole " +
      "table to authenticated, so any policy that lets a client read it also hands over " +
      "the email, phone, CV and skill ratings. Read application_public instead.");
  }
  /* 041 shipped it as an embed and PostgREST answered 400: there is no foreign
     key between placements and application_public, and both pointing at
     applications is not a relationship it can traverse. loadClient catches a
     failure there by hiding the entire client block, so the portal said
     "Nothing here under this address yet" over a live placement. */
  if (/application_public\(/.test(q[0])) {
    throw new Error("the client portal embeds application_public( … ) inside its placements " +
      "select — there is no foreign key between those tables, so PostgREST refuses the whole " +
      "query with 400 and loadClient hides the client's entire portal. Read it separately.");
  }
  if (!/application_public\?select=/.test(html)) {
    throw new Error("the client portal reads no name for the assistant — the card falls " +
      'through to "your assistant"');
  }
  const policies = sql.split(";").filter((s) =>
    /create\s+policy[\s\S]*on\s+public\.application_public\s+for\s+select/i.test(s));
  if (!policies.some((p) => /is_application_client/i.test(p))) {
    throw new Error("nothing lets the placed client read application_public, so the embed " +
      "returns null exactly as applications( … ) did");
  }
  return "the client reads a name, and only a name";
});

/* The other half of 039: the name is readable because everything worth
   hiding left the table. If a private column comes back, the policy above
   hands it to her along with the name. */
await check("nothing private is left on clients", () => {
  const back = [];
  for (const m of sql.matchAll(/alter\s+table\s+public\.clients\s+add\s+column[^;]*/gi)) {
    const col = (m[0].match(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_]+)/i) || [])[1];
    if (col && /contact|email|notes|billing|rate|phone|address/i.test(col)) back.push(col);
  }
  if (back.length) {
    throw new Error("private columns added back to clients: " + back.join(", ") +
      " — both sides of a placement read that table now. They belong in client_private.");
  }
  return "id and name only";
});

await check("anon holds nothing on the placement tables", () => {
  for (const t of ["clients", "client_private", "application_public", "placements", "placement_billing", "placement_pay", "swap_requests", "placement_starts"]) {
    if (!new RegExp("revoke\\s+all\\s+on\\s+public\\." + t + "\\s+from\\s+[a-z_,\\s]*\\banon\\b", "i").test(sql)) {
      throw new Error("nothing revokes anon on " + t);
    }
    /* A revoke is only the state at that line. A later migration granting the
       table straight back leaves the revoke sitting there and this check green,
       which is how a check goes on passing over the thing it was written to
       catch. The timesheet check below has always asked this; these eight are
       the ones holding both rates, so they need it more. */
    const granted = sql.replace(/--[^\n]*/g, " ").split(";").some((s) =>
      new RegExp("grant[\\s\\S]*?on\\s+public\\." + t + "\\s+to\\s+[a-z_,\\s]*\\banon\\b", "i").test(s));
    if (granted) throw new Error(t + " is granted to anon somewhere");
    if (!new RegExp("alter\\s+table\\s+public\\." + t + "\\s+enable\\s+row\\s+level\\s+security", "i").test(sql)) {
      throw new Error("row-level security is never enabled on " + t);
    }
  }
  return "eight tables, all revoked, none granted back, all RLS on";
});

/* The assessment decides whether somebody gets an interview, so the two ways
   it can quietly stop measuring anything are both checked here.

   Neither fails loudly on its own: a key that has drifted from the item bank
   marks the wrong option correct and every applicant simply gets a wrong
   score, and answers clustered in one column turn the whole thing into a
   question about whether you noticed the pattern. */
/* All four keys, and only the newest copy of each.

   This read the first key it found in the whole sql/ folder, which worked
   while there was one bank in one file. There are now four banks, and the
   scenario key alone appears in three files — 045 wrote it, 048 carried it
   forward, 049 carries it again — because a migration is never edited after it
   has run, so each replacement of the scoring function repeats what it needs.
   Only the last copy is the one Postgres is running. */
await check("the assessment key matches its item bank", async () => {
  const { BANKS } = await import("./assessment-items.mjs");

  /* Each key sits under a comment naming its bank, in the file that most
     recently replaced score_assessment(). Read the file, not the folder. */
  const newest = sqlFiles
    .filter((f) => read(SQL_DIR + "/" + f).includes("create or replace function public.score_assessment"))
    .sort()
    .pop();
  if (!newest) throw new Error("nothing in sql/ defines score_assessment()");
  const body = read(SQL_DIR + "/" + newest);

  const HEADING = {
    scenarios: "the judgement scenarios",
    english:   "english",
    detail:    "detail",
    sales:     "sales"
  };

  const said = [];
  for (const [name, bank] of Object.entries(BANKS)) {
    const mark = "── " + HEADING[name];
    const at = body.indexOf(mark);
    if (at < 0) {
      throw new Error(name + ": no key in " + newest + " — the page will collect answers that " +
        "nothing scores, and everybody sitting it gets a zero on " + name);
    }
    const stop = body.indexOf("as t(q, pts)", at);
    const rows = [...body.slice(at, stop).matchAll(/\(\s*(\d+),\s*array\[([\d,\s]+)\]\)/g)]
      .map((m) => [Number(m[1]), m[2].split(",").map((n) => Number(n.trim()))]);

    if (rows.length !== bank.length) {
      throw new Error(name + ": " + rows.length + " items in the SQL key, " + bank.length +
        " in tools/assessment-items.mjs — re-generate the key in " + newest);
    }
    for (let i = 0; i < bank.length; i++) {
      const want = bank[i][1].map((o) => o[1]);
      const got = (rows.find((r) => r[0] === i) || [])[1];
      if (!got || got.join() !== want.join()) {
        throw new Error(name + " item " + i + ": the SQL key says [" + (got || []).join() +
          "] and the item bank says [" + want.join() + "] — every applicant is scored wrong");
      }
    }
    said.push(name + " " + bank.length);
  }
  return said.join(", ") + " — every key identical to its bank, in " + newest;
});

/* Hiding something has to actually hide it.

   The hidden attribute gets display:none from the browser's own stylesheet,
   and any author rule setting display beats it. So `el.setAttribute("hidden")`
   does nothing to an element some other rule gave a display to — and it fails
   silently, because the JS is correct and the element is simply still there.

   This project hit it five times and patched one element at a time each time:
   .mobnav, .step, .intake__foot, .logos, and finally .cform, where the contact
   form stayed on screen after a successful send with its Send button reading
   "Sending…" for ever. Found by pressing the button, not by reading the code,
   which is exactly why it needs a check rather than another patch. */
await check("hiding an element actually hides it", () => {
  const PAGES = ["index.html", "careers.html", "contact.html",
                 "status.html", "admin.html", "hub.html", "seats.html", "pay.html"]
    .filter((f) => existsSync(f));

  const RULE = /\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*\}/;
  const missing = PAGES.filter((f) => !RULE.test(read(f)));

  if (missing.length) {
    throw new Error(missing.join(", ") + " — no `[hidden]{display:none!important}`. " +
      "Every one of these pages hides something with the attribute, and one " +
      "display rule anywhere in the stylesheet is enough to make that do nothing at all. " +
      "The rule lives in careers.html inside the block lib-chrome.mjs lifts, which is how " +
      "the five generated pages get it.");
  }
  return PAGES.length + " pages, hidden beats every display rule on all of them";
});

/* A migration that has been superseded has to say so.

   Every file in sql/ says "Safe to re-run: yes", and every one of them is —
   on its own. What none of them said is that running an OLD file after a newer
   one puts its own versions of any function they share straight back, because
   `create or replace` does exactly what it says.

   That is not theoretical. 045 was re-run after 048, 049 and 051 and took all
   three with it: the send button went back to the version that matches nobody,
   and the scoring went back to English meaning typing speed. Columns are added
   with `if not exists` so they survived — only the logic went backwards, which
   is why the schema looked perfect throughout.

   So each superseded file carries a block naming what it would take back and
   which file restores it, and this keeps that block honest. Add a new file
   that replaces an old function and the build fails until the old file says
   so. */
await check("a superseded migration says which file undoes it", () => {
  const MARK = "-- DO NOT RE-RUN THIS FILE ON ITS OWN";

  /* Which file most recently defines each function. */
  const latest = new Map();
  const defs = new Map();
  for (const f of sqlFiles) {
    const body = read(SQL_DIR + "/" + f);
    const names = [...body.matchAll(
      /create\s+or\s+replace\s+function\s+public\.([a-z_]+)\s*\(/gi)].map((m) => m[1]);
    defs.set(f, [...new Set(names)]);
    for (const n of names) latest.set(n, f);
  }

  const problems = [];
  let marked = 0;
  for (const f of sqlFiles) {
    const superseded = (defs.get(f) || []).filter((n) => latest.get(n) !== f);
    const body = read(SQL_DIR + "/" + f);
    const has = body.includes(MARK);

    if (!superseded.length) {
      if (has) problems.push(f + " carries the warning but supersedes nothing any more");
      continue;
    }
    if (!has) {
      problems.push(f + " defines " + superseded.join(", ") +
        " which " + [...new Set(superseded.map((n) => latest.get(n)))].join(", ") +
        " has since replaced, and carries no warning");
      continue;
    }
    marked++;
    /* The block has to name the file that actually restores each one, or it is
       a warning that sends somebody to the wrong place. */
    for (const n of superseded) {
      const to = latest.get(n);
      if (!body.includes(to)) {
        problems.push(f + ": its warning does not name " + to + ", which is what restores " + n);
      }
    }
  }

  if (problems.length) throw new Error(problems.join("; "));
  return marked + " superseded file(s), each naming what restores it";
});

/* The generator has to parse, and nothing was checking that.

   tools/build-portal.mjs writes four of these pages. Every check in this file
   reads the pages — so a generator that will not even parse leaves all of them
   green, against output from the last run that worked. That is precisely how
   it went unnoticed that a backtick inside a comment had closed the template
   literal it was sitting in: the build passed, the pages were stale, and the
   change simply was not there.

   Parsing it is not the same as running it, and running it would overwrite the
   pages as a side effect of a check, which no check should do. So: parse. */
await check("the generator that writes four of these pages parses", async () => {
  const src = read("tools/build-portal.mjs");
  try {
    /* As a module, because it is one — top-level import and await are both
       syntax errors to `new Function`. */
    new (await import("node:vm")).SourceTextModule(src, { identifier: "build-portal.mjs" });
  } catch (e) {
    if (/SourceTextModule|experimental|not a constructor/i.test(String(e && e.message))) {
      /* Older node without --experimental-vm-modules. Fall back to asking node
         itself, which is slower but always available. */
      const { execFileSync } = await import("node:child_process");
      try {
        execFileSync(process.execPath, ["--check", "tools/build-portal.mjs"], { stdio: "pipe" });
      } catch (e2) {
        throw new Error("tools/build-portal.mjs does not parse — the four pages it writes are " +
          "whatever the last working run left behind, and every other check here is reading " +
          "those. Run `node tools/build-portal.mjs` to see the error.");
      }
      return "parses (node --check), " + (src.length / 1024).toFixed(0) + " KB";
    }
    throw new Error("tools/build-portal.mjs does not parse: " + e.message);
  }
  return "parses, " + (src.length / 1024).toFixed(0) + " KB";
});

/* Nothing asks "is this hers" with only half the question.

   applications.user_id has never been filled in. 004 added it and added
   claim_my_applications() to populate it, and no page has ever called that —
   so the column is null on every row in the table. Every place that asks
   whether an application belongs to the caller therefore carries two arms:
   the user id, and the email on the verified token.

   submit_assessment() in 045 carried one. It matched nobody, for everybody,
   always, and the Send button on the assessment could never have worked. It
   went unseen because 045 was written months before it was run.

   One arm is not a smaller version of two. It is zero. */
await check("no ownership test matches on user_id alone", () => {
  const bad = [];
  /* Each function body, from its name to its terminator. */
  for (const m of sql.matchAll(
    /create\s+or\s+replace\s+function\s+public\.([a-z_]+)\s*\(([^)]*)\)([\s\S]*?)\$fn\$;/gi)) {
    const [, name, , body] = m;
    if (!/user_id\s*=\s*auth\.uid\(\)/i.test(body)) continue;
    /* The email arm, or a helper that already carries both. */
    const paired = /lower\s*\(\s*a?\.?email\s*\)/i.test(body) ||
                   /owns_application|is_client_contact|is_hired/i.test(body);
    if (!paired) bad.push(name);
  }

  /* A later definition settles it — 051 is exactly that. Only the last copy of
     a function is the one Postgres runs. */
  const still = bad.filter((name) => {
    const all = [...sql.matchAll(new RegExp(
      "create\\s+or\\s+replace\\s+function\\s+public\\." + name + "\\s*\\([\\s\\S]*?\\$fn\\$;", "gi"))];
    const last = all[all.length - 1][0];
    return !(/lower\s*\(\s*a?\.?email\s*\)/i.test(last) ||
             /owns_application|is_client_contact|is_hired/i.test(last));
  });

  if (still.length) {
    throw new Error([...new Set(still)].join(", ") + " — matches on user_id alone, and " +
      "applications.user_id is null on every row because nothing has ever called " +
      "claim_my_applications(). This does not narrow the match, it empties it. Use " +
      "owns_application(), which carries both arms.");
  }
  return "every ownership test carries the email arm too";
});

/* "Who did this" is never a claim the browser makes.

   Every record of who agreed something in this project is stamped from the
   verified session: decided_by on a timesheet, confirmed_by on a start date, a
   note's author, scored_by on an interview score, resolved_by on a swap,
   contacted_by on an application, typing_verified_by, written_scored_by. That
   is a rule, and it has now been broken three separate times — 046 found two
   and 050 found two more, each because a column was added in a grant that
   nobody thought of as being about identity.

   So it is asserted rather than remembered. Any column ending _by or _at that
   a signed-in user may write has to be named below, deliberately, with a
   reason — which turns "somebody forgot" into "somebody decided". */
await check("no record of who did something is writable by a page", () => {
  /* The two the pages genuinely send, and why they are allowed to.
     status_changed_at is a clock rather than an identity: /admin sets it in
     the same request that moves the stage, and no policy reads it. It is on
     this list rather than absent from it so the next person has to argue with
     a sentence instead of a silence. */
  const ALLOWED = new Set([
    /* A clock, not an identity. /admin sets it in the same request that moves
       the stage, and no policy reads it. */
    "status_changed_at",
    /* Also a clock, and one the page has to be able to set both ways: the
       publish control on the notice board toggles it to now and back to null. */
    "published_at",
    /* Granted, and then overwritten anyway — sql/006 stamps this in a trigger
       when the consent flag changes, so what the page sends never survives.
       The grant is redundant rather than dangerous, and removing it would mean
       editing a migration that has already run. */
    "posting_consent_at"
  ]);

  const offenders = new Map();
  /* grant update (a, b, c) on public.t to authenticated */
  const re = /grant\s+update\s*\(([^)]*)\)\s*on\s+public\.([a-z_]+)\s+to\s+([a-z_,\s]+);/gi;
  for (const m of sql.replace(/--[^\n]*/g, " ").matchAll(re)) {
    if (!/authenticated|anon/i.test(m[3])) continue;
    for (const raw of m[1].split(",")) {
      const col = raw.trim().toLowerCase();
      if (!/_by$|_at$/.test(col)) continue;
      if (ALLOWED.has(col)) continue;
      offenders.set(m[2] + "." + col, true);
    }
  }

  /* A later revoke settles it — that is exactly how 046 and 050 fixed theirs. */
  const still = [...offenders.keys()].filter((k) => {
    const [table, col] = k.split(".");
    return !new RegExp(
      "revoke\\s+update\\s*\\([^)]*\\b" + col + "\\b[^)]*\\)\\s*on\\s+public\\." + table,
      "i").test(sql);
  });

  if (still.length) {
    throw new Error(still.join(", ") + " — a signed-in page may write these, and every one of " +
      "them is a record of who did something or when. Stamp it from auth.jwt() in a trigger and " +
      "revoke the column, the way 046 and 050 do, or add it to ALLOWED here with a reason.");
  }
  return offenders.size
    ? offenders.size + " granted then revoked, " + ALLOWED.size + " allowed on purpose"
    : "none granted, " + ALLOWED.size + " allowed on purpose";
});

/* The rule the whole assessment rests on, checked rather than believed.

   The page has to be sent the questions and the wording of every option, and
   must never be sent what any of them is worth. view-source is one keystroke,
   and an assessment whose key ships in page source is not an assessment.

   It held while there was one bank emitted by one line. There are now four,
   built by a loop, and the difference between shipping [text] and shipping
   [text, points] is one character in that loop. So it is asserted against the
   built page rather than against the intention. */
await check("the answer key never reaches the browser", async () => {
  if (!existsSync("status.html")) return "no status.html to check";
  const html = read("status.html");
  /* \r?\n, not \n. The generator writes LF and git hands Windows a CRLF
     working copy, so this said "no QBANK in status.html — has the assessment
     been renamed?" about a bank sitting plainly in the file, on any checkout
     that had not been rebuilt since. A fresh clone failed here before anybody
     had touched anything, which is the worst kind of failing check: it accuses
     the code of a rename that never happened. */
  const m = html.match(/var QBANK = (\{[\s\S]*?\});\r?\n/);
  if (!m) throw new Error("no QBANK in status.html — has the assessment been renamed?");

  let bank;
  try { bank = JSON.parse(m[1]); }
  catch (e) { throw new Error("QBANK in status.html is not valid JSON: " + e.message); }

  let items = 0;
  for (const [name, list] of Object.entries(bank)) {
    for (const it of list) {
      items++;
      if (!Array.isArray(it) || it.length !== 2 || !Array.isArray(it[1])) {
        throw new Error(name + ": an item in the page is not [prompt, [option, ...]] — " +
          "if the points went with it, the key is in the page source");
      }
      for (const o of it[1]) {
        if (typeof o !== "string") {
          throw new Error(name + ": an option in the page is " + typeof o + " rather than text — " +
            "the score is being shipped with it, and anybody can read it");
        }
      }
    }
  }
  return items + " items in the page, prompts and wording only — no score reaches it";
});

/* Every bank, not only the first one.

   This checked SCENARIOS alone, which was the whole assessment when it was
   written. English, detail and sales are three more banks of exactly the same
   shape and exactly the same failure — and two of them shipped with the best
   answer never once in the fourth column, which somebody would have noticed
   before we did. */
await check("no column is a strategy on the assessment", async () => {
  const { BANKS } = await import("./assessment-items.mjs");
  const said = [];
  for (const [name, bank] of Object.entries(BANKS)) {
    if (!bank.length) throw new Error(name + " is empty");
    const spread = [0, 0, 0, 0];
    for (const [prompt, opts] of bank) {
      if (opts.length !== 4) {
        throw new Error(name + ': "' + String(prompt).slice(0, 50) + '" has ' + opts.length +
          " options — every item is four, or the shuffling and the spread below both stop meaning anything");
      }
      const best = Math.max(...opts.map((o) => o[1]));
      if (best !== 2) throw new Error(name + " has an item whose best answer is not worth 2");
      spread[opts.findIndex((o) => o[1] === best)]++;
    }
    /* Random guessing scores a quarter. A column that holds more than a third
       of the best answers beats guessing for somebody who spots it, which is a
       question about pattern-matching rather than judgement. */
    const worst = Math.max(...spread);
    if (worst > Math.ceil(bank.length / 3)) {
      throw new Error(name + ": the best answer sits in column " + (spread.indexOf(worst) + 1) +
        " for " + worst + " of " + bank.length + " items — ticking it blindly scores " +
        Math.round((worst / bank.length) * 100) + "%. Reorder the options.");
    }
    said.push(name + " " + spread.join("/"));
  }
  return said.join(", ");
});

await check("anon holds nothing on the assessment", () => {
  const t = "application_assessment";
  if (!new RegExp("revoke\\s+all\\s+on\\s+public\\." + t + "\\s+from\\s+[a-z_,\\s]*\\banon\\b", "i").test(sql)) {
    throw new Error("nothing revokes anon on " + t);
  }
  const granted = sql.replace(/--[^\n]*/g, " ").split(";").some((s) =>
    new RegExp("grant[\\s\\S]*?on\\s+public\\." + t + "\\s+to\\s+[a-z_,\\s]*\\banon\\b", "i").test(s));
  if (granted) throw new Error(t + " is granted to anon somewhere");
  if (!new RegExp("alter\\s+table\\s+public\\." + t + "\\s+enable\\s+row\\s+level\\s+security", "i").test(sql)) {
    throw new Error("row-level security is never enabled on " + t);
  }
  /* The scores and the verdict decide an application. If a page could write
     them, the assessment would be a form somebody fills in about themselves. */
  for (const col of ["score_typing", "score_scenarios", "verdict", "submitted_at"]) {
    if (new RegExp("grant\\s+update\\s*\\([^)]*\\b" + col + "\\b", "i").test(sql)) {
      throw new Error(col + " is granted on UPDATE — a page could set its own score");
    }
  }
  return "revoked, RLS on, and no page may write a score";
});

await check("a failed assessment declines nobody", () => {
  const fn = sql.slice(sql.indexOf("function public.advance_on_assessment"));
  const body = fn.slice(0, fn.indexOf("$fn$;") + 5);
  if (!body) throw new Error("advance_on_assessment() not found");
  if (/status\s*=\s*'declined'/i.test(body)) {
    throw new Error("the advance trigger can set 'declined' — a dropped connection would " +
      "look like a low score and lose a real person silently");
  }
  if (!/status\s*=\s*'interview'/i.test(body)) throw new Error("it never advances to interview");
  if (!/and\s+status\s*=\s*'assessment'/i.test(body)) {
    throw new Error("it does not check the applicant is still at assessment — a re-sit " +
      "would walk somebody backwards from hired");
  }
  return "advances on a pass, declines on nothing";
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

/* The apply form must not answer its own questions.

   exp and speed shipped with the second of four options already selected, so
   every application carried a claim about the applicant's experience and their
   connection whether or not they ever looked at those rows — and the form could
   never report them missing, because they were never empty. Two of the four
   real applicants were sitting on the experience default when this was found.

   The checked= half is what regresses; the rest is here so that taking a
   default off without asking the question instead cannot pass either. */
await check("the apply form asks rather than assumes", async () => {
  const src = readFileSync("careers.html", "utf8");
  const dialog = src.slice(src.indexOf('id="apply"'), src.indexOf("</form>"));
  const bad = [...dialog.matchAll(/<input type="radio" name="(\w+)" value="([^"]*)" checked/g)]
    .map((m) => m[1] + '="' + m[2] + '"');
  if (bad.length) {
    throw new Error("these answer themselves: " + bad.join(", ") +
      " — a defaulted radio is a claim the applicant never made");
  }
  /* Every group the walk found defaulted now has to be asked for, which means
     a slot to say so in and a line that fills it. */
  for (const g of ["exp", "speed"]) {
    if (!dialog.includes('id="err-' + g + '"')) {
      throw new Error(g + " has nowhere to say it is missing");
    }
    if (!src.includes('getElementById("err-' + g + '")')) {
      throw new Error(g + " has a slot for an error and nothing that fills it");
    }
  }
  /* And a refusal has to look like one, in every rule that draws one.

     This started as a check on .err alone and that was not enough: .err was
     fixed, and .field.is-bad input was still var(--accent), so on step 3 an
     invalid field stayed exactly the colour of a focused field. The rest of
     the form had been red since it was written — .disc__g.is-bad and
     .skill.is-bad both — and the contact fields were the odd ones out because
     a more specific selector quietly won.

     So the rule is the general one: nothing that paints a rejection may paint
     it in the colour of the thing the eye is already following. */
  for (const file of ["careers.html", "index.html"]) {
    /* Comments out first. They explain these rules at length and mention both
       the class names and the colours, so leaving them in makes a failure
       print a paragraph where a selector should be. */
    const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/([^{};]*(?:\.err|is-bad)[^{};]*)\{([^}]*)\}/g)) {
      const [, selector, body] = m;
      if (/var\(--accent\)/.test(body)) {
        throw new Error(file + ": " + selector.trim().replace(/\s+/g, " ") +
          " paints a rejection in the accent colour — the same colour as focus");
      }
    }
  }
  const groups = [...new Set([...dialog.matchAll(/<input type="radio" name="(\w+)"/g)].map((m) => m[1]))];
  return groups.length + " radio groups, none pre-answered";
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

/* ── the generator that overwrites four of these pages ────────────────────
   tools/build-portal.mjs WRITES status.html, admin.html, hub.html, seats.html
   and pay.html. It never reads them. So anything edited in those files by hand
   is one command away from being gone — silently, with no error, and with the
   build still green afterwards because every check here reads the file that
   was just overwritten.

   That is exactly what happened: a round of fixes went into those files
   directly and none of it reached the generator. Nothing caught it, because
   nothing was looking.

   This looks. Each marker below is a fix that lives in a generated page; if a
   page comes back without one, that page has been regenerated from a
   generator that does not know about it, and the fix is gone. */
await check("no generated page has lost a fix to its generator", () => {
  const MARKERS = [
    ["seats.html",  "function placeBlock",  "every assistant is drawn, not only the first"],
    ["seats.html",  "function billingBlock", "the bill"],
    ["seats.html",  "function quoted",      "the quote shown to the cent"],
    ["seats.html",  "C_WEEK_LIMIT",         "the statement's week limit"],
    ["status.html", "TYPING_TEST_URL",      "the typing test moved off this site"],
    ["status.html", "typing_proof",         "proof of the typing score"],
    ["admin.html",  "function todayCentral", "dates stamped in Central"],
    ["admin.html",  "function downloadCvs", "the bulk CV download"],
    ["admin.html",  "DATE_RANGES",          "the date filter"],
    ["admin.html",  "weekly_cents",         "the exact quote"],
    ["admin.html",  "function drawPayments", "recording that a client paid"],
    ["pay.html",    "function dueCard",     "the figure a client came to /pay for"],
    ["pay.html",    "function receiptsCard", "the payments received panel"],
    ["seats.html",  "function cBill",       "one definition of what a client owes"],
    ["seats.html",  "Left to pay",          "the total that comes down when somebody pays"],
    ["status.html", "function tzCard",      "the applicant's time zone setting"],
    ["hub.html",    "function tzCard",      "the assistant's time zone setting"],
    ["seats.html",  "function tzCard",      "the client's time zone setting"],
    ["seats.html",  "function interviewBlock", "the client's half of the interview"],
    ["hub.html",    "function interviewCard",  "the assistant's half of the interview"],
    ["admin.html",  "function drawInterviews", "which interviews have stalled"]
  ];
  const lost = [];
  for (const [file, marker, what] of MARKERS) {
    if (!existsSync(file)) continue;
    if (!read(file).includes(marker)) lost.push(file + ": " + what);
  }
  if (lost.length) {
    throw new Error(lost.join("; ") + " — these pages are written by " +
      "tools/build-portal.mjs, so a page that has lost a fix has almost certainly been " +
      "regenerated from a generator that never had it. Recover the page from git and " +
      "port the change into the generator before running it again.");
  }
  return MARKERS.length + " fixes still present in the five generated pages";
});

/* ── a class the page writes and the stylesheet has never heard of ────────
   /hub drew the interview card as a run of unstyled text — the times, the
   durations and the word Choose all butted together on one line — because the
   rules for it had been written into SEATS_CSS, which /hub does not get. The
   markup was correct, so every harness passed. It was found by opening the
   page, which is not a thing to rely on twice.

   The shared chrome is one stylesheet and a per-page one is deliberate, so a
   component whose markup is shared and whose rules are not is a mistake the
   arrangement actively invites. This looks for it: every class a page's script
   writes into a static class="..." must have a rule in that page's own style
   block.

   The list below is what has no rule today and is not a bug — hooks that
   exist to be found by JavaScript, and one class the site simply never styled.
   Anything NEW joining them fails the build. */
await check("every class a portal writes has a rule on that page", () => {
  /* Hooks, not looks. `field`, `err` and `bars` are queried by script;
     `fileinfo`, `a-q`, `edit` and `ts__nav` are containers whose children
     carry the styling. None of them renders text of its own. */
  const HOOKS = new Set(["field", "err", "bars", "fileinfo", "a-q", "edit", "ts__nav"]);

  const PAGES = ["status.html", "admin.html", "hub.html", "seats.html", "pay.html"]
    .filter((f) => existsSync(f));

  const lost = [];
  for (const f of PAGES) {
    const h = read(f);
    const css = (h.match(/<style>[\s\S]*?<\/style>/g) || []).join("\n");
    const js = (h.match(/<script>[\s\S]*?<\/script>/g) || []).join("\n");

    const used = new Set();
    /* Only static class="..." literals. A class assembled by concatenation is
       not something this can resolve, and guessing at it would be the kind of
       false alarm that gets a check switched off. */
    for (const m of js.matchAll(/class="([a-zA-Z0-9 _-]+)"/g)) {
      m[1].trim().split(/\s+/).filter(Boolean).forEach((c) => used.add(c));
    }
    for (const c of used) {
      if (HOOKS.has(c)) continue;
      if (!new RegExp("\\." + c + "(?![a-zA-Z0-9_-])").test(css)) lost.push(f + ": ." + c);
    }
  }

  if (lost.length) {
    throw new Error(lost.join(", ") + " — this page writes that class and its own " +
      "stylesheet has no rule for it, so it renders as bare text. Either the rule belongs " +
      "in the shared chrome rather than in one page's block, or the class is a hook with no " +
      "look and belongs in HOOKS above. Say which.");
  }
  return PAGES.length + " pages, every class they write is styled";
});

/* ── a backslash the template literal ate ─────────────────────────────────
   The portal scripts are built inside template literals, so `\d` in the
   generator arrives in the page as a bare `d`. The regex still compiles, still
   runs, and quietly means something else: /d+$/ strips trailing letter d's
   rather than digits.

   That shipped. Every tab in /admin carrying a badge count showed the count
   welded to its own heading — "Messages1", "Seats3" — because the line meant
   to strip it was matching the wrong thing. Nothing failed, nothing threw, and
   the Applications tab looked right because its heading is written in the
   static markup and never goes through that line.

   A character class letter sitting immediately before a quantifier is the
   signature — a slash, then a bare d, w or s, then + or a star or a count.
   Nobody writes those on purpose, and `/day/` and `/style/` are unaffected
   because the letter after them is not a quantifier. */
await check("no regex in a portal lost its backslash", () => {
  const PAGES = ["status.html", "admin.html", "hub.html", "seats.html", "pay.html"]
    .filter((f) => existsSync(f));

  const SUSPECT = /\/(?:\^)?[dwsDWSb](?:[+*?]|\{\d)/g;
  const found = [];

  for (const f of PAGES) {
    for (const m of read(f).matchAll(SUSPECT)) {
      found.push(f + ": " + m[0]);
    }
  }

  if (found.length) {
    throw new Error([...new Set(found)].join(", ") + " — that reads as a literal letter, " +
      "not a character class. These scripts are built inside a template literal, which eats " +
      "one backslash, so `\\d` in tools/build-portal.mjs has to be written `\\\\d`. The regex " +
      "will compile either way and match the wrong thing in silence.");
  }
  return PAGES.length + " pages, no character class missing its backslash";
});

/* The bill a client reads before they pay us, driven with more than one
   assistant — which is the case simulate.mjs cannot reach, because that walk
   follows one person. It is also the case /seats got wrong for its whole life:
   it drew the first placement and returned, so a business with three
   assistants was shown a third of what it owed and nothing said so. */
await check("the bill adds up across every assistant", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync(process.execPath, ["tools/test-billing.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {2}ok/gm) || []).length + " behaviours";
  } catch (e) {
    throw new Error("tools/test-billing.mjs failed — run it directly for the detail");
  }
});

/* The page a client opens with their bank details already on screen. It shares
   its arithmetic with the panel above and deliberately not its markup, so the
   harness drives the drawing on both and asserts they land on the same figure.
   A client shown one total on /seats and another on /pay has no way of knowing
   which one to send, and neither do we. */
await check("/pay and /seats agree on what is owed", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync(process.execPath, ["tools/test-pay.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {2}ok/gm) || []).length + " behaviours";
  } catch (e) {
    throw new Error("tools/test-pay.mjs failed — run it directly for the detail");
  }
});

/* The setting from sql/056, and mostly the things it must not change. A date
   is a day and a timestamp is an instant; letting a preference blur those two
   would put back the bug when() was rewritten to fix, with a setting to blame
   it on. Driven on all three portals, because the card is shared and the
   wiring is not. */
await check("a chosen time zone moves instants and never dates", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync(process.execPath, ["tools/test-timezone.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {2}ok/gm) || []).length + " behaviours across three portals";
  } catch (e) {
    throw new Error("tools/test-timezone.mjs failed — run it directly for the detail");
  }
});

/* The interview handshake from sql/057, rendered from both sides of the same
   rows in the same tick. The failure worth catching is not a broken page: it
   is a client who believes they are waiting on her while she believes she is
   waiting on them. Neither screen looks wrong, and the match quietly dies. */
await check("both sides of an interview are told the same thing", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync(process.execPath, ["tools/test-interview.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {2}ok/gm) || []).length + " behaviours, client and assistant";
  } catch (e) {
    throw new Error("tools/test-interview.mjs failed — run it directly for the detail");
  }
});

/* A page that tells somebody to sign out has to offer them a sign out.

   /hub's locked-out state says "we cannot find an application for <address> —
   if you applied with a different address, sign out and use that one", and
   rendered no sign-out control, no header and no brand mark: the chrome is
   drawn in render(), and shut() returns before render() ever runs. So the one
   person that message is written for — signed in on the wrong address — could
   read the instruction and had nothing on the page to follow it with.

   Asserted against the built page rather than the intention, because the copy
   and the control are written in different functions and only ever meet in
   the output. */
await check("a page that says sign out offers one", async () => {
  if (!existsSync("hub.html")) return "no hub.html to check";
  const html = read("hub.html");
  const at = html.indexOf("function shut(");
  if (at < 0) throw new Error("no shut() in hub.html — has the locked-out state been renamed?");
  let depth = 0, i = html.indexOf("{", at), end = -1;
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") { depth--; if (!depth) { end = i; break; } }
  }
  const body = html.slice(at, end + 1);
  if (!/sign out/i.test(html.slice(0, at) + html.slice(end))) {
    return "nothing tells anybody to sign out";
  }
  if (!/signOut/.test(body)) {
    throw new Error("shut() tells somebody to sign out and wires no control that does it");
  }
  return "the locked-out portal offers the way out it names";
});

/* The assessment card on /status, which had no test of any kind — part_done
   appeared in exactly one file in this repo, the generator that writes it.

   Every regression the walkthrough warns about lives on this card, and the
   worst of them already happened once: answering one question of eight marked
   the whole part finished, the Start button vanished, and there was no way
   back in. 054 fixed it by separating HAVING ANSWERS from BEING FINISHED —
   answers save as she goes, and only close_part writes part_done. A card that
   reads the answer columns instead locks her out of a part she is halfway
   through, and nothing here could have seen it coming back. */
await check("the assessment card counts finished, not touched", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync(process.execPath, ["tools/test-assessment-card.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {2}ok/gm) || []).length + " behaviours, both tracks";
  } catch (e) {
    throw new Error("tools/test-assessment-card.mjs failed — run it directly for the detail");
  }
});

/* Can the product forget somebody, and only in the ways it is meant to?
   Almost every assertion in here is about a delete grant that must NOT exist,
   because that is the easiest thing in this schema to add carelessly and the
   hardest to see: nothing looks wrong on a page holding a privilege it never
   uses. Plus the friction on the one delete that cannot be undone, which no
   screenshot would ever show missing. */
await check("the product can forget somebody, and not by accident", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync(process.execPath, ["tools/test-forgetting.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {2}ok/gm) || []).length + " behaviours, sql/060 and /admin";
  } catch (e) {
    throw new Error("tools/test-forgetting.mjs failed — run it directly for the detail");
  }
});

/* Whose rows a portal page is showing. Every one of them used to trust the
   policy completely — and every one of those policies ends with an or on
   has_permission, so that /admin can read the queue. Signed in as staff,
   /status listed five strangers' applications as yours, /hub opened as the
   newest applicant, /seats named another company, and the edit form PATCHed
   whichever application was newest. Nothing failed: the markup was right. */
await check("a portal page shows the reader their own rows", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync(process.execPath, ["tools/test-whose-rows.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {2}ok/gm) || []).length + " behaviours across the four portals";
  } catch (e) {
    throw new Error("tools/test-whose-rows.mjs failed — run it directly for the detail");
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

/* Nine screens sit behind one rail on /admin, and only the panes were ever
   switched. The queue's toolbar and its backlog count live outside
   .adm__canvas, so every other tab opened wearing them: an applicant search, a
   pipeline filter, an "N of N", a Download CVs and an Export CSV that exports
   the queue — on Clients, on Timesheets, on Placements. Nothing failed. Each
   control did exactly what it says while the heading above it named a
   different screen, which is why it read as furniture and survived being
   looked at.

   Driven rather than parsed: the rail, the toolbar and the switch are written
   a thousand lines apart in build-portal.mjs and only meet in a browser. */
await check("a tab shows the queue's toolbar only on the queue", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync(process.execPath, ["tools/test-admin-tabs.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {2}ok/gm) || []).length + " behaviours, nine tabs";
  } catch (e) {
    throw new Error("tools/test-admin-tabs.mjs failed — run it directly to see which tab");
  }
});

/* Steps 1 and 2 of the apply form validate on Continue and nowhere else, so
   the red they write outlives what it is about. Tick the track you were just
   told to tick and "Choose at least one track you are applying for." is still
   under the ticked box; the same for experience, shift and speed. The form
   asks, is answered, and goes on saying it was not — to somebody who has done
   exactly as they were asked, on the first two screens anybody sees.

   The page already held the principle in two places, which is what makes this
   a gap rather than a decision: text fields clear as you type, and the DISC
   grid clears on change under a comment saying that an answer which does not
   visibly land is indistinguishable from a broken control.

   Driven, not parsed — including the case that makes it harder than blanking
   a string: the skills summary counts what is missing, so it is refreshed,
   and only after it has already spoken. */
await check("an answered question stops being marked unanswered", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync(process.execPath, ["tools/test-apply-errors.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {2}ok/gm) || []).length + " behaviours, four chip groups and the skills grid";
  } catch (e) {
    throw new Error("tools/test-apply-errors.mjs failed — run it directly to see which group");
  }
});

/* An emailed auth link whose redirect_to is refused falls back to the project's
   Site URL, which is the home page, which reads no auth fragment. So the token
   sat in the address bar, the password was never set, and it looked exactly
   like an email that never arrived — the shape this bug has worn all week.

   The allow-list is correct now. This is not about the allow-list: every reset
   email sent before it was corrected still carries the old target, and no
   dashboard setting can reach into an inbox. A page that is the documented
   fallback for every auth link the project sends has to do something with one.

   Driven, and the half worth driving is the refusal: a forwarder that fires on
   any hash sends somebody reading the pricing section to a sign-in page. */
await check("an auth link that lands on the home page is handed on", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync(process.execPath, ["tools/test-auth-forward.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {2}ok/gm) || []).length + " behaviours, four link types and the anchors it must not touch";
  } catch (e) {
    throw new Error("tools/test-auth-forward.mjs failed — run it directly to see which link");
  }
});

/* The other end of the same swallow. An emailed link that fails comes back
   with the reason in the fragment; authError() read it, start() handed it to
   signedOut(), and that was the end of it. So the message reached somebody
   who was signed out and nobody else — follow an expired reset link while
   still holding a session and you got silence, which is exactly what the home
   page used to hand everybody, one step further in. On /status a business
   account was then redirected to /seats, dropping it a second time.

   The banner has to be drawn outside the view root, because every page
   replaces that wholesale when it renders — a message written into it would
   be gone before it was read. That is asserted directly rather than inferred,
   with a fake root that is perfectly capable of accepting it, so putting it in
   the wrong place fails an assertion instead of throwing. */
await check("a link that failed says so, signed in or not", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync(process.execPath, ["tools/test-auth-error.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {2}ok/gm) || []).length + " behaviours across five portal pages";
  } catch (e) {
    throw new Error("tools/test-auth-error.mjs failed — run it directly to see which page");
  }
});

/* The redirect probe can only ask where a link would land by asking the auth
   server to mint one, and a recovery token is single use — minting a new one
   voids the one already sitting in somebody's inbox. It took the first
   account the API returned, which was the same person every run, so the check
   that exists to prove password reset works was breaking password reset:
   somebody asked for a reset, got a real email, clicked it, and was told it
   had expired.

   Now it spends the oldest link, and never-had-one counts as oldest, which
   puts whoever just asked for a reset last by construction rather than by a
   special case. When even the oldest is inside the hour it declines.

   That declining branch is the one that matters and the one that will never
   fire on the machine it was written on, so the chooser is pure and driven
   here — lifted out of the file rather than imported, because importing that
   script probes the live project and would spend a token to test not spending
   one. */
await check("the redirect probe does not break somebody's password reset", async () => {
  const { execFileSync } = await import("node:child_process");
  try {
    const out = execFileSync(process.execPath, ["tools/test-probe-choice.mjs"], { stdio: "pipe" }).toString();
    return (out.match(/^ {2}ok/gm) || []).length + " behaviours, whose token gets spent and when none may be";
  } catch (e) {
    throw new Error("tools/test-probe-choice.mjs failed — run it directly to see which case");
  }
});

/* Every pane on /admin is drawn by a loader called from render(). Interviews
   was not. Its one call had landed inside the client-logo upload handler, two
   spaces out of line with the callback around it, so the tab opened blank —
   no card, no heading, not even the "Nothing booked" it already had written —
   and stayed blank until somebody uploaded a logo or saved an interview date.

   That tab is the only thing that raises three problems nobody else will:
   interviewed and never scored, at interview with no date, two bookings inside
   an hour. Its rail badge counts them, and the badge is set by the same
   function, so an empty tab and a quiet rail were one silence.

   The rule is "drawn when the page opens", not "called from somewhere", and
   the difference is the whole check: drawCalendar() was still reachable from
   render() through the save handler the entire time it was broken. So the
   walk cuts the arguments to addEventListener out of every body before
   following it — what a listener does happens when somebody clicks, which is
   exactly the state the person opening the tab is not in. Verified by putting
   the call back where it was: the loose version passes, this one names
   cal-card. */
await check("every card on a portal page is drawn when the page opens", () => {
  const pages = ["admin.html", "status.html", "hub.html", "seats.html", "pay.html"]
    .filter((f) => existsSync(f));
  if (!pages.length) return "no portal pages built";

  const seen = [];
  const orphans = [];
  for (const f of pages) {
    const html = read(f);
    const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

    const bodyAt = (at) => {
      let d = 0;
      for (let i = js.indexOf("{", at); i < js.length; i++) {
        if (js[i] === "{") d++;
        else if (js[i] === "}") { d--; if (!d) return js.slice(at, i + 1); }
      }
      return "";
    };
    const fns = new Map();
    for (const m of js.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) fns.set(m[1], bodyAt(m.index));
    if (!fns.has("render")) continue;

    /* Cut out every addEventListener argument list. What a listener does
       happens on a click; this walk is only about what happens on load. */
    const onLoadOnly = (body) => {
      let out = "", i = 0;
      for (;;) {
        const at = body.indexOf("addEventListener(", i);
        if (at < 0) return out + body.slice(i);
        out += body.slice(i, at);
        let d = 0, j = body.indexOf("(", at);
        for (; j < body.length; j++) {
          if (body[j] === "(") d++;
          else if (body[j] === ")") { d--; if (!d) break; }
        }
        i = j + 1;
      }
    };

    const drawn = new Set(["render"]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const name of [...drawn]) {
        const body = onLoadOnly(fns.get(name) || "");
        for (const other of fns.keys()) {
          if (!drawn.has(other) && body.includes(other + "(")) { drawn.add(other); grew = true; }
        }
      }
    }

    /* A card nobody looks up by id is written whole by whatever returns it,
       and needs no call of its own. */
    for (const id of new Set([...js.matchAll(/id="([a-z][\w-]*-card)"/g)].map((m) => m[1]))) {
      const needle = 'getElementById("' + id + '")';
      const fillers = [...fns].filter(([n, b]) => n !== "render" && b.includes(needle)).map(([n]) => n);
      if (!fillers.length) continue;
      seen.push(id);
      if (!fillers.some((n) => drawn.has(n))) {
        orphans.push(f + " #" + id + " (filled by " + fillers.join("/") + ")");
      }
    }
  }

  if (orphans.length) {
    throw new Error(orphans.join("; ") + " — reached only from a handler, so the pane " +
      "opens empty and stays empty until somebody happens to trigger it. Call it " +
      "from render() with the other loaders.");
  }
  return seen.length + " cards across " + pages.length + " pages, every one drawn on load";
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
/* ── a new table does not start empty ─────────────────────────────────────
   Supabase ships ALTER DEFAULT PRIVILEGES granting everything on a new table
   in `public` to anon, authenticated and service_role. So the line every
   migration here opens its grants with —

     revoke all on public.<table> from anon, authenticated;

   — is not a formality. It is the whole of the lockdown, and 055, 056 and 057
   each wrote only half of it: `from anon`, with authenticated left holding
   INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER.

   RLS caught nearly all of it, because those first three pass through a
   policy. TRUNCATE does not. A policy filters rows and TRUNCATE never visits
   one, so it is checked against the table privilege alone — which meant any
   signed-in account could have emptied the payments ledger and every interview
   being arranged, with no policy consulted and nothing written down.

   Fixed by 059. This is what stops the next one: every table created in sql/
   must be revoked from BOTH roles somewhere in the same file. */
await check("every new table is revoked from both public roles", () => {
  /* Asked of the folder rather than of each file, because what matters is
     where the database ends up. 055, 056 and 057 have already been pasted and
     are not editable; 059 revokes what they left behind, and that is a real
     fix rather than a excuse — the schema is right once it has run. A table
     nothing anywhere revokes is still caught, which is the case this exists
     for. */
  const created = new Map();
  const revokedBoth = new Set();

  for (const f of sqlFiles) {
    const body = read(SQL_DIR + "/" + f);
    for (const m of body.matchAll(/create table if not exists\s+public\.(\w+)/gi)) {
      if (!created.has(m[1])) created.set(m[1], f);
    }
    /* One revoke may name several tables, so the statement is matched first
       and its table list read out of it. */
    for (const m of body.matchAll(/revoke\s+all\s+on\s+([^;]*?)\bfrom\s+([^;]+);/gi)) {
      if (!/\banon\b/i.test(m[2]) || !/\bauthenticated\b/i.test(m[2])) continue;
      for (const t of m[1].matchAll(/public\.(\w+)/gi)) revokedBoth.add(t[1]);
    }
  }

  const missing = [...created]
    .filter(([t]) => !revokedBoth.has(t))
    .map(([t, f]) => "public." + t + " (created in " + f + ")");

  if (missing.length) {
    throw new Error(missing.join("; ") + " — Supabase grants every privilege on a new " +
      "public table to anon AND authenticated, so a table is only locked down once both " +
      "are revoked. Leaving authenticated holding TRUNCATE is not covered by RLS: a policy " +
      "filters rows and TRUNCATE never visits one. Add `revoke all on public.<table> from " +
      "anon, authenticated;` before the grants, as every file from 001 does.");
  }
  return created.size + " tables, every one revoked from anon and authenticated";
});

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
     diff in a hurry. The declaration is necessary and not sufficient: the table
     has to be named in MAY_BE_PUBLIC below as well, so writing it is a decision
     somebody has to make on purpose, in two places, one of them here. */
  /* Which tables the declaration is allowed to open, named here rather than a
     list of the ones it must not.

     It was the other way around until it nearly cost the pay rates. A list of
     tables that may never be public is a list that has to be remembered every
     time the schema grows, and it was not: it was written when 015 added the
     first public table and still named only the applicant tables, while 026
     through 043 added ten more holding leave reasons, client contacts,
     assistant names, and both sides of the money. Every one of them was
     waveable by typing one comment into a migration. Checked, and a
     `grant select (assistant_rate) on placement_pay to anon` with a
     declaration above it passed all ninety.

     Named this way the default is the safe one. A new table is protected the
     day it is created by nobody doing anything, and opening one costs a line
     here as well as the declaration in the migration — which is what "that is
     a conversation, not a comment" was always meant to mean. */
  const MAY_BE_PUBLIC = new Set([
    "client_logos",
    /* 044. Migration numbers and nothing else — the column grant is `n` alone,
       so the public key reads a set of integers and cannot reach the dates.
       Opened so tools/status.mjs can keep answering "has it landed?" on the
       publishable key, because no tool here touches the service role key and
       the tool that tells you things are running must not be the one that
       leaks them. */
    "schema_migrations"
  ]);

  const declared = [...sql.matchAll(/--\s*ANON MAY READ\s+(\w+)/gi)]
    .map((m) => m[1].toLowerCase());
  const declaredPublic = new Set(declared.filter((t) => MAY_BE_PUBLIC.has(t)));

  const offenders = [];

  /* Say so where it happens. Without this the declaration is simply ignored and
     the grant below is reported as an ordinary stray one, which reads as though
     the declaration were never written and sends whoever is fixing it looking
     in the migration rather than here. */
  for (const t of new Set(declared)) {
    if (!MAY_BE_PUBLIC.has(t)) {
      offenders.push("`-- ANON MAY READ " + t + "` declares a table that is not in " +
        "MAY_BE_PUBLIC (tools/check.mjs) — a comment in a migration does not open a table");
    }
  }

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
