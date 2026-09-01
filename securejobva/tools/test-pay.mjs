/* Pulls the four cards out of /pay and drives them, because this is the page a
   client opens with their bank details already on screen and every way it can
   be wrong is quiet.

   It is separate from test-billing.mjs because that file drives the panel on
   /seats. The two pages share their arithmetic — cBill and the two helpers
   beside it, in CLIENT_MONEY — and deliberately do not share their markup, so
   the shared half is tested once there and the drawing is tested twice.

   The one thing this file exists to catch is the two pages disagreeing. A
   client who reads /seats and then /pay and is shown two different figures has
   no way of knowing which one to pay, and neither do we.

   Nothing here touches the network or the database. */
import { readFileSync } from "node:fs";

const pay = readFileSync("pay.html", "utf8");
const seats = readFileSync("seats.html", "utf8");

function grab(html, name) {
  const at = html.indexOf("function " + name + "(");
  if (at < 0) throw new Error("cannot find " + name + "() — has the page been regenerated?");
  let depth = 0, i = html.indexOf("{", at);
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") { depth--; if (!depth) return html.slice(at, i + 1); }
  }
  throw new Error("unbalanced " + name);
}

const esc = (s) => String(s === null || s === undefined ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SHARED = ["cIso", "cFrom", "cHours", "cNum", "cMoney", "cCents", "cWeekLabel",
                "cBill", "cPaidCents", "cOwedCents", "when"];
const CARDS = ["dueCard", "payCard", "weeksCard", "receiptsCard"];

const GLOBALS =
  "var C_PLACE = [], C_RATE = {}, C_WEEKS = [], C_NAMES = [], C_PAID = [], C_SETTLED = {};\n" +
  "var C_WEEK_LIMIT = 260, C_TRUNCATED = false;\n" +
  "var C_PAY_METHOD = { bank_transfer: 'Bank transfer', wise: 'Wise', paypal: 'PayPal'," +
  " card: 'Card', cheque: 'Cheque', cash: 'Cash', other: 'Other' };\n";

const SET =
  "\nreturn { set: function (s) { C_PLACE = s.C_PLACE; C_RATE = s.C_RATE;" +
  " C_WEEKS = s.C_WEEKS; C_NAMES = s.C_NAMES || []; C_PAID = s.C_PAID || [];" +
  " C_SETTLED = s.C_SETTLED || {}; }, ";

const page = new Function("esc",
  GLOBALS +
  SHARED.concat(CARDS).map((n) => grab(pay, n)).join("\n") +
  SET + SHARED.concat(CARDS).map((n) => n + ": " + n).join(", ") + " };"
)(esc);

/* The bill from the OTHER page, so the two can be put side by side. */
const other = new Function("esc",
  GLOBALS +
  SHARED.concat(["billingBlock"]).map((n) => grab(seats, n)).join("\n") +
  SET + "billingBlock: billingBlock };"
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

const two = {
  C_PLACE: [
    { id: "p1", application_id: "a1", status: "ongoing" },
    { id: "p2", application_id: "a2", status: "trial" }
  ],
  C_RATE: { p1: RATE, p2: RATE },
  C_NAMES: [
    { application_id: "a1", name: "Maria Santos" },
    { application_id: "a2", name: "Joel Rivera" }
  ],
  C_WEEKS: [
    { id: "w1", placement_id: "p1", week_starts_on: "2026-08-24", status: "approved", trial_week: false, timesheet_days: day(32) },
    { id: "w2", placement_id: "p2", week_starts_on: "2026-08-24", status: "approved", trial_week: false, timesheet_days: day(25) },
    { id: "w3", placement_id: "p1", week_starts_on: "2026-08-17", status: "approved", trial_week: false, timesheet_days: day(30) },
    { id: "w4", placement_id: "p1", week_starts_on: "2026-08-10", status: "approved", trial_week: true,  timesheet_days: day(28) }
  ]
};

/* ── the figure somebody came for ───────────────────────────────────────── */
console.log("\n  Due now");

page.set(two);
let bill = page.cBill();
const due = page.dueCard(bill);
const grand = (32 + 25 + 30) * RATE;

ok("the amount is the money owed", due.indexOf("$" + grand.toFixed(2)) > -1, true,
   "87 chargeable hours at $7.75");
ok("both assistants are counted", /2 assistants/.test(due), true);
ok("the trial hours are shown as ours", /Covered by us/.test(due) && /28 h/.test(due), true,
   "so a client can see why the hours and the money do not line up");
ok("a trial week is not billed", due.indexOf("$" + ((32 + 25 + 30 + 28) * RATE).toFixed(2)) > -1, false);

/* ── the two pages must never disagree ──────────────────────────────────── */
console.log("\n  /pay and /seats, side by side");

function figure(html) {
  const m = html.match(/bill__totv[^>]*>([^<]*)</g) || [];
  return m[m.length - 1];
}

other.set(two);
ok("the same client is quoted the same total",
   figure(page.weeksCard(page.cBill())), figure(other.billingBlock()),
   "two pages, one cBill — a client shown two figures cannot know which to pay");

const withPay = Object.assign({}, two, {
  C_PAID: [{ id: "x1", amount_cents: 30000, paid_on: "2026-08-26", method: "wise", reference: "TR-88" }],
  C_SETTLED: { w3: true }
});
page.set(withPay);
other.set(withPay);
ok("and the same total after a payment",
   figure(page.weeksCard(page.cBill())), figure(other.billingBlock()));

/* ── what a payment does to the page ────────────────────────────────────── */
console.log("\n  After a payment");

page.set(withPay);
bill = page.cBill();
const paidDue = page.dueCard(bill);

ok("the amount comes down", paidDue.indexOf("$" + (grand - 300).toFixed(2)) > -1, true,
   "the figure that could only ever go up before sql/055");
ok("what has been paid is stated", /Paid so far/.test(paidDue), true);
ok("the settled week is marked", /bill__paid/.test(page.weeksCard(bill)), true);

const receipts = page.receiptsCard();
ok("the payment is listed", /TR-88/.test(receipts), true);
ok("with the method spelled out", /Wise/.test(receipts), true);

/* ── overpaying ─────────────────────────────────────────────────────────── */
console.log("\n  Paid ahead");

page.set(Object.assign({}, two, {
  C_PAID: [{ id: "x1", amount_cents: Math.round(grand * 100) + 2500, paid_on: "2026-08-26", method: "cash" }]
}));
const ahead = page.dueCard(page.cBill());
ok("credit is never shown as a negative amount due", /-\$/.test(ahead), false);
ok("the amount due reads zero", /\$0\.00/.test(ahead), true);
ok("and the credit is named", /\$25\.00 ahead/.test(ahead), true,
   "a client in credit should be told so, not left reading a minus sign");

/* ── nothing yet ────────────────────────────────────────────────────────── */
console.log("\n  Nothing approved yet");

page.set({ C_PLACE: [{ id: "p1", application_id: "a1", status: "matched" }],
           C_RATE: {}, C_NAMES: [], C_WEEKS: [] });
bill = page.cBill();
ok("the weeks card says so rather than showing an empty table",
   /Nothing approved yet/.test(page.weeksCard(bill)), true);
ok("the receipts card says nothing has been recorded",
   /Nothing recorded yet/.test(page.receiptsCard()), true);
ok("and it does not claim a payment is missing",
   /still owe/.test(page.receiptsCard()), false);

/* ── hours with no rate ─────────────────────────────────────────────────── */
console.log("\n  Hours with no rate behind them");

page.set({
  C_PLACE: [{ id: "p1", application_id: "a1", status: "ongoing" }],
  C_RATE: {},
  C_NAMES: [{ application_id: "a1", name: "Maria Santos" }],
  C_WEEKS: [{ id: "w1", placement_id: "p1", week_starts_on: "2026-08-24", status: "approved", trial_week: false, timesheet_days: day(40) }]
});
const noRate = page.dueCard(page.cBill());
ok("unpriced hours are named out loud", /not priced yet/.test(noRate), true,
   "silence here is how a client is quoted less than they owe");
ok("and are not billed at a guess", /\$310\.00/.test(noRate), false);

/* ── the promise the page makes about itself ────────────────────────────── */
console.log("\n  No button that does nothing");

ok("there is no live Pay control", /<button[^>]*>\s*Pay\b/.test(page.payCard()), false,
   "a button that says Pay and does nothing is worse than no button");
ok("and the page says why", /Why there is no Pay button/.test(page.payCard()), true);
ok("bank transfer is named as the way that works", /How it works today/.test(page.payCard()), true);

console.log("\n" + (failed ? "  " + failed + " FAILED" : "  the pay page holds up"));
process.exit(failed ? 1 : 0);
