/* Pulls billingBlock() out of /seats and drives it, because this is the panel
   a client reads before they pay us and every way it can be wrong is quiet.

   It is here rather than folded into simulate.mjs because the walk in that
   file follows one assistant from applying to being billed, and the whole
   point of this panel is the case that walk cannot express: a business with
   several assistants, whose bill is the sum of all of them. That is exactly
   the shape /seats used to get wrong — it showed one placement and returned,
   so a client with three assistants was quoted a third of what they owed and
   nothing on the page said so.

   Nothing here touches the network or the database. */
import { readFileSync } from "node:fs";

const html = readFileSync("seats.html", "utf8");

function grab(name) {
  const at = html.indexOf("function " + name + "(");
  if (at < 0) throw new Error("cannot find " + name + "()");
  let depth = 0, i = html.indexOf("{", at);
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") { depth--; if (!depth) return html.slice(at, i + 1); }
  }
  throw new Error("unbalanced " + name);
}

const esc = (s) => String(s === null || s === undefined ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* when() comes from the shared library rather than from this panel, and the
   receipts list under the total is the first thing on the bill to call it. It
   is pulled out the same way — seats.html carries the library too. */
const FNS = ["cIso", "cFrom", "cHours", "cNum", "cMoney", "cCents", "cWeekLabel",
             "cBill", "cPaidCents", "cOwedCents", "when", "billingBlock"];
const seats = new Function("esc",
  "var C_PLACE = [], C_RATE = {}, C_WEEKS = [], C_NAMES = [], C_PAID = [], C_SETTLED = {};\n" +
  "var C_WEEK_LIMIT = 260, C_TRUNCATED = false;\n" +
  "var C_PAY_METHOD = { bank_transfer: 'Bank transfer', wise: 'Wise', paypal: 'PayPal'," +
  " card: 'Card', cheque: 'Cheque', cash: 'Cash', other: 'Other' };\n" +
  FNS.map(grab).join("\n") +
  "\nreturn { set: function (s) { C_PLACE = s.C_PLACE; C_RATE = s.C_RATE;" +
  " C_WEEKS = s.C_WEEKS; C_NAMES = s.C_NAMES || []; C_PAID = s.C_PAID || [];" +
  " C_SETTLED = s.C_SETTLED || {}; }, " +
  FNS.map((n) => n + ": " + n).join(", ") + " };"
)(esc);

let failed = 0;
function ok(what, got, want, note) {
  const pass = got === want;
  if (!pass) failed++;
  console.log("  " + (pass ? "ok    " : "FAIL  ") + what +
    (pass ? (note ? "  — " + note : "") : "  got " + JSON.stringify(got) + ", want " + JSON.stringify(want)));
}

const day = (h) => [{ worked_on: "2026-08-24", hours: h }];
const RATE = 7.75;

/* ── a business with two assistants ─────────────────────────────────────── */
console.log("\n  Two assistants, one bill");

seats.set({
  C_PLACE: [
    { id: "p1", application_id: "a1", status: "ongoing" },
    { id: "p2", application_id: "a2", status: "trial" }
  ],
  C_RATE: { p1: RATE, p2: RATE },
  C_NAMES: [
    { application_id: "a1", name: "Maria Santos" },
    { application_id: "a2", name: "Ana Reyes" }
  ],
  C_WEEKS: [
    { placement_id: "p1", week_starts_on: "2026-08-24", status: "approved",  trial_week: false, timesheet_days: day(40) },
    { placement_id: "p2", week_starts_on: "2026-08-24", status: "approved",  trial_week: false, timesheet_days: day(36.5) },
    { placement_id: "p1", week_starts_on: "2026-08-17", status: "approved",  trial_week: false, timesheet_days: day(40) },
    { placement_id: "p2", week_starts_on: "2026-08-17", status: "approved",  trial_week: true,  timesheet_days: day(40) },
    { placement_id: "p1", week_starts_on: "2026-08-10", status: "submitted", trial_week: false, timesheet_days: day(40) }
  ]
});

const out = seats.billingBlock();
const grand = (40 + 36.5 + 40) * RATE;

ok("both assistants are on the bill", /Maria Santos/.test(out) && /Ana Reyes/.test(out), true);
ok("a trial week is shown, and free", /free &mdash; trial/.test(out), true,
   "shown rather than omitted, so the weeks still add up to the total");
ok("a week not yet approved is left off", (out.match(/Week of/g) || []).length, 2,
   "only agreed hours are billed");
/* By position rather than by reading the label, which is formatted for the
   reader's locale and is not this test's business. */
ok("the newest week is first",
   out.indexOf(seats.cWeekLabel("2026-08-24")) < out.indexOf(seats.cWeekLabel("2026-08-17")), true);
ok("the total is the sum of both people", out.indexOf("$" + grand.toFixed(2)) > -1, true,
   "116.5 h across two assistants = $" + grand.toFixed(2));
ok("no float dust reaches the page", /\$\d[\d,]*\.\d\d\d/.test(out), false,
   "7.75 x 36.5 is exact to the cent or it is wrong");

/* ── the case that used to show a total anyway ───────────────────────────── */
console.log("\n  Hours with no rate behind them");

seats.set({
  C_PLACE: [{ id: "p1", application_id: "a1", status: "ongoing" }],
  C_RATE: {},
  C_NAMES: [{ application_id: "a1", name: "Maria Santos" }],
  C_WEEKS: [
    { placement_id: "p1", week_starts_on: "2026-08-24", status: "approved", trial_week: false, timesheet_days: day(40) }
  ]
});
const noRate = seats.billingBlock();

ok("unpriced hours are named out loud", /not priced yet/.test(noRate), true,
   "silence here is how a client is quoted less than they owe");
ok("unpriced hours are not billed at a guess", /\$310\.00/.test(noRate), false);
ok("the hours themselves are still stated", /40 hours are not priced/.test(noRate), true);

/* ── a trial-only client owes nothing, and should be told so ─────────────── */
console.log("\n  A client still inside the trial");

seats.set({
  C_PLACE: [{ id: "p1", application_id: "a1", status: "trial" }],
  C_RATE: { p1: RATE },
  C_NAMES: [{ application_id: "a1", name: "Maria Santos" }],
  C_WEEKS: [
    { placement_id: "p1", week_starts_on: "2026-08-24", status: "approved", trial_week: true, timesheet_days: day(40) }
  ]
});
const trialOnly = seats.billingBlock();

ok("the trial week is still itemised", /Maria Santos/.test(trialOnly), true);
ok("and it comes to nothing", /\$0\.00/.test(trialOnly), true,
   "a client inside the trial is shown a zero, not an empty page");
ok("no card is offered for a zero balance", /Card payment is not switched on/.test(trialOnly), true,
   "the panel is honest that nothing can be paid here yet");

/* ── nothing at all ─────────────────────────────────────────────────────── */
console.log("\n  Nothing approved yet");

seats.set({ C_PLACE: [{ id: "p1", application_id: "a1", status: "matched" }],
            C_RATE: {}, C_NAMES: [], C_WEEKS: [] });
const empty = seats.billingBlock();
ok("an empty bill says so rather than showing a total", /Nothing to pay yet/.test(empty), true);

/* A client with no placement at all should get no bill card whatsoever. */
seats.set({ C_PLACE: [], C_RATE: {}, C_NAMES: [], C_WEEKS: [] });
ok("somebody with no placement gets no bill at all", seats.billingBlock(), "");

/* ── the total comes down when somebody pays ─────────────────────────────
   sql/055. Before it, every one of these read the same whether the client had
   paid or not, because there was nothing to subtract — the heading said "not
   yet paid" over a figure that only counted the first half of that sentence.
   These are the guards on the half that was missing. */
console.log("\n  What is left after paying");

const paidWeeks = {
  C_PLACE: [{ id: "p1", application_id: "a1", status: "ongoing" }],
  C_RATE: { p1: RATE },
  C_NAMES: [{ application_id: "a1", name: "Maria Santos" }],
  C_WEEKS: [
    { id: "w1", placement_id: "p1", week_starts_on: "2026-08-24", status: "approved", trial_week: false, timesheet_days: day(40) },
    { id: "w2", placement_id: "p1", week_starts_on: "2026-08-17", status: "approved", trial_week: false, timesheet_days: day(40) }
  ]
};
const twoWeeks = Math.round(80 * RATE * 100);          /* $620.00 in cents */
const oneWeek = Math.round(40 * RATE * 100);           /* $310.00 in cents */

seats.set(paidWeeks);
const unpaid = seats.billingBlock();
ok("with nothing paid, the old heading stands", /Total approved, not yet paid/.test(unpaid), true,
   "a client who has paid us nothing is told exactly that");
ok("and it is the whole approved figure", /\$620\.00/.test(unpaid), true);

seats.set(Object.assign({}, paidWeeks, {
  C_PAID: [{ id: "x1", amount_cents: oneWeek, paid_on: "2026-08-26", method: "bank_transfer", reference: "INV-2201" }],
  C_SETTLED: { w2: true }
}));
const part = seats.billingBlock();

ok("the heading changes once money has arrived", /Left to pay/.test(part), true,
   "the sentence a client reads has to follow what actually happened");
ok("what is left is what is left", /\$310\.00/.test(part), true,
   "620 approved less 310 paid — the number that used to never move");
ok("the payment itself is shown", /INV-2201/.test(part), true,
   "the subtraction is not something a client should have to take on trust");
ok("the method is spelled out", /Bank transfer/.test(part), true);
ok("a settled week is marked", /bill__paid/.test(part), true);

/* Paid in full, and then some. */
seats.set(Object.assign({}, paidWeeks, {
  C_PAID: [{ id: "x1", amount_cents: twoWeeks, paid_on: "2026-08-26", method: "wise" }],
  C_SETTLED: { w1: true, w2: true }
}));
const settled = seats.billingBlock();
ok("paid in full comes to zero", /\$0\.00/.test(settled), true,
   "not a rounding artefact, and not a negative sign in front of nothing");

seats.set(Object.assign({}, paidWeeks, {
  C_PAID: [{ id: "x1", amount_cents: twoWeeks + 5000, paid_on: "2026-08-26", method: "wise" }]
}));
const ahead = seats.billingBlock();
ok("overpaying reads as credit, not as a bug", /\$50\.00 ahead/.test(ahead), true,
   "a client in credit should not be shown a negative amount owed");

/* The one that matters most: cents, exactly, on a rate that does not divide. */
seats.set({
  C_PLACE: [{ id: "p1", application_id: "a1", status: "ongoing" }],
  C_RATE: { p1: RATE },
  C_NAMES: [{ application_id: "a1", name: "Maria Santos" }],
  C_WEEKS: [
    { id: "w1", placement_id: "p1", week_starts_on: "2026-08-24", status: "approved", trial_week: false, timesheet_days: day(36.5) }
  ],
  C_PAID: [{ id: "x1", amount_cents: 10000, paid_on: "2026-08-26", method: "cash" }]
});
ok("a part payment leaves an exact remainder", /\$182\.88/.test(seats.billingBlock()), true,
   "36.5 x 7.75 is 282.875, rounded once to 282.88, less 100.00");

console.log("\n" + (failed ? "  " + failed + " FAILED" : "  the bill adds up"));
process.exit(failed ? 1 : 0);
