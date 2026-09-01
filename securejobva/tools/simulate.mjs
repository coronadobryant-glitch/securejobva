/* One person, all the way through, driving the code that actually ships.

   Every other test here checks a piece: the policies in check.mjs, the dates
   and totals in test-timesheet.mjs, the wording in test-notify.mjs. Nothing
   checked that the pieces compose — that a week recorded in /hub is the week
   a client sees in /seats, and that the money on one screen never appears on
   the other.

   So this walks it: applied, exams, hired, matched, a week worked, sent,
   approved, billed. At each step it renders the real cards out of the built
   pages and runs the real /api/notify handler, then asserts what each party
   can see.

   What it cannot test: row-level security. These render functions are handed
   rows, and in production the database decides which rows they are handed.
   That fence is checked by tools/check.mjs reading the policies and by
   tools/guard-rls.mjs against the live database. This checks the half that
   runs in a browser.

   Run: node tools/simulate.mjs */
import { readFileSync } from "node:fs";
import handler from "../api/notify.js";

let bad = 0, step = 0;
const ok = (name, cond, note) => {
  console.log("    " + (cond ? "ok  " : "FAIL") + "  " + name + (note ? "  — " + note : ""));
  if (!cond) bad++;
};
const act = (what) => console.log("\n  " + (++step) + ". " + what);

/* How many of the seven day boxes are locked. Counted rather than looking for
   "disabled" anywhere in the card, which is always there — the Week-after
   button is disabled on the current week, so a plain includes() check went
   green whether or not a sent week was locked at all. */
const lockedDays = (card) => (card.match(/data-hrs[^>]*disabled/g) || []).length;

/* ── pull the real functions out of the built pages ─────────────────────── */

function scriptOf(file) {
  const html = readFileSync(file, "utf8");
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
}
function grab(js, name) {
  const at = js.indexOf("function " + name + "(");
  if (at < 0) throw new Error("cannot find " + name + "() — the page changed shape");
  let d = 0, i = js.indexOf("{", at);
  for (; i < js.length; i++) {
    if (js[i] === "{") d++;
    else if (js[i] === "}") { d--; if (!d) return js.slice(at, i + 1); }
  }
}
function varOf(js, name) {
  const at = js.indexOf("var " + name + " =");
  if (at < 0) throw new Error("cannot find var " + name);
  const close = js.indexOf(name === "DAY_NAME" || name === "C_DAY" ? "];" : "};", at);
  return js.slice(at, close + 2);
}

const HUB = scriptOf("hub.html");
const SEATS = scriptOf("seats.html");

/* esc() lives in the shared library; passing it in beats dragging the whole
   page into the sandbox. */
const esc = (s) => String(s === null || s === undefined ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const hubFns = ["when", "isoDay", "fromIso", "addDays", "mondayOf", "showHours", "dayIn",
                "totalOf", "unsentLabel", "weekLabel", "dayRow", "hoursCard", "pastWeeks",
                "trialEnds", "clientCard"];
const hub = new Function("esc",
  varOf(HUB, "DAY_NAME") + "\n" + varOf(HUB, "TS_LABEL") + "\n" + varOf(HUB, "PLACE_LABEL") + "\n" +
  "var WEEK_TARGET = 40;\nvar SHEETS = {}, VIEW = '', TS_OFF = false, PLACE = null, PLACE_OFF = false, APP = null;\n" +
  hubFns.map((n) => grab(HUB, n)).join("\n") +
  "\nreturn { set: function (s) { SHEETS = s.SHEETS; VIEW = s.VIEW; PLACE = s.PLACE; }," +
  hubFns.map((n) => n + ": " + n).join(", ") + " };"
)(esc);

/* placeBlock is where the body of a placement's cards moved when /seats
   learned to draw more than one of them. clientBlock is now the loop around
   it, so pulling only the loop into the sandbox gets a ReferenceError rather
   than a walk — which is what happened, and is the harness doing its job. */
/* The interview card arrived with sql/057 and placeBlock draws it, so the
   sandbox needs its helpers as well as its rows. C_SLOTS stays empty through
   this walk — the person it follows is placed and long past the interview —
   which is precisely the state that card is supposed to render as nothing at
   all, and worth having the walk assert by not tripping over it. */
const seatFns = ["when", "tzOpts", "browserTz", "slotDay", "slotClock", "slotLabel",
                 "slotAlso", "slotState", "cIso", "cFrom", "cHours", "cNum", "cMoney",
                 "cWeekLabel", "cDays", "todayLocal", "slotRow", "interviewBlock",
                 "clientBlock", "placeBlock"];
const seats = new Function("esc",
  varOf(SEATS, "C_LABEL") + "\n" + 'var C_DAY = ["M","T","W","T","F","S","S"];\n' +
  "var C_PLACE = [], C_RATE = {}, C_WEEKS = [], C_SWAPS = [], C_STARTS = [], C_NAMES = [], C_OFF = false;\n" +
  "var C_SLOTS = [], MY_TZ = null, CENTRAL = 'America/Chicago';\n" +
  "var C_WEEK_LIMIT = 260, C_TRUNCATED = false;\n" +
  seatFns.map((n) => grab(SEATS, n)).join("\n") +
  "\nreturn { set: function (s) { C_PLACE = s.C_PLACE; C_RATE = s.C_RATE; C_WEEKS = s.C_WEEKS;" +
  " C_SWAPS = s.C_SWAPS; C_STARTS = s.C_STARTS || []; C_NAMES = s.C_NAMES || [];" +
  " C_SLOTS = s.C_SLOTS || []; }, " + seatFns.map((n) => n + ": " + n).join(", ") + " };"
)(esc);

/* ── the mail, through the real endpoint ────────────────────────────────── */

let sent = [];
globalThis.fetch = async (url, opt) => {
  sent.push(JSON.parse(opt.body));
  return { ok: true, status: 200, text: async () => "" };
};
Object.assign(process.env, {
  WEBHOOK_SECRET: "sim", RESEND_API_KEY: "sim",
  NOTIFY_TO: "david@securejobva.com, bryant@securejobva.com",
  RESEND_FROM: "support@securejobva.com", SITE_URL: "https://www.securejobva.com"
});
const res = () => { const o = { code: 0, body: null }; o.status = (c) => { o.code = c; return o; };
  o.json = (b) => { o.body = b; return o; }; return o; };
async function fire(body) {
  sent = [];
  await handler({ method: "POST", headers: { "x-webhook-secret": "sim" }, body }, res());
  return sent;
}
const to = (m) => (m.to || []).join(", ");

/* ── the world ──────────────────────────────────────────────────────────── */

const A = { id: "a1", name: "Maria Santos", email: "maria@example.com",
            tracks: ["Customer Service"], status: "applied" };
const CLIENT = { id: "c1", name: "Rosehill Plumbing", contact_email: "ops@rosehill.com" };
/* clients and applications are nested here the way PostgREST nests an embed.
   Worth being honest about what that costs: this is a fake join, and a fake
   join always succeeds. Between 032 and 039 the real one came back null for an
   assistant — no policy on clients let her read it — so step 5 below asserted
   that her portal names the client and was green the whole time it did not.
   Nothing in a simulation can catch that, because the answer is decided by a
   policy in the database and this file has no database. The guard for it is
   static, in check.mjs: "an assistant may read the business she is placed
   with". If this embed is ever changed, that check is the other half. */
const PLACE = { id: "p1", application_id: A.id, client_id: CLIENT.id, status: "matched",
                started_on: "2026-09-07", hours_per_week: 40, trial_weeks: 2,
                /* clients is still an embed, because placements really does
                   have a foreign key to it. The assistant's name is not: 041
                   tried that and PostgREST answered 400, so /seats reads
                   application_public separately and it is passed in as
                   C_NAMES below. */
                clients: { name: CLIENT.name } };
const BILL = 7.75, PAY = 4.5;
/* The trial runs 7 to 20 September, so this first week is inside it and is
   ours to carry. The week beginning the 21st is the first the client pays for. */
const WEEK = { id: "w1", placement_id: PLACE.id, week_starts_on: "2026-09-07",
               status: "draft", note: null, trial_week: true, timesheet_days: [] };
const WEEK2 = { id: "w2", placement_id: PLACE.id, week_starts_on: "2026-09-21",
                status: "approved", note: null, trial_week: false,
                timesheet_days: ["2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25"]
                  .map(function (d, i) { return { id: "e" + i, worked_on: d, hours: "8.00" }; }) };

console.log("\nsimulation — one person, applied to billed\n");

/* ── 1 ── */
act("Maria applies");
{
  const m = await fire({ type: "INSERT", table: "applications", record: A });
  ok("you and Bryant are told", to(m[0]) === "david@securejobva.com, bryant@securejobva.com");
  ok("Maria gets the receipt", to(m[1]) === A.email);
  ok("it points her at /status", m[1].text.includes("/status"));
  ok("and carries no verdict", !/approved|rejected|congratulat/i.test(m[1].text));
}

/* ── 2 ── */
act("You move her to the exams");
{
  A.status = "assessment";
  const m = await fire({ type: "STATUS", event: "decided", table: "applications",
    person: { name: A.name, email: A.email }, record: { ...A } });
  ok("she is told, and nobody else", to(m[0]) === A.email && m.length === 1);
  ok("it names the exams", m[0].text.includes("strengths test"));
}

/* ── 3 ── */
act("She passes. You hire her");
{
  A.status = "hired";
  const m = await fire({ type: "STATUS", event: "decided", table: "applications",
    person: { name: A.name, email: A.email }, record: { ...A } });
  ok("she is told the portal is open", m[0].subject.includes("on the team"));
  ok("and pointed at /hub", m[0].text.includes("/hub"));
}

/* ── 4 ── */
act("She opens /hub before she has a client");
{
  hub.set({ SHEETS: {}, VIEW: "2026-09-07", PLACE: null });
  /* A blank space is not an answer. She is hired, the portal is open, and the
     one thing she wants to know is whether a client is coming. */
  const waiting = hub.clientCard();
  ok("she is told a client is being found", waiting.includes("Finding you a client"),
    "not an empty space where the answer should be");
  ok("and told there is nothing for her to do", waiting.includes("nothing for you to do"), true);
  ok("and that the email will come", waiting.includes("email you the moment"), true);
  const card = hub.hoursCard();
  ok("her week is already there", card.includes("Monday") && card.includes("Sunday"));
  ok("and measured against 40", card.includes("of 40 hours"));
}

/* ── 5 ── */
act("You match her to Rosehill Plumbing");
{
  hub.set({ SHEETS: {}, VIEW: "2026-09-07", PLACE });
  const card = hub.clientCard();
  ok("her portal names the client", card.includes("Rosehill Plumbing"));
  ok("and says nothing is settled yet", card.includes("nothing is settled"));
  ok("the date reads as a plan, not a fact", card.includes("would start"));
  ok("no money reaches her", !/\$|7\.75|4\.5/.test(card), "not even her own rate");
}

/* ── 6 ── */
act("Rosehill say yes. The trial starts");
{
  PLACE.status = "trial";
  hub.set({ SHEETS: {}, VIEW: "2026-09-07", PLACE });
  const card = hub.clientCard();
  ok("it says when the trial ends", card.includes("trial ends"));
  ok("worked out from the start plus two weeks",
    hub.trialEnds(PLACE) === "2026-09-20", hub.trialEnds(PLACE));
  ok("still no money", !/\$/.test(card));
}

/* ── 7 ── */
act("She works the week: 8, 8, 8, 8, 8");
{
  ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"].forEach((d, i) => {
    WEEK.timesheet_days.push({ id: "d" + i, worked_on: d, hours: "8.00", note: null });
  });
  hub.set({ SHEETS: { "2026-09-07": WEEK }, VIEW: "2026-09-07", PLACE });
  ok("her total is 40", hub.totalOf(WEEK) === 40);
  const card = hub.hoursCard();
  ok("the card reads 40 of 40 hours", card.includes("40 <small>of 40 hours"));
  ok("the tile says nothing is sent yet", hub.unsentLabel() === "40 h not sent");
}

/* ── 8 ── */
act("She sends the week");
{
  WEEK.status = "submitted";
  const m = await fire({ type: "STATUS", event: "arrived", table: "timesheets",
    person: { name: A.name, email: A.email },
    record: { ...WEEK, hours: 40, days: "Mon 8 · Tue 8 · Wed 8 · Thu 8 · Fri 8" } });
  ok("it lands with you, not with her", to(m[0]).includes("david@securejobva.com"));
  ok("reply reaches her", m[0].reply_to === A.email);
  ok("the days are in it", m[0].text.includes("Mon 8"));

  hub.set({ SHEETS: { "2026-09-07": WEEK }, VIEW: "2026-09-07", PLACE });
  ok("all seven days are locked once sent", lockedDays(hub.hoursCard()) === 7);
  ok("and there is no send button left", !hub.hoursCard().includes("Send this week"));
}

/* ── 9 ── */
act("Rosehill open /seats and see it waiting");
{
  seats.set({ C_PLACE: [PLACE], C_RATE: { p1: BILL }, C_WEEKS: [WEEK], C_SWAPS: [],
    C_NAMES: [{ application_id: A.id, name: A.name }] });
  const view = seats.clientBlock();
  ok("they see who works for them", view.includes("Maria Santos"));
  ok("the week is waiting on them", view.includes("waiting on you"));
  ok("with the days shown", view.includes("M 8") && view.includes("F 8"));
  ok("the row says free rather than a price", view.includes("free &mdash; trial"),
    "this one is inside the trial, and the trial costs them nothing");
  ok("the statement counts nothing yet", view.includes("Comes to</b><span>$0.00"),
    "unapproved hours are not owed");
  ok("what Maria is paid is nowhere on it", !view.includes("4.5") && !view.includes("$4.50"));
}

/* ── 10 ── */
act("They approve it");
{
  WEEK.status = "approved";
  const m = await fire({ type: "STATUS", event: "decided", table: "timesheets",
    person: { name: A.name, email: A.email },
    record: { ...WEEK, hours: 40, decided_by: CLIENT.contact_email } });
  ok("Maria is told", to(m[0]) === A.email);
  ok("it names the week and the hours",
    m[0].subject.includes("7 to 13 September") && m[0].text.includes("40 hours"));
  ok("it carries no link to /admin", !/\/admin/.test(m[0].text + m[0].html));
  ok("and names nobody else", !/rosehill|david@|bryant@/i.test(m[0].text));
}

/* ── 11 ── */
act("The statement moves");
{
  seats.set({ C_PLACE: [PLACE], C_RATE: { p1: BILL }, C_WEEKS: [WEEK], C_SWAPS: [],
    C_NAMES: [{ application_id: A.id, name: A.name }] });
  const view = seats.clientBlock();
  ok("the trial week is not charged for", view.includes("Comes to</b><span>$0.00"),
    "she is paid for it; we carry it");
  ok("but it is shown, not hidden", view.includes("Trial hours"),
    "so the weeks above still add up to the total");
  ok("and says who covers it", view.includes("we cover the trial"));
  ok("still nothing about what she is paid", !view.includes("$180.00"), "40 × $4.50");
}

/* ── 11b ── */
act("The trial ends. She works the first chargeable week");
{
  seats.set({ C_PLACE: [PLACE], C_RATE: { p1: BILL }, C_WEEKS: [WEEK, WEEK2], C_SWAPS: [] });
  const view = seats.clientBlock();
  ok("now they owe something", view.includes("Comes to</b><span>$310.00"),
    "40 × $7.75, the chargeable week only");
  ok("the trial week still shows as free", view.includes("Trial hours"));
  ok("chargeable hours count only the one week", view.includes("Chargeable hours</b><span>40"));
  ok("40 × $7.75 is exact", seats.cMoney(40 * BILL) === "$310.00", "no float dust");
}

/* ── 12 ── */
act("A week sent back instead");
{
  const m = await fire({ type: "STATUS", event: "decided", table: "timesheets",
    person: { name: A.name, email: A.email },
    record: { ...WEEK, status: "returned", hours: 40,
              note: "Thursday looks like a double entry — can you check?" } });
  ok("the reason is the message",
    m[0].text.includes("Thursday looks like a double entry"));
  ok("and she is told it reopens", m[0].text.includes("send it again"));

  const reopened = { ...WEEK, status: "returned",
    note: "Thursday looks like a double entry — can you check?" };
  hub.set({ SHEETS: { "2026-09-07": reopened }, VIEW: "2026-09-07", PLACE });
  const card = hub.hoursCard();
  ok("her week is editable again", lockedDays(card) === 0);
  ok("and carries the reason", card.includes("Thursday looks like a double entry"));
}

/* ── the property the whole thing rests on ──────────────────────────────── */

console.log("\n  the cut\n");
{
  hub.set({ SHEETS: { "2026-09-07": WEEK }, VIEW: "2026-09-07", PLACE });
  const hers = hub.clientCard() + hub.hoursCard();
  seats.set({ C_PLACE: [PLACE], C_RATE: { p1: BILL }, C_WEEKS: [WEEK], C_SWAPS: [],
    C_NAMES: [{ application_id: A.id, name: A.name }] });
  const theirs = seats.clientBlock();

  ok("she sees no money anywhere", !/\$/.test(hers));
  ok("they see what they pay", theirs.includes("$7.75"));
  ok("they never see what she gets", !theirs.includes("4.50") && !theirs.includes("$180"));
  ok("neither screen holds both numbers",
    !(/7\.75/.test(hers) && /4\.5/.test(hers)) && !(/7\.75/.test(theirs) && /4\.5/.test(theirs)),
    "the gap between them is yours alone");
}

console.log("\n" + (bad ? "  " + bad + " FAILED" : "  the whole walk holds together") + "\n");
process.exit(bad ? 1 : 0);
