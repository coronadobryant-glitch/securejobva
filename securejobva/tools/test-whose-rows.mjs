/* Whose rows is a portal page showing?

   Every portal page asks the database for its rows and, for most of this
   project's life, took the answer as final — "the policy returns only rows
   carrying this address, so there is no filter here to get wrong". That is
   true of an applicant and false of anyone holding a role, because every one
   of those SELECT policies ends with an or on has_permission so that /admin
   can read the queue at all.

   Nothing caught it, because nothing was wrong with the markup. Signed in as
   staff, /status listed five strangers' applications under "Where you are in
   the process"; /hub opened as the newest applicant and greeted her by name;
   /seats put another company on the account. And the edit form binds to the
   first row, so Save changes sent a PATCH to somebody else's application —
   which "admins move an application along" in sql/003 is perfectly happy to
   accept.

   So this asks the question a harness can ask: handed rows belonging to
   several people, does the page keep only the reader's? Both halves matter.
   The static half fails if a page stops narrowing at all, which is the shape
   the bug actually had. The behavioural half runs the real functions out of
   the built pages and checks they draw the line in the right place.

   Nothing here touches the network or the database.

   Run: node tools/test-whose-rows.mjs */
import { readFileSync, existsSync, readdirSync } from "node:fs";

function grab(html, name, file) {
  const at = html.indexOf("function " + name + "(");
  if (at < 0) throw new Error("cannot find " + name + "() in " + file);
  let depth = 0, i = html.indexOf("{", at);
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") { depth--; if (!depth) return html.slice(at, i + 1); }
  }
  throw new Error("unbalanced " + name + " in " + file);
}

let failed = 0;
function ok(what, got, want, note) {
  const pass = got === want;
  if (!pass) failed++;
  console.log("  " + (pass ? "ok    " : "FAIL  ") + what +
    (pass ? (note ? "  — " + note : "") : "  got " + JSON.stringify(got) + ", want " + JSON.stringify(want)));
}

/* The identity helpers, lifted out of a real built page and given a token to
   read instead of a browser. */
function load(file) {
  const html = readFileSync(file, "utf8");
  const NAMES = ["whoAmI", "isMine", "onlyMine", "forApplication", "myClientIds"];
  return new Function(
    "var TOK = { sub: '', email: '' };\n" +
    "function session() { return { access_token: 'stub' }; }\n" +
    "function readToken() { return TOK; }\n" +
    NAMES.map((n) => grab(html, n, file)).join("\n") +
    "\nreturn { as: function (uid, em) { TOK = { sub: uid, email: em }; }, " +
    NAMES.map((n) => n + ": " + n).join(", ") + " };"
  )();
}

/* ── the static half: a page that stops narrowing fails here ───────────── */
console.log("\n  Every portal page still narrows what it was handed");

const NARROWS = [
  ["status.html", ["onlyMine("],
    [["applications?select=", ["email", "user_id"]]]],
  ["hub.html", ["onlyMine(", "forApplication("],
    [["applications?select=", ["email", "user_id"]]]],
  ["seats.html", ["onlyMine(", "myClientIds("],
    [["seat_requests?select=", ["email"]],
     ["placements?select=", ["client_id"]],
     ["client_payments?select=", ["client_id"]]]],
  ["pay.html", ["myClientIds(", "onlyMine("],
    [["placements?select=", ["client_id"]],
     ["client_payments?select=", ["client_id"]]]]
];

for (const [file, calls, selects] of NARROWS) {
  if (!existsSync(file)) { ok(file + ": built", false, true, "missing"); continue; }
  const html = readFileSync(file, "utf8");
  for (const c of calls) {
    ok(file + ": calls " + c + ")", html.includes(c), true);
  }
  /* A filter is only as good as the column it compares. A select that quietly
     drops one turns the narrowing into an error at best and an empty page at
     worst, so the columns are checked rather than assumed. */
  for (const [q, cols] of selects) {
    const at = html.indexOf(q);
    const list = at < 0 ? "" : html.slice(at, at + 400);
    for (const col of cols) {
      ok(file + ": " + q + " carries " + col,
         at > -1 && new RegExp("[?&,]" + col + ",").test(list), true);
    }
  }
}

/* ── the behavioural half ──────────────────────────────────────────────── */
console.log("\n  Staff are handed everybody's rows and must keep only their own");

const QUEUE = [
  { id: "a1", email: "Test.Walk@example.com", user_id: null },
  { id: "a2", email: "someone@else.com",      user_id: "uid-else" },
  { id: "a3", email: "third@party.com",       user_id: null },
  { id: "a4", email: "staff@securejobva.com", user_id: "uid-staff" }
];

for (const file of ["status.html", "hub.html"].filter((f) => existsSync(f))) {
  const p = load(file);

  /* The reader who caused all of this: a real account, holding a role, whose
     own application is one row of four. */
  p.as("uid-staff", "staff@securejobva.com");
  const mine = p.onlyMine(QUEUE);
  ok(file + ": a role keeps one row of four", mine.length, 1);
  ok(file + ": and it is their own", mine[0] && mine[0].id, "a4");

  /* The case that must not have changed. An applicant was always handed one
     row and must still be handed it. */
  p.as("", "third@party.com");
  ok(file + ": an applicant still sees their own", p.onlyMine(QUEUE).length, 1);

  /* Google hands back an address in whatever case the person typed, and the
     policies compare lowered. This has to agree with them, or an applicant
     loses her own application to a capital letter. */
  p.as("", "TEST.WALK@EXAMPLE.COM");
  ok(file + ": the address is matched without case", p.onlyMine(QUEUE)[0].id, "a1");

  /* Claimed by account id after signing in with an address other than the one
     she applied with, which is what claim_my_applications exists to do. */
  p.as("uid-else", "nothing@matching.com");
  ok(file + ": the account id counts as much as the address", p.onlyMine(QUEUE)[0].id, "a2");

  p.as("uid-nobody", "nobody@nowhere.com");
  ok(file + ": a stranger keeps nothing", p.onlyMine(QUEUE).length, 0);

  /* The failure worth being loud about. A select that forgets the two columns
     would otherwise filter an applicant's own row away and show her a portal
     that says nothing is wrong with it. */
  let threw = false;
  try { p.onlyMine([{ id: "x", status: "hired" }]); } catch (e) { threw = true; }
  ok(file + ": a row with no identity on it is an error, not a no", threw, true);
}

console.log("\n  Rows hanging off one application, and one client");

const h = load("hub.html");
h.as("uid-staff", "staff@securejobva.com");
const WEEKS = [
  { id: "w1", application_id: "a4" },
  { id: "w2", application_id: "a1" },
  { id: "w3", application_id: "a4" }
];
ok("weeks are kept by the application they hang off",
   h.forApplication("a4", WEEKS).map((w) => w.id).join(","), "w1,w3");
ok("and an application with none keeps none",
   h.forApplication("a9", WEEKS).length, 0);

/* Whichever table the policy reads, the page has to read the same one.

   This is here because the page did not. is_client_contact() moved from
   clients to client_private in 039 — "a client has a name" and everything
   private went with it — and the narrowing added later asked
   clients?select=id,contact_email against a column that had not existed for
   twenty migrations. PostgREST answered 42703, the catch turned that into an
   empty list, and every client's placements were filtered away: /seats and
   /pay would have shown a real client nothing at all.

   Nothing caught it. The behavioural test below fed myClientIds() rows it had
   made up, so it proved the comparison worked while never touching the column
   name; and there was no client in the database that week to notice. */
const fence = readdirSync("sql")
  .filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort()
  .map((f) => readFileSync("sql/" + f, "utf8"))
  .join("\n")
  .split("create or replace function public.is_client_contact")
  .pop();
const fenceTable = (fence.match(/from public\.(\w+)/) || [])[1];
ok("the policy's own table is findable", !!fenceTable, true, fenceTable);
for (const file of ["seats.html", "pay.html"].filter((f) => existsSync(f))) {
  const html = readFileSync(file, "utf8");
  ok(file + ": asks " + fenceTable + ", the table the policy asks",
     html.includes(fenceTable + "?select="), true);
  ok(file + ": does not ask clients for a contact it no longer holds",
     /clients\?select=[^"']*contact_email/.test(html), false);
}

const c = load("pay.html");
c.as("uid-boss", "boss@theircompany.com");
/* Keyed the way client_private really is: client_id, not id. */
const CLIENTS = [
  { client_id: "c1", contact_email: "Boss@TheirCompany.com" },
  { client_id: "c2", contact_email: "other@firm.com" },
  { client_id: "c3", contact_email: null }
];
const owned = c.myClientIds(CLIENTS);
ok("a client contact is matched without case", owned.c1 === true, true);
ok("another company is not mine", owned.c2 === undefined, true);
ok("a client with no contact address is nobody's", owned.c3 === undefined, true);
c.as("uid-staff", "staff@securejobva.com");
ok("a role is not a client", Object.keys(c.myClientIds(CLIENTS)).length, 0);

console.log("");
if (failed) {
  console.log("  " + failed + " failed");
  process.exit(1);
}
console.log("  Every portal page shows the reader their own rows and nobody else's.");
