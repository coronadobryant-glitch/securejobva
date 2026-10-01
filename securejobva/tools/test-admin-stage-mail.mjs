/* The question /admin asks before a stage change that emails her, held to
   the emails that actually go. Offline: reads admin.html, api/notify.js and
   the sql/ folder, and sends nothing.

   Picking a stage writes it on the spot and the database mails her at once,
   so a slip of the mouse used to send a real person "About your application"
   or "You are on the team" with no way back (F31). stageOk() now asks first
   and names the email. That only helps while the name is right, and the
   names live in three places:

     sql/096 (notify_decision)   which stages send anything at all
     api/notify.js               the subject each one goes out with
     admin.html STAGE_MAIL_SAYS  what the question says will go

   A stage that mails her and is not asked about is the original bug; a
   subject that has drifted is a question naming an email she will not get.
   This fails on either.

   Run: node tools/test-admin-stage-mail.mjs */
import { readFileSync, readdirSync } from "node:fs";

const html = readFileSync("admin.html", "utf8");
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
const notify = readFileSync("api/notify.js", "utf8");

function grab(name) {
  const at = js.indexOf("function " + name + "(");
  if (at < 0) throw new Error("cannot find " + name + "() in admin.html");
  let depth = 0, i = js.indexOf("{", at);
  for (; i < js.length; i++) {
    if (js[i] === "{") depth++;
    else if (js[i] === "}") { depth--; if (!depth) return js.slice(at, i + 1); }
  }
  throw new Error("unbalanced " + name);
}
function grabVar(name) {
  const at = js.indexOf("var " + name + " = {");
  if (at < 0) throw new Error("cannot find var " + name + " in admin.html");
  let depth = 0, i = js.indexOf("{", at);
  for (; i < js.length; i++) {
    if (js[i] === "{") depth++;
    else if (js[i] === "}") { depth--; if (!depth) return js.slice(at, i + 1) + ";"; }
  }
  throw new Error("unbalanced " + name);
}

let ok = 0;
const fails = [];
function is(what, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { ok++; console.log("  ok    " + what); return; }
  fails.push(what);
  console.log("  FAIL  " + what + "\n          got " + g + "\n          want " + w);
}

const SAYS = new Function(grabVar("STAGE_MAIL_SAYS") + "\nreturn STAGE_MAIL_SAYS;")();

/* Which stages mail her, from the newest migration that says so. */
const sqlDir = "sql";
const files = readdirSync(sqlDir).filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort();
let mailing = null;
for (const f of files) {
  const s = readFileSync(sqlDir + "/" + f, "utf8");
  const m = s.match(/tg_table_name = 'applications' then\s*ev := case when new\.status in \(([^)]*)\)/);
  if (m) mailing = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}
if (!mailing) throw new Error("no migration says which application stages are emailed");

is("every stage that emails her is asked about, and nothing else is",
   Object.keys(SAYS).sort(), mailing.slice().sort());

/* The subjects api/notify.js sends them with. */
const block = notify.slice(notify.indexOf("const STAGE_MAIL = {"));
const subjects = {};
for (const k of mailing) {
  if (k === "declined") continue;
  const at = block.search(new RegExp("\\n  " + k + ": \\{"));
  const m = at < 0 ? null : block.slice(at).match(/subject: "([^"]+)"/);
  subjects[k] = m ? m[1] : null;
}
const dec = notify.match(/r\.status === "declined"[\s\S]*?subject: "([^"]+)"/);
subjects.declined = dec ? dec[1] : null;

for (const k of mailing) {
  is("the " + k + " question names the email that goes", SAYS[k] && SAYS[k][0], subjects[k]);
}

/* ── stageOk itself ──────────────────────────────────────────────────────── */
const asked = [];
let answer = true;
const window = { confirm(m) { asked.push(m); return answer; } };
const LABEL = { applied: "Applied", assessment: "Assessment", interview: "Interview",
  approved: "Approved", hired: "Hired", declined: "Declined" };
const stageOk = new Function("window", "LABEL", "STAGE_MAIL_SAYS",
  grab("stageOk") + "\nreturn stageOk;")(window, LABEL, SAYS);

const sel = (v) => ({ value: v });
const her = { name: "Ana", status: "interview" };

asked.length = 0;
is("moving her back to Applied, which mails nothing, is not asked", stageOk(sel("applied"), her), true);
is("…and no question is shown", asked.length, 0);

asked.length = 0;
answer = true;
is("declining her asks first and goes ahead on yes", stageOk(sel("declined"), her), true);
is("…once", asked.length, 1);
is("…naming her", asked[0].indexOf("Ana") > -1, true);
is("…naming the email", asked[0].indexOf("“About your application”") > -1, true);
is("…and saying it cannot be taken back", asked[0].indexOf("cannot be taken back") > -1, true);

asked.length = 0;
answer = false;
const s = sel("hired");
is("a no stops the save", stageOk(s, her), false);
is("…and puts the dropdown back where the database has her", s.value, "interview");

console.log("");
if (fails.length) {
  console.log(fails.length + " failed of " + (ok + fails.length));
  process.exit(1);
}
console.log(ok + " behaviours, every emailing stage asked about by its own subject");
