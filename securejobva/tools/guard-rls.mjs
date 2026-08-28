/* Data guard. Asserts that the publishable key still cannot read anybody.

   supabase.sql explains the arrangement: the key in the page source is public,
   and it is safe only because RLS lets it INSERT and nothing else. That is one
   toggle in a dashboard away from being untrue, and nothing in this repo would
   change when it happened — the pages would keep working perfectly while the
   applicant list became readable by anyone who viewed source.

   So it is checked against the live database rather than assumed from the SQL.

   Run: node tools/guard-rls.mjs

   Nothing here writes a row. The insert probe deliberately names a column that
   does not exist, so it proves the key still authenticates and gets as far as
   the schema, then stops there.

   Exit status is 1 if applicant data is readable, so this can run on a
   schedule and shout. */
import { readFileSync } from "node:fs";

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
const SEALED = [
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
  ["timesheet_days",       "what each assistant worked, day by day"]
];

/* The functions are SECURITY DEFINER, so a missing grant is the only thing
   stopping the public key calling them. is_admin() answering at all would be
   bad; my_permissions() answering would be worse. */
const RPCS = ["is_admin", "my_permissions", "list_role_grants", "list_account_requests"];
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
    if (r.ok) {
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

if (fails.length) {
  console.log("FAILED: " + fails.join(", "));
  console.log("");
  process.exit(1);
}
console.log("Both tables: insert-only, as designed. No rows written.");
console.log("");
