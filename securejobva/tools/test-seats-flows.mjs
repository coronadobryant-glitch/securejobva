/* What a client is told about their own placement, at each turn the 1 October
   flow review found the page silent or wrong.

   Every one of these was a page that rendered and looked fine:

   - a seat request linked to the business (sql/102) but sent from another
     address belonged to nobody, so the enquiry sat under one sign-in and the
     assistant and the bill under another (F15);
   - a confirmed interview had no Move and no Cancel (F18 — driven in
     test-interview.mjs alongside her side of it);
   - a client who met the assistant and did not want her was told she "keeps
     working and you keep being billed as normal" before she had worked a
     minute (F19);
   - an approval the database refused, because staff had already decided the
     week, reloaded as if it had saved (F21);
   - /seats and /pay promised an invoice and a weekly summary that nothing
     sends (F23);
   - a swap request staff dealt with simply vanished (F25);
   - there was no way to say "we're keeping her on" (F26);
   - an ended placement disappeared without a word while its bill stayed (F27),
     and a last day set ahead of time (sql/109) was nowhere on the page.

   The real functions are lifted out of the built seats.html and pay.html and
   handed rows, the way tools/simulate.mjs does it. Nothing here touches the
   network or the database.

   Run: node tools/test-seats-flows.mjs */
import { readFileSync } from "node:fs";

function scriptOf(file) {
  const html = readFileSync(file, "utf8");
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
}
function grab(js, name) {
  const at = js.indexOf("function " + name + "(");
  if (at < 0) throw new Error("cannot find " + name + "() — has the page been regenerated?");
  let d = 0, i = js.indexOf("{", at);
  for (; i < js.length; i++) {
    if (js[i] === "{") d++;
    else if (js[i] === "}") { d--; if (!d) return js.slice(at, i + 1); }
  }
  throw new Error("unbalanced " + name);
}

const SEATS = scriptOf("seats.html");
const PAY = scriptOf("pay.html");

const esc = (s) => String(s === null || s === undefined ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* 1 October 2026, noon Central. */
const NOW = Date.parse("2026-10-01T17:00:00Z");

const FNS = ["when", "tzOpts", "browserTz", "slotDay", "slotClock", "slotLabel", "slotAlso",
             "slotState", "cIso", "cFrom", "cHours", "cNum", "cMoney", "cCents", "cWeekLabel",
             "cDays", "todayLocal", "slotRow", "interviewBlock", "clientBlock", "placeBlock",
             "whoAmI", "isMine", "onlyMine", "myClientIds", "mySeatRows"];

const page = new Function("esc", "serverNow",
  "var TOK = { sub: '', email: '' };\n" +
  "function session() { return { access_token: 'stub' }; }\n" +
  "function readToken() { return TOK; }\n" +
  "var C_LABEL = { matched: 'matched', trial: 'on trial', ongoing: 'kept on', ended: 'ended' };\n" +
  "var C_DAY = ['M','T','W','T','F','S','S'];\n" +
  "var C_PLACE = [], C_RATE = {}, C_WEEKS = [], C_SWAPS = [], C_STARTS = [], C_NAMES = [];\n" +
  "var C_SLOTS = [], MY_TZ = null, CENTRAL = 'America/Chicago', MY_CLIENTS = {};\n" +
  "var C_WEEK_LIMIT = 260, C_TRUNCATED = false;\n" +
  FNS.map((n) => grab(SEATS, n)).join("\n") +
  "\nreturn { as: function (uid, em) { TOK = { sub: uid, email: em }; }," +
  " set: function (s) { C_PLACE = s.C_PLACE || []; C_SWAPS = s.C_SWAPS || []; C_SLOTS = s.C_SLOTS || [];" +
  " C_NAMES = s.C_NAMES || []; MY_CLIENTS = s.MY_CLIENTS || {}; }, " +
  FNS.map((n) => n + ": " + n).join(", ") + " };"
)(esc, () => NOW);

let failed = 0;
function ok(what, got, want, note) {
  const pass = got === want;
  if (!pass) failed++;
  console.log("  " + (pass ? "ok    " : "FAIL  ") + what +
    (pass ? (note ? "  — " + note : "") : "  got " + JSON.stringify(got) + ", want " + JSON.stringify(want)));
}

const NAMES = [{ application_id: "a1", name: "Maria Santos" }, { application_id: "a2", name: "Ana Cruz" }];
const pl = (over) => Object.assign({
  id: "p1", client_id: "c1", application_id: "a1", status: "matched",
  started_on: "2026-10-12", ended_on: null, hours_per_week: 30, trial_weeks: 2
}, over || {});
function card(place, extra) {
  page.set(Object.assign({ C_PLACE: [place], C_NAMES: NAMES }, extra || {}));
  return page.placeBlock(place, 0);
}

/* ── F15 ─────────────────────────────────────────────────────────────────── */
console.log("\n  A seat request is the business's, by address or by link (sql/102)");
{
  const ROWS = [
    { id: "r1", email: "boss@theirco.com", client_id: null },
    { id: "r2", email: "office@theirco.com", client_id: "c1" },
    { id: "r3", email: "someone@else.com", client_id: "c2" },
    { id: "r4", email: "someone@else.com", client_id: null }
  ];
  page.as("uid-boss", "boss@theirco.com");
  page.set({ MY_CLIENTS: { c1: true } });
  const mine = page.mySeatRows(ROWS).map((r) => r.id).join(",");
  ok("the request sent from another address but linked to my business is mine", mine, "r1,r2");
  page.set({ MY_CLIENTS: {} });
  ok("with no link it is matched by address alone, as before",
     page.mySeatRows(ROWS).map((r) => r.id).join(","), "r1");
  page.as("uid-staff", "staff@securejobva.com");
  ok("a role is handed everybody's and keeps none", page.mySeatRows(ROWS).length, 0);
  ok("the select asks for the link", /seat_requests\?select=[^"]*",?\s*\+?\s*"?[^"]*client_id/.test(SEATS) ||
     SEATS.includes("status_changed_at,client_id&order"), true);
  ok("and falls back to the old select before 102 is pasted",
     /status_changed_at&order=created_at\.desc/.test(grab(SEATS, "seatRows")), true);
}

/* ── F19 ─────────────────────────────────────────────────────────────────── */
console.log("\n  Not this person, before she has started");
{
  const m = card(pl());
  ok("a matched placement asks 'not the right person?'", m.includes("Not the right person?"), true);
  ok("and never says she keeps working", /keeps working|still working/.test(m), false);
  ok("nor that they are being billed", /billed as normal/.test(m), false);
  ok("it says nothing has been billed", m.includes("nothing has been billed"), true);
  ok("the button says what it does", m.includes("Not this person"), true);

  const asked = card(pl(), { C_SWAPS: [{ id: "s1", placement_id: "p1", status: "open",
                                         created_at: "2026-09-30T10:00:00Z" }] });
  ok("once asked, it says she has not started", asked.includes("She has not started"), true);
  ok("and still not that she is working", /still working|billed as normal/.test(asked), false);

  const ahead = card(pl({ status: "trial", started_on: "2026-10-05" }));
  ok("a trial whose first day is ahead is not started either", ahead.includes("Not the right person?"), true);
  ok("and the header says starting, not with you since", /starting /.test(ahead) && !/with you since/.test(ahead), true);

  const going = card(pl({ status: "trial", started_on: "2026-09-21" }));
  ok("once she has started it is 'not working out?'", going.includes("Not working out?"), true);
  ok("with the old, true, wording", going.includes("keeps working"), true);
}

/* ── F25 ─────────────────────────────────────────────────────────────────── */
console.log("\n  A handled request says what happened (sql/107)");
{
  const done = card(pl({ status: "ongoing", started_on: "2026-08-03" }), { C_SWAPS: [
    { id: "s1", placement_id: "p1", status: "resolved", created_at: "2026-09-20T10:00:00Z",
      resolved_at: "2026-09-25T10:00:00Z", resolution_note: "Ana starts on the 6th <b>" }
  ] });
  ok("the note staff wrote is shown", done.includes("Ana starts on the 6th"), true);
  ok("escaped", done.includes("6th <b>"), false);
  ok("with the request's date", done.includes("We dealt with your request of"), true);
  ok("and the form is there for a new one", done.includes("data-swap-go"), true);

  const bare = card(pl({ status: "ongoing", started_on: "2026-08-03" }), { C_SWAPS: [
    { id: "s1", placement_id: "p1", status: "resolved", created_at: "2026-09-20T10:00:00Z",
      resolved_at: "2026-09-25T10:00:00Z" }
  ] });
  ok("before 107 there are no words, and it says where to ask", bare.includes("support@securejobva.com"), true);

  const old = card(pl({ status: "ongoing", started_on: "2026-01-05" }), { C_SWAPS: [
    { id: "s1", placement_id: "p1", status: "resolved", created_at: "2026-03-01T10:00:00Z",
      resolved_at: "2026-03-02T10:00:00Z", resolution_note: "long ago" }
  ] });
  ok("a request dealt with months ago is not on the page for good", old.includes("long ago"), false);
}

/* ── F26 ─────────────────────────────────────────────────────────────────── */
console.log("\n  Keeping her on (sql/108)");
{
  const t = card(pl({ status: "trial", started_on: "2026-09-21" }));
  ok("a trial that has begun offers 'we're keeping her on'", t.includes('data-keep-go'), true);
  ok("naming her", t.includes("keeping Maria on"), true);
  ok("and saying it does not change the bill", t.includes("does not change what you pay"), true);
  ok("not before her first day", card(pl({ status: "trial", started_on: "2026-10-05" })).includes("data-keep-go"), false);
  ok("not when matched", card(pl()).includes("data-keep-go"), false);
  ok("not once kept on", card(pl({ status: "ongoing", started_on: "2026-08-03" })).includes("data-keep-go"), false);
  ok("the button calls keep_placement_on with the placement",
     /rpc\/keep_placement_on", \{ method: "POST", body: \{ placement:/.test(grab(SEATS, "wireKeep")), true);
}

/* ── F18 on a trial ──────────────────────────────────────────────────────── */
console.log("\n  A called-off interview can be arranged again");
{
  const t = card(pl({ status: "trial", started_on: "2026-10-05" }));
  ok("a trial not yet started, with no times left, offers times again", t.includes("data-iv-offer"), true);
  const g = card(pl({ status: "trial", started_on: "2026-09-21" }));
  ok("a trial already under way does not", g.includes("data-iv-offer"), false);
  const w = grab(SEATS, "wireInterview");
  ok("Move posts slot, at_time and why", /reschedule_placement_interview", \{\s*slot:[^}]*at_time:[^}]*why:/.test(w), true);
  ok("Call it off posts slot and why, after asking", /confirm\([\s\S]*cancel_placement_interview", \{\s*slot:[^}]*why:/.test(w), true);
}

/* ── F27, F28 ────────────────────────────────────────────────────────────── */
console.log("\n  An ended placement keeps a line");
{
  page.set({ C_PLACE: [pl({ id: "p2", application_id: "a2", status: "ended", started_on: "2026-06-01",
                            ended_on: "2026-09-18" })], C_NAMES: NAMES });
  const v = page.clientBlock();
  ok("it is not simply gone", v.includes("Ana Cruz"), true);
  ok("it says when", v.includes("ended on"), true);
  ok("and where the money went", v.includes("stay on your bill"), true);
  ok("with no controls on it", /data-(swap|keep|start)-go|data-c-yes/.test(v), false);

  const soon = card(pl({ status: "ongoing", started_on: "2026-08-03", ended_on: "2026-10-16" }));
  ok("a last day set ahead (sql/109) is on the card", soon.includes("last day"), true);
}

/* ── F21 ─────────────────────────────────────────────────────────────────── */
console.log("\n  A week already decided says so");
{
  const w = grab(SEATS, "wireWeeks");
  ok("the approval asks for the row back", w.includes("return=representation"), true);
  ok("only the two columns the page reads", w.includes("&select=id,status"), true);
  ok("an empty answer is not taken for success", /saved && saved\.length/.test(w), true);
  ok("and the client is told who decided", w.includes("SecureJobVA had already decided this week"), true);
}

/* ── F23 ─────────────────────────────────────────────────────────────────── */
console.log("\n  Nothing promises a summary nobody sends");
/* Copy, not comments: the comments beside it quote the old promise on purpose. */
const words = (js) => js.replace(/\/\*[\s\S]*?\*\//g, "");
for (const [file, js] of [["seats.html", words(SEATS)], ["pay.html", words(PAY)]]) {
  ok(file + ": no 'we invoice you separately'", /invoice you separately/.test(js), false);
  ok(file + ": no weekly summary with the details", /week&rsquo;s summary|each week.s summary/.test(js), false);
  ok(file + ": says where the bank details come from", /For our bank details/.test(js), true);
}

console.log("");
if (failed) {
  console.log("  " + failed + " failed");
  process.exit(1);
}
console.log("  Every turn of the client's placement says what is true on it.");
