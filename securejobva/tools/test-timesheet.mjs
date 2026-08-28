/* Pulls the timesheet's date and number helpers out of the built hub page and
   drives them.

   Everything else about 030 is enforced by the database and checked by reading
   the policies. This file exists for the part the database cannot defend: the
   page has to decide which Monday a week belongs to, and it decides it in the
   assistant's own timezone, on their own clock. Get that wrong and the failure
   is a week of hours filed against the wrong week — which looks like nothing
   at all until somebody is paid short. */
import { readFileSync } from "node:fs";

const html = readFileSync("hub.html", "utf8");
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

function grab(name) {
  const at = js.indexOf("function " + name + "(");
  if (at < 0) throw new Error("cannot find " + name + "() in the built hub page");
  let depth = 0, i = js.indexOf("{", at);
  for (; i < js.length; i++) {
    if (js[i] === "{") depth++;
    else if (js[i] === "}") { depth--; if (!depth) return js.slice(at, i + 1); }
  }
  throw new Error("unbalanced " + name);
}

const NAMES = ["isoDay", "fromIso", "addDays", "mondayOf", "showHours", "dayIn", "totalOf", "when"];
const F = new Function(
  NAMES.map(grab).join("\n") + "\nreturn {" + NAMES.join(",") + "};"
)();

let failed = 0;
const ok = (name, cond, note) => {
  console.log((cond ? "  ok    " : "  FAIL  ") + name + (note ? "  — " + note : ""));
  if (!cond) failed++;
};

/* ── which Monday ────────────────────────────────────────────────────────── */

const monday = (y, m, d) => F.isoDay(F.mondayOf(new Date(y, m - 1, d)));

ok("a Monday is its own Monday", monday(2026, 8, 24) === "2026-08-24");
ok("Tuesday looks back one day", monday(2026, 8, 25) === "2026-08-24");
ok("Sunday belongs to the week it ends", monday(2026, 8, 30) === "2026-08-24",
  "not the Monday that follows it");
ok("the next Monday starts a new week", monday(2026, 8, 31) === "2026-08-31");

/* getDay() is 0 on Sunday, and the naive (getDay() - 1) sends Sunday back six
   days into the future instead of forward. This is the specific arithmetic
   that (getDay() + 6) % 7 exists to get right. */
ok("Sunday does not jump forward a week", monday(2026, 3, 1) === "2026-02-23",
  "1 Mar 2026 is a Sunday");

/* A month boundary and a year boundary, because setDate() crossing either is
   where hand-rolled date maths usually breaks. */
ok("a week spanning a month is named by its Monday", monday(2026, 9, 2) === "2026-08-31");
ok("a week spanning a year is named by its Monday", monday(2027, 1, 1) === "2026-12-28",
  "1 Jan 2027 is a Friday");

/* ── local, not UTC ──────────────────────────────────────────────────────── */

/* The reason isoDay() builds the string from date parts rather than calling
   toISOString(): for a Manila assistant, 8am Monday is still Sunday in UTC,
   and the whole first day of every week would be filed against the week
   before. Asserted here by comparing the two directly. */
{
  const d = new Date(2026, 7, 24, 3, 0, 0);          /* 3am local on Monday */
  const utc = d.toISOString().slice(0, 10);
  ok("the day is taken from the local clock, not UTC",
    F.isoDay(d) === "2026-08-24",
    utc === "2026-08-24" ? "same in this timezone; still not derived from UTC"
                         : "toISOString() would have said " + utc);
}

/* ── seven days, and only seven ──────────────────────────────────────────── */
{
  const mon = F.fromIso("2026-08-24");
  const week = [];
  for (let i = 0; i < 7; i++) week.push(F.isoDay(F.addDays(mon, i)));
  ok("a week is seven consecutive days",
    week.join(",") === "2026-08-24,2026-08-25,2026-08-26,2026-08-27,2026-08-28,2026-08-29,2026-08-30");
  ok("every day maps back to the same Monday",
    week.every((iso) => F.isoDay(F.mondayOf(F.fromIso(iso))) === "2026-08-24"),
    "which is what the database constraint checks against");
}

/* addDays() must not mutate what it is handed — hoursCard() walks the week by
   calling it seven times with the same Monday. */
{
  const mon = F.fromIso("2026-08-24");
  F.addDays(mon, 6);
  ok("addDays leaves its argument alone", F.isoDay(mon) === "2026-08-24");
}

/* ── a date is a day, not an instant ─────────────────────────────────────── */

/* when() is shared by every page, and it was reading plain dates through
   new Date(), which is midnight UTC. In any timezone behind UTC that renders
   as the day before — leave beginning on the 7th shown as the 6th, and a
   timesheet week labelled with the Sunday before its Monday. Found by looking
   at a placement that said "from Sep 6" for a start date of the 7th.

   Compared against a locally-built date rather than a fixed string, so this
   asserts the same thing wherever it runs. */
{
  const fmt = { year: "numeric", month: "short", day: "numeric" };
  ok("a plain date renders as that very day",
    F.when("2026-09-07") === new Date(2026, 8, 7).toLocaleDateString(undefined, fmt),
    "not the day before, whatever the reader's timezone");
  ok("a month boundary does not slip",
    F.when("2026-09-01") === new Date(2026, 8, 1).toLocaleDateString(undefined, fmt));
  ok("a year boundary does not slip",
    F.when("2027-01-01") === new Date(2027, 0, 1).toLocaleDateString(undefined, fmt));
  ok("a timestamp still shows in the reader's own time",
    F.when("2026-09-07T15:30:00Z") ===
      new Date("2026-09-07T15:30:00Z").toLocaleDateString(undefined, fmt),
    "that one really is an instant");
  ok("nothing in, nothing out", F.when(null) === "" && F.when("") === "");
  ok("rubbish in, nothing out", F.when("not a date") === "");
}

/* ── the numbers ─────────────────────────────────────────────────────────── */

ok("a whole number loses its decimals", F.showHours(38) === "38");
ok("a half hour keeps one", F.showHours(18.5) === "18.5");
ok("a quarter hour keeps two", F.showHours(7.25) === "7.25");
ok("zero is zero", F.showHours(0) === "0");

/* The reason the column is numeric and not a float: a week of eighths adds up
   to a number that must print as itself. */
ok("a week of awkward hours still adds up",
  F.showHours([7.7, 8.1, 6.2, 0, 0, 0, 0].reduce((a, b) => a + b, 0)) === "22",
  "7.7 + 8.1 + 6.2 = 22, not 21.999999999999996");

/* ── totals over the day rows ────────────────────────────────────────────── */
{
  const sheet = { timesheet_days: [
    { worked_on: "2026-08-24", hours: "8.00" },
    { worked_on: "2026-08-25", hours: "7.50" },
    { worked_on: "2026-08-26", hours: "3.00" }
  ]};
  ok("hours arriving as strings still add up", F.totalOf(sheet) === 18.5,
    "PostgREST returns numeric as a string");
  ok("a week with no rows totals zero", F.totalOf({}) === 0);
  ok("a missing sheet totals zero", F.totalOf(null) === 0,
    "the card renders before any week exists");
  ok("a day is found by its date", F.dayIn(sheet, "2026-08-25").hours === "7.50");
  ok("a day that was never entered is absent", F.dayIn(sheet, "2026-08-27") === null,
    "so it is inserted rather than patched");
}

/* ── the breakdown staff read ─────────────────────────────────────────────
   The seven boxes on /admin are the only place a wrong number is visible
   before it is approved, and they are positional: the hours have to line up
   under the right day. Built from the admin page for the same reason as
   above — the shipped code, not a copy of it. */
{
  const ahtml = readFileSync("admin.html", "utf8");
  const ajs = [...ahtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const agrab = (name) => {
    const at = ajs.indexOf("function " + name + "(");
    if (at < 0) throw new Error("cannot find " + name + "() in the built admin page");
    let depth = 0, i = ajs.indexOf("{", at);
    for (; i < ajs.length; i++) {
      if (ajs[i] === "{") depth++;
      else if (ajs[i] === "}") { depth--; if (!depth) return ajs.slice(at, i + 1); }
    }
  };
  const dvar = ajs.match(/var TS_D = \[[^\]]*\];/)[0];
  const A = new Function(
    "esc",
    dvar + "\n" + agrab("tsNum") + "\n" + agrab("tsTotal") + "\n" + agrab("tsBreak") +
    "\nreturn { tsNum: tsNum, tsTotal: tsTotal, tsBreak: tsBreak };"
  )((s) => String(s == null ? "" : s));

  const week = { week_starts_on: "2026-08-17", timesheet_days: [
    { worked_on: "2026-08-17", hours: "9" },
    { worked_on: "2026-08-20", hours: "16" }
  ]};
  const cells = [...A.tsBreak(week).matchAll(/<i[^>]*>([^<]*)<\/i>/g)].map((m) => m[1]);

  ok("the breakdown always prints seven days", cells.length === 7,
    "a missing day and a zero day mean different things");
  ok("hours land under the day they were worked",
    cells[0] === "M 9" && cells[3] === "T 16",
    "Monday 9, Thursday 16 — " + cells.join(" "));
  ok("days with nothing entered are marked faint",
    (A.tsBreak(week).match(/class="z"/g) || []).length === 5);
  ok("the breakdown crosses a month without losing a day",
    [...A.tsBreak({ week_starts_on: "2026-08-31", timesheet_days: [
      { worked_on: "2026-09-02", hours: "6" }
    ]}).matchAll(/<i[^>]*>([^<]*)<\/i>/g)].map((m) => m[1])[2] === "W 6",
    "31 Aug is a Monday, so Wednesday is 2 Sep");
  ok("admin and hub round hours the same way",
    A.tsNum(18.5) === F.showHours(18.5) && A.tsNum(38) === F.showHours(38),
    "two totals for the same week would be a support ticket");
}

console.log("\n" + (failed ? failed + " FAILED" : "all timesheet checks passed"));
process.exit(failed ? 1 : 0);
