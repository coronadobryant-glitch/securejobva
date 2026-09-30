/* Data guard. Asserts that the publishable key still cannot read anybody.

   supabase.sql explains the arrangement: the key in the page source is public,
   and it is safe only because RLS lets it INSERT and nothing else. That is one
   toggle in a dashboard away from being untrue, and nothing in this repo would
   change when it happened — the pages would keep working perfectly while the
   applicant list became readable by anyone who viewed source.

   So it is checked against the live database rather than assumed from the SQL.

   Run: node tools/guard-rls.mjs                   read-only, safe on a schedule
        node tools/guard-rls.mjs --probe-signup    also test that sign-up needs
                                                   a confirmed address (writes)

   Run bare, nothing here writes anything. Every probe is a read, or an insert
   that deliberately names a column that does not exist — which proves the key
   still authenticates and gets as far as the schema, then stops there.

   --probe-signup is different, and this header used to hide that behind
   "nothing here writes a row". It signs up a made-up address at
   @securejobva-guard.invalid, which INSERTS A ROW INTO auth.users and, with
   email confirmation on (the state it is checking for), makes GoTrue try to
   send a confirmation mail to an address that cannot receive one: a unit of
   the project's auth email rate limit — the one real sign-ups and password
   resets share — and a bounce on the sending domain, every run. If
   .env.local holds the service role key it then DELETES that row, and any
   other @securejobva-guard.invalid account older than an hour. That is worth
   doing once after touching the auth settings. It is not worth doing hourly,
   so it is never the default.

   Exit status is 1 if applicant data is readable, so this can run on a
   schedule and shout. */
import { readFileSync, readdirSync } from "node:fs";

const PROBE_SIGNUP = process.argv.includes("--probe-signup");

/* Read the endpoint and key out of the pages, so there is one source of truth
   and this cannot drift into checking a project you no longer use. */
function cfg(file) {
  const html = readFileSync(file, "utf8");
  const endpoint = (html.match(/endpoint:\s*"([^"]+)"/) || [])[1];
  const key = (html.match(/"apikey":\s*"([^"]+)"/) || [])[1];
  if (!endpoint || !key) throw new Error("no endpoint or key found in " + file);
  return { endpoint, key, table: endpoint.split("/").pop() };
}

const TARGETS = ["index.html", "careers.html"].map(cfg);

/* Everything the public key must not be able to read. The first two above are
   checked for insert as well, because they are supposed to accept one; these
   are checked for read only, because they are supposed to accept nothing.

   Keyed by what is behind the door, so a breach message says what leaked
   rather than naming a table and leaving you to work it out. */
const HOLDS = [
  ["application_tracking", "the internal pipeline, contact history and interview scores"],
  ["application_notes",    "private staff notes about applicants"],
  ["application_socials",  "applicants' social handles"],
  ["application_queue",    "every applicant joined to their pipeline and scores"],
  ["contact_messages",     "everything anyone has sent through the contact form"],
  ["admins",               "the list of who administers this site"],
  ["user_roles",           "who holds which role"],
  ["role_requests",        "who has asked for what access"],
  ["social_tokens",        "publishing tokens for other people's social accounts"],
  ["leave_requests",       "who has asked for time off, and why"],
  ["notices",              "the notice board, including notices not yet published"],
  ["timesheets",           "the hours everybody is paid on"],
  ["timesheet_days",       "what each assistant worked, day by day"],
  ["clients",              "the businesses assistants are placed with"],
  ["placements",           "who works for whom"],
  ["placement_billing",    "what every client is charged an hour"],
  ["placement_pay",        "what every assistant is paid an hour"],
  ["swap_requests",        "clients asking to replace the person working for them"],
  ["client_payments",      "every payment a client has made, and how"],
  ["client_payment_weeks", "which payment settled which week"],
  ["client_private",       "each client's contact name and email address"],
  ["application_assessment", "applicants' assessment answers and scores"],
  ["application_disc",     "applicants' personality answers"],
  ["application_disc_read", "applicants' personality results"],
  ["application_documents", "where every applicant's CV is stored"],
  ["application_note_log", "every staff note ever written about an applicant"],
  ["application_public",   "the assistant name a client is shown"],
  ["intake_throttle",      "the IP addresses of everyone who submitted a form"],
  ["interview_slots",      "interview times and the links to join them"],
  ["interview_state",      "whose interviews are stalled, and on whom"],
  ["deletion_log",         "who was erased, and by whom"],
  ["placement_starts",     "the start dates clients confirmed"],
  ["user_settings",        "each person's saved time zone"],
  ["roles",                "the roles this site hands out"],
  ["permissions",          "what each permission allows"],
  ["role_permissions",     "which role holds which permission"],
  ["timesheet_charges",    "what every week of work is billed at"],
  /* 015 grants anon a column list on this one, because the home page shows
     the logos. select=* still has to be refused: added_by and the rest are
     not part of that list, and the day they are, this says so. */
  ["client_logos",         "the logo table's whole row, beyond the columns the home page shows"]
];

/* The list above was written by hand and fell behind: eighteen of thirty-seven
   tables and one of three views, with payments, client contact details,
   assessment scores and the throttle's IP addresses not on it. Nothing was
   exposed — every one of them refused the public key when probed — but a
   grant added to any of them would have left this printing "ok" and exiting 0.

   So the set is read from sql/ as well: every table or view a numbered file
   creates and a later one has not dropped. The hand-written line stays as the
   way to say what a table holds; one with no line is still probed, under a
   plainer description, so a table added tomorrow is guarded the day it is
   pasted. The two intake tables and schema_migrations are left out of it and
   probed on their own further down, because each of those is meant to answer
   the public key in one narrow way. */
function relationsInSql() {
  const files = readdirSync("sql").filter((f) => /^\d+.*\.sql$/.test(f) && !f.endsWith(".local.sql")).sort();
  const sql = files.map((f) => readFileSync("sql/" + f, "utf8").replace(/--[^\n]*/g, " ")).join("\n");
  const live = new Set();
  const re = /\b(create(?:\s+or\s+replace)?|drop)\s+(?:table|view)\s+(?:if\s+(?:not\s+)?exists\s+)?public\.([a-z_][a-z0-9_]*)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    if (/^drop$/i.test(m[1])) live.delete(m[2]); else live.add(m[2]);
  }
  return live;
}
const NOT_SEALED = new Set(["seat_requests", "applications", "schema_migrations"]);
const described = new Map(HOLDS);
let fromSql = new Set();
try { fromSql = relationsInSql(); } catch (e) {
  console.log("  warn    could not read sql/ for the table list — " + e.message + " (checking the named ones only)");
}
const SEALED = [...new Set([...described.keys(), ...fromSql])]
  .filter((t) => !NOT_SEALED.has(t))
  .map((t) => [t, described.get(t) || "rows behind sign-in (" + t + ", created in sql/)"]);

/* The functions are SECURITY DEFINER, so a missing grant is the only thing
   stopping the public key calling them. is_admin() answering at all would be
   bad; my_permissions() answering would be worse. */
const RPCS = ["is_admin", "my_permissions", "list_role_grants", "list_account_requests",
  /* 085: what every client owes. Answers [] to a stranger by design, so a
     200 is not a breach on its own — see below. */
  "client_balances"];
/* Functions that are granted to authenticated and answer anyone else with an
   empty result rather than a refusal. For these a 200 is a breach only if it
   carries rows. */
const EMPTY_FOR_STRANGERS = new Set(["client_balances"]);
const headers = (k) => ({
  apikey: k,
  Authorization: "Bearer " + k,
  "Content-Type": "application/json",
  Prefer: "return=minimal"
});

const fails = [];
console.log("");

/* Both intake tables share one project, so either key reaches all of it. */
const base = TARGETS[0].endpoint.replace(/\/[^/]+$/, "");
const anonKey = TARGETS[0].key;

for (const t of TARGETS) {
  /* The one that matters. A 200 here means the table is readable by the public
     key, which means names, emails, phone numbers and CV links are readable by
     anyone who opened dev tools. */
  try {
    const r = await fetch(t.endpoint + "?select=*&limit=1", { headers: headers(t.key) });
    if (r.ok) {
      const rows = await r.json().catch(() => []);
      fails.push(t.table);
      console.log("  BREACH  " + t.table + ": SELECT returned " + r.status +
        " with " + (Array.isArray(rows) ? rows.length : "?") + " row(s)");
      console.log("          Revoke it now:  revoke select on public." + t.table + " from anon;");
      console.log("          Then find the policy that granted it and drop it.");
    } else {
      console.log("  ok      " + t.table + ": SELECT denied (" + r.status + ")");
    }
  } catch (e) {
    fails.push(t.table);
    console.log("  ERROR   " + t.table + ": could not reach the API — " + e.message);
  }

  /* The other half: locked down is not the same as working. If inserts have
     also stopped, every form on the site is quietly dropping leads. */
  try {
    const r = await fetch(t.endpoint, {
      method: "POST",
      headers: headers(t.key),
      body: JSON.stringify({ __guard_no_such_column__: "x" })
    });
    const body = await r.json().catch(() => ({}));
    if (body.code === "PGRST204") {
      console.log("  ok      " + t.table + ": INSERT still authenticates (reached the schema, wrote nothing)");
    } else if (r.status === 401 || r.status === 403 || body.code === "42501") {
      fails.push(t.table + " insert");
      console.log("  FAIL    " + t.table + ": INSERT is denied (" + r.status + ") — the forms are dropping leads");
    } else {
      console.log("  warn    " + t.table + ": unexpected insert response " + r.status +
        " " + (body.code || "") + " " + (body.message || ""));
    }
  } catch (e) {
    console.log("  warn    " + t.table + ": insert probe failed — " + e.message);
  }
}

console.log("");

for (const [table, holds] of SEALED) {
  try {
    const r = await fetch(base + "/" + table + "?select=*&limit=1",
      { headers: headers(anonKey) });
    if (r.ok) {
      const rows = await r.json().catch(() => []);
      fails.push(table);
      console.log("  BREACH  " + table + ": readable with the public key — " + holds);
      console.log("          returned " + (Array.isArray(rows) ? rows.length : "?") + " row(s)");
      console.log("          Revoke it now:  revoke all on public." + table + " from anon;");
    } else if (r.status === 404) {
      /* Now that the list comes from sql/, it names tables in files not yet
         pasted. Nothing to read is safe, but it is not the same claim as a
         refusal, so it is not printed as one. */
      console.log("  ok      " + table + ": not in the database yet (404) — nothing to read");
    } else {
      console.log("  ok      " + table + ": denied (" + r.status + ")");
    }
  } catch (e) {
    fails.push(table);
    console.log("  ERROR   " + table + ": could not reach the API — " + e.message);
  }
}

for (const fn of RPCS) {
  try {
    const r = await fetch(base + "/rpc/" + fn, {
      method: "POST", headers: headers(anonKey), body: "{}"
    });
    /* A 404 is fine and expected: no EXECUTE grant means PostgREST does not
       expose the function to this role at all. */
    const rows = r.ok && EMPTY_FOR_STRANGERS.has(fn) ? await r.json().catch(() => null) : null;
    if (r.ok && EMPTY_FOR_STRANGERS.has(fn) && Array.isArray(rows) && !rows.length) {
      console.log("  ok      rpc/" + fn + ": answers the public key with nothing");
    } else if (r.ok) {
      fails.push("rpc/" + fn);
      console.log("  BREACH  rpc/" + fn + ": callable with the public key");
      console.log("          Revoke it:  revoke all on function public." + fn + " from anon;");
    } else {
      console.log("  ok      rpc/" + fn + ": denied (" + r.status + ")");
    }
  } catch (e) {
    fails.push("rpc/" + fn);
    console.log("  ERROR   rpc/" + fn + ": " + e.message);
  }
}


/* 044 opened one table to the public key on purpose — schema_migrations, so
   tools/status.mjs can say which migrations landed without a service role key.
   The grant is `select (n)` alone, and a column grant is the only thing holding
   the rest of the row shut.

   That distinction is invisible in the dashboard: the table reads as public
   either way, and widening it to the whole row is one `grant select on` away.
   Nothing else here would change. So the narrowness is checked, not the
   openness — `n` must still answer and every other column must still refuse. */
const OPEN_TABLE = "schema_migrations";

try {
  const r = await fetch(base + "/" + OPEN_TABLE + "?select=n&limit=1", { headers: headers(anonKey) });
  if (r.ok) {
    console.log("  ok      " + OPEN_TABLE + ": n is readable, as designed");
  } else if (r.status === 404) {
    console.log("  note    " + OPEN_TABLE + ": not created yet — paste sql/044-what-has-landed.sql");
  } else {
    fails.push(OPEN_TABLE + " (n unreadable)");
    console.log("  FAIL    " + OPEN_TABLE + ": n is not readable (" + r.status + ") — status.mjs goes blind");
  }
} catch (e) {
  fails.push(OPEN_TABLE);
  console.log("  ERROR   " + OPEN_TABLE + ": " + e.message);
}

for (const col of ["*", "landed_at", "evidence"]) {
  try {
    const r = await fetch(base + "/" + OPEN_TABLE + "?select=" + encodeURIComponent(col) + "&limit=1",
      { headers: headers(anonKey) });
    if (r.status === 404) break;               /* 044 not pasted; already said so above */
    if (r.ok) {
      fails.push(OPEN_TABLE + "." + col);
      console.log("  BREACH  " + OPEN_TABLE + ": the public key can read `" + col + "` — the column " +
        "grant has been widened to the whole row");
      console.log("          Fix:  revoke all on public." + OPEN_TABLE + " from anon; " +
        "grant select (n) on public." + OPEN_TABLE + " to anon;");
    } else {
      console.log("  ok      " + OPEN_TABLE + ": `" + col + "` denied (" + r.status + ")");
    }
  } catch (e) {
    fails.push(OPEN_TABLE);
    console.log("  ERROR   " + OPEN_TABLE + " " + col + ": " + e.message);
  }
}


const BUCKET = "applicant-docs";
const storage = base.replace("/rest/v1", "/storage/v1");

try {
  const r = await fetch(storage + "/object/public/" + BUCKET + "/probe.pdf");
  if (r.status === 200) {
    fails.push(BUCKET + " (public)");
    console.log("  BREACH  " + BUCKET + ": the bucket is PUBLIC — every CV is readable by URL");
    console.log("          Fix now:  update storage.buckets set public = false where id = '" + BUCKET + "';");
  } else {
    console.log("  ok      " + BUCKET + ": not public (" + r.status + ")");
  }
} catch (e) {
  fails.push(BUCKET);
  console.log("  ERROR   " + BUCKET + ": " + e.message);
}

try {
  const r = await fetch(storage + "/object/list/" + BUCKET, {
    method: "POST",
    headers: headers(anonKey),
    body: JSON.stringify({ prefix: "", limit: 100 })
  });
  const rows = r.ok ? await r.json().catch(() => []) : [];
  /* An empty list is the right answer: RLS filters rows rather than refusing
     the call, so anon asking politely gets nothing back. Objects appearing
     here means a select policy was granted to anon. */
  if (Array.isArray(rows) && rows.length) {
    fails.push(BUCKET + " (listable)");
    console.log("  BREACH  " + BUCKET + ": the public key can list " + rows.length + " object(s)");
    console.log("          Find the select policy naming anon on storage.objects and drop it.");
  } else {
    console.log("  ok      " + BUCKET + ": nothing listable with the public key");
  }
} catch (e) {
  fails.push(BUCKET);
  console.log("  ERROR   " + BUCKET + " list: " + e.message);
}

try {
  const r = await fetch(storage + "/object/sign/" + BUCKET + "/probe.pdf", {
    method: "POST",
    headers: headers(anonKey),
    body: JSON.stringify({ expiresIn: 60 })
  });
  if (r.ok) {
    fails.push(BUCKET + " (signable)");
    console.log("  BREACH  " + BUCKET + ": the public key can mint signed URLs");
  } else {
    console.log("  ok      " + BUCKET + ": the public key cannot sign a URL (" + r.status + ")");
  }
} catch (e) {
  fails.push(BUCKET);
  console.log("  ERROR   " + BUCKET + " sign: " + e.message);
}

/* ── the assumption every policy in this database rests on ────────────────
 *
 * Identity here is an email address. has_permission() resolves a role from
 * `auth.jwt() ->> 'email'`; owns_application() and is_client_contact() do the
 * same for applicants and for clients. That is a sound design, and all of it
 * rests on one thing being true: that a session carrying an address can only
 * be had by somebody who can read mail at it.
 *
 * Google sign-in guarantees that. A magic link guarantees it. Email and
 * password guarantees it ONLY IF the project requires confirmation before it
 * issues a session — and that is a checkbox in a dashboard, not a line in this
 * repo. /status and /seats both offer "Create one" to anybody, and the
 * administrator's own address is written down in sql/014.
 *
 * So with that checkbox off, the whole of this file is beside the point:
 * nobody needs to get past RLS as `anon` when they can sign up as the admin
 * and be `authenticated` as him. The pages share one origin and one stored
 * session, so /admin offering only a Google button changes nothing about it.
 *
 * Probed the only way it can be from outside: ask for a session on an address
 * that cannot receive mail, and see whether one comes back. Nothing is left
 * behind that a person could sign in with — the address is not real and the
 * password is thrown away. But it is a write, and a mail attempt, so it only
 * happens under --probe-signup; see the header.
 *
 * It used to leave an unconfirmed row in auth.users every run, described here
 * as the cost of asking. It is not a cost worth paying repeatedly: one row per
 * run accumulates quietly, and a list of accounts that is mostly probes is a
 * list nobody reads carefully. So the probe now clears up after itself when a
 * service role key is at hand, and says so plainly when it cannot — an
 * uncollected row you have been told about is a different thing from one you
 * have not.
 */
const probeEmail = "guard-rls-probe-" + Date.now() + "@securejobva-guard.invalid";

/* Whether the sign-up probe reached a verdict, and which. The closing line
   used to promise "no session was issued to the probe" whatever happened —
   including when the request timed out and nothing was measured at all, and
   when GoTrue answered 500 because it could not send the confirmation mail,
   which is sign-up broken for every real person, reported as a pass. */
let signup = "not run";

if (!PROBE_SIGNUP) {
  console.log("  skip    sign-up needs a confirmed address — not probed. It writes a row to " +
    "auth.users and sends mail; run with --probe-signup when you mean to");
} else try {
  const r = await fetch(base.replace("/rest/v1", "/auth/v1") + "/signup", {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: probeEmail,
      password: "guard-" + Math.random().toString(36).slice(2) + "-Aa1!"
    })
  });
  const j = await r.json().catch(() => ({}));

  if (j && j.access_token) {
    signup = "breach";
    fails.push("email confirmation");
    console.log("  BREACH  sign-up returns a session without confirming the address — " +
      "anyone may sign up as " + "the address in sql/014" + " and hold every permission it has. " +
      "Supabase -> Authentication -> Providers -> Email -> Confirm email must be ON.");
  } else if (r.ok) {
    signup = "confirmed";
    console.log("  ok      sign-up issues no session until the address is confirmed");
  } else if (r.status >= 500) {
    /* Not a pass. A 500 here is usually "Error sending confirmation email":
       no session came back, but no real person can sign up either. */
    signup = "broken";
    console.log("  warn    sign-up answered " + r.status + " " + (j.error_code || j.msg || "") +
      " — no session, but sign-up is failing for everybody. Check the auth SMTP settings");
  } else {
    /* Sign-ups disabled outright is also a pass: no session, no forged claim.
       Anything else is reported rather than guessed at. */
    signup = "refused";
    console.log("  ok      sign-up refused outright (" + r.status +
      " " + (j.error_code || j.msg || "") + ") — no session to forge a claim with");
  }
} catch (e) {
  signup = "unmeasured";
  console.log("  warn    could not probe the sign-up path — " + e.message);
}

/* ── take the probe back out ───────────────────────────────────────────────
 *
 * Deleting a user needs the service role key, which this file deliberately
 * does not otherwise use: everything above is asked with the public key,
 * because the whole point is to see what a stranger can reach. So the key is
 * read here and nowhere else, only if .env.local is sitting next to the tool,
 * and it is used for exactly one thing — removing the row this run created.
 *
 * This run's own row is matched by id. Sweeping every
 * @securejobva-guard.invalid row would also delete probes belonging to a run
 * happening at the same time somewhere else, and a cleanup that removes
 * somebody else's row is worse than the leak it fixes.
 *
 * Abandoned ones are swept as well, and an hour is what makes that safe: no
 * run of this file lasts sixty seconds, so a probe row still sitting there an
 * hour later belongs to a run that is long over. Without this the rows left
 * behind before the cleanup existed would sit there for good, and the fix
 * would only apply to leaks it had not already caused. */
const ABANDONED_MS = 60 * 60 * 1000;
let deleted = 0;
if (PROBE_SIGNUP) try {
  const { existsSync: hasFile, readFileSync: readEnv } = await import("node:fs");
  let serviceKey = null;
  if (hasFile(".env.local")) {
    const m = readEnv(".env.local", "utf8").match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m);
    if (m) serviceKey = m[1].trim().replace(/^"|"$/g, "");
  }

  if (!serviceKey) {
    console.log("  note    the probe account " + probeEmail + " is still there — " +
      "no service role key here to remove it with");
  } else {
    const authBase = base.replace("/rest/v1", "/auth/v1");
    const H = { apikey: serviceKey, Authorization: "Bearer " + serviceKey };
    /* Every page of accounts: the first two hundred used to be all it read,
       so past that a probe row could sit on page two for good. */
    const users = [];
    for (let page = 1; page <= 100; page++) {
      const list = await (await fetch(authBase + "/admin/users?per_page=200&page=" + page, { headers: H })).json();
      const got = (list && list.users) || [];
      users.push(...got);
      if (got.length < 200) break;
    }
    const mine = users.find((u) => (u.email || "").toLowerCase() === probeEmail.toLowerCase());
    const stale = users.filter((u) =>
      /@securejobva-guard\.invalid$/i.test(u.email || "") &&
      (!mine || u.id !== mine.id) &&
      Date.now() - Date.parse(u.created_at) > ABANDONED_MS);

    let gone = 0, stuck = 0;
    for (const u of [].concat(mine || [], stale)) {
      const d = await fetch(authBase + "/admin/users/" + u.id, { method: "DELETE", headers: H });
      if (d.ok) gone++; else stuck++;
    }
    deleted = gone;

    if (!mine && !stale.length) {
      console.log("  ok      no probe row to clear — sign-up created none");
    } else {
      console.log("  ok      probe cleared" +
        (stale.length ? ", and " + stale.length + " abandoned from earlier run(s)" : "") +
        " — " + gone + " removed" + (stuck ? ", " + stuck + " could not be" : ""));
    }
  }
} catch (e) {
  console.log("  note    probe account " + probeEmail + " may still be there — " + e.message);
}

/* What this run wrote, said on every exit — and only what it knows it wrote.
   A sign-up that came back confirmed or with a session made a row. One that
   was refused outright made none and mailed nobody. One that threw, or failed
   with a 5xx, may or may not have got as far as the row: the usual 500 is
   GoTrue failing to send the confirmation, after it has written the user. The
   deletion count is said either way, because the sweep also clears probe
   accounts left behind by earlier runs. */
const cleared = deleted ? deleted + " probe account(s) deleted" : "none deleted here";
const wrote = !PROBE_SIGNUP
  ? "No rows written."
  : signup === "confirmed" || signup === "breach"
    ? "--probe-signup: one auth.users row created, " + cleared +
      "; GoTrue may have tried to mail " + probeEmail + "."
    : signup === "refused"
      ? "--probe-signup: sign-up was refused, so no auth.users row was created and no mail sent; " +
        cleared + "."
      : "--probe-signup: sign-up did not finish (" + signup + "), so an auth.users row may have " +
        "been created; " + cleared + ".";

if (fails.length) {
  console.log("FAILED: " + fails.join(", "));
  console.log(wrote);
  console.log("");
  process.exit(1);
}
console.log("Both tables: insert-only, as designed. " + SEALED.length + " others sealed. " + wrote);
/* Only the verdict that was actually reached. */
if (signup === "confirmed" || signup === "refused") {
  console.log("An email claim still has to be earned. No session was issued to the probe.");
} else if (signup === "not run") {
  console.log("Whether sign-up needs a confirmed address was not checked this run.");
} else {
  console.log("Whether sign-up needs a confirmed address is UNKNOWN this run — see the warn above.");
}
console.log("");
