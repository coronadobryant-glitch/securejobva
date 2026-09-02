/* Can the product forget somebody, and only in the ways it is meant to?

   sql/060 gives staff DELETE on four tables. The interesting assertions are
   almost all about what it does NOT give, because a delete grant is the
   easiest thing in this schema to add carelessly and the hardest to notice:
   nothing looks wrong on a page that holds a privilege it never uses.

   Three deliberate omissions, each of which would pass every other check in
   this repo if it were quietly reversed:

     interview_slots  057 gives it SELECT and nothing else, and does every
                      write through one of five functions, because two people
                      write different columns of the same row. A delete grant
                      is a way round all of it.
     timesheets       a week that can be deleted on its own is a bill that can
                      be reduced after it was agreed.
     client_private   039 cascades it from the client, so a grant here would
                      be a privilege that is never the thing doing the work.

   And one about friction: the button that removes a person ships disabled and
   is enabled by typing their name. A build that emitted it enabled would look
   identical in every screenshot.

   Nothing here touches the network or the database.

   Run: node tools/test-forgetting.mjs */
import { readFileSync, existsSync, readdirSync } from "node:fs";

let failed = 0;
function ok(what, got, want, note) {
  const pass = got === want;
  if (!pass) failed++;
  console.log("  " + (pass ? "ok    " : "FAIL  ") + what +
    (pass ? (note ? "  — " + note : "") : "  got " + JSON.stringify(got) + ", want " + JSON.stringify(want)));
}

/* Every numbered migration, so a grant added anywhere is seen — not just the
   one file this feature happens to live in. */
const SQL = readdirSync("sql")
  .filter((f) => /^\d{3}-.*\.sql$/.test(f))
  .map((f) => ["sql/" + f, readFileSync("sql/" + f, "utf8")]);
const ALL_SQL = SQL.map(([, t]) => t).join("\n");

/* Comments carry the words "grant delete" all over this repo, so they have to
   go before anything is counted or the reasoning reads as the code. */
const CODE = ALL_SQL.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n");

function grantsDeleteOn(table) {
  return new RegExp("grant\\s+delete\\s+on\\s+public\\." + table + "\\s+to", "i").test(CODE);
}

console.log("\n  What may be deleted");

for (const t of ["applications", "placements", "clients", "contact_messages"]) {
  ok("staff may remove a " + t.replace(/s$/, ""), grantsDeleteOn(t), true);
}

console.log("\n  What may not, and the reason it may not");

const FORBIDDEN = [
  ["interview_slots", "057 does every write through five functions"],
  ["timesheets", "a deletable week is a reducible bill"],
  ["client_private", "039 already cascades it from the client"],
  ["application_assessment", "054 closes a part rather than removing it"],
  ["deletion_log", "the record that a deletion happened"]
];
for (const [t, why] of FORBIDDEN) {
  ok("nothing may delete " + t, grantsDeleteOn(t), false, why);
}

/* timesheet_days is the one exception and has been since 030: an assistant
   clears a day on a week she has not sent yet. That grant is fine and the
   fence around it is the thing worth guarding — without timesheet_open() it
   would let anybody rub out a day of a week already approved and billed. */
ok("timesheet_days may be cleared only while the week is open",
   /on public\.timesheet_days for delete to authenticated\s*\n\s*using \(public\.timesheet_open\(/.test(ALL_SQL),
   true, "030, and deliberate");

console.log("\n  The permission each delete asks for");

/* Reading the queue and emptying it are not the same right. 055 draws that
   line for money and 060 has to draw it the same way, or view_all quietly
   becomes the permission that can erase the business. */
const D060 = existsSync("sql/060-forgetting-somebody.sql")
  ? readFileSync("sql/060-forgetting-somebody.sql", "utf8") : "";
ok("060 is present", D060.length > 0, true);

const policies = [...D060.matchAll(/create policy "([^"]+)"\s+on public\.(\w+) for delete[\s\S]*?using \(([^;]+)\);/g)];
ok("every delete has a policy", policies.length, 4);
for (const [, name, table, using] of policies) {
  ok(table + ": asks for applications.edit",
     /has_permission\('applications\.edit'\)/.test(using), true, name);
}

console.log("\n  The record that it happened");

ok("deletion_log is revoked from both roles",
   /revoke all on public\.deletion_log from anon, authenticated;/.test(D060), true);
ok("row level security is on it",
   /alter table public\.deletion_log enable row level security;/.test(D060), true);
ok("signed-in accounts may read it and nothing more",
   /grant select on public\.deletion_log to authenticated;/.test(D060) &&
   !/grant (insert|update|delete)[^;]*on public\.deletion_log/i.test(CODE), true);
ok("it is written by a trigger, not by a page",
   /create trigger \w+_log_deletion/.test(D060), true);
ok("one on each of the four tables",
   (D060.match(/create trigger \w+_log_deletion/g) || []).length, 4);
/* A log that carries the person defeats the point of removing them. */
for (const col of ["name", "email", "phone", "message", "cv"]) {
  const table = (D060.match(/create table if not exists public\.deletion_log \(([\s\S]*?)\n\);/) || [])[1] || "";
  ok("the log carries no " + col, new RegExp("^\\s+" + col + "\\s", "m").test(table), false);
}

console.log("\n  The friction on the one that cannot be undone");

if (!existsSync("admin.html")) {
  ok("admin.html built", false, true, "missing");
} else {
  const html = readFileSync("admin.html", "utf8");
  ok("the remove button ships disabled",
     /data-forget-go[^>]*disabled|disabled[^>]*data-forget-go/.test(html), true);
  ok("typing the name is what enables it",
     html.includes("data-forget-want"), true);
  ok("the panel is closed until asked for",
     html.includes("data-forget-open"), true);

  /* Order matters and is the whole difference between a failed delete that
     can be cleaned up and one that destroyed a CV belonging to a record that
     still exists. */
  const rowAt = html.indexOf('api("applications?id=eq." + encodeURIComponent(a.id)');
  const fileAt = html.indexOf('"/object/applicant-docs/"', rowAt < 0 ? 0 : rowAt);
  ok("the row goes before the file", rowAt > -1 && fileAt > rowAt, true);

  /* One tick covering both outcomes would be a tick that is sometimes half
     true, and the half it hides is somebody's CV still in a bucket. */
  ok("a file that will not go is reported separately",
     html.includes("could not be removed"), true);

  ok("a message can be deleted", html.includes("data-msg-del"), true);
  ok("a placement can be removed", html.includes("data-pl-del"), true);
  ok("a client can be removed", html.includes("data-client-del"), true);
  ok("a client with a payment is refused in words, not in an error code",
     html.includes("recorded against them"), true);
}

console.log("");
if (failed) {
  console.log("  " + failed + " failed");
  process.exit(1);
}
console.log("  The product can forget somebody, and cannot do it by accident.");
