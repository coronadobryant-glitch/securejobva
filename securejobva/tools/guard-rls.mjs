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
const headers = (k) => ({
  apikey: k,
  Authorization: "Bearer " + k,
  "Content-Type": "application/json",
  Prefer: "return=minimal"
});

const fails = [];
console.log("");

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
if (fails.length) {
  console.log("FAILED: " + fails.join(", "));
  console.log("");
  process.exit(1);
}
console.log("Both tables: insert-only, as designed. No rows written.");
console.log("");
