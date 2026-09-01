/* The time zone setting from sql/056, driven against the three portals that
   carry it.

   The interesting assertions are all about what must NOT move. A date is a
   day: a timesheet week starts on its Monday in Manila and in Houston, and
   leave beginning on the 7th begins on the 7th for everyone. Only a
   timestamptz — a real instant — is allowed to render differently for two
   people looking at it.

   That distinction already cost this codebase a bug once, before 056 existed:
   new Date("2026-09-07") is midnight UTC, so every reader behind UTC saw the
   6th, and when() was rewritten to parse a plain date from its parts. Handing
   a timeZone to that branch would put the bug straight back, for the same
   reason and with a setting to blame it on.

   Nothing here touches the network or the database. */
import { readFileSync, existsSync } from "node:fs";

const PORTALS = ["status.html", "hub.html", "seats.html"].filter((f) => existsSync(f));

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

/* Built once per portal, with MY_TZ settable from outside so the same page can
   be asked the same question as two different readers. */
function load(file) {
  const html = readFileSync(file, "utf8");
  const NAMES = ["tzOk", "tzOpts", "browserTz", "when"];
  return new Function(
    "var MY_TZ = null;\n" +
    NAMES.map((n) => grab(html, n, file)).join("\n") +
    "\nreturn { set: function (t) { MY_TZ = t; }, get: function () { return MY_TZ; }, " +
    NAMES.map((n) => n + ": " + n).join(", ") + " };"
  )();
}

/* ── a date is a day, wherever you are ──────────────────────────────────── */
console.log("\n  A date does not move");

for (const file of PORTALS) {
  const p = load(file);

  p.set(null);
  const home = p.when("2026-09-07");

  /* Two zones most of a day apart, chosen because they are where this
     product's people actually are. */
  p.set("Pacific/Kiritimati");   /* UTC+14 */
  const ahead = p.when("2026-09-07");
  p.set("Pacific/Midway");       /* UTC-11 */
  const behind = p.when("2026-09-07");

  ok(file + ": a plain date reads the same in every zone",
     home === ahead && ahead === behind, true,
     "25 hours apart, one day — a week that starts on a Monday starts on that Monday");
  ok(file + ": and it is the day that was asked for",
     /(^|\s)7(,|\s)/.test(home), true, home);
}

/* ── an instant does move ───────────────────────────────────────────────── */
console.log("\n  An instant does");

for (const file of PORTALS) {
  const p = load(file);
  /* Late on the 7th in UTC: the 8th in Tokyo, still the 7th in Houston. */
  const iso = "2026-09-07T22:30:00Z";

  p.set("Asia/Tokyo");
  const tokyo = p.when(iso);
  p.set("America/Chicago");
  const houston = p.when(iso);

  ok(file + ": a timestamp follows the reader",
     tokyo !== houston, true, tokyo + " vs " + houston);
  ok(file + ": Tokyo is already on the next day", /8/.test(tokyo), true, tokyo);
}

/* ── the fallbacks ──────────────────────────────────────────────────────── */
console.log("\n  When it cannot be honoured");

const p = load(PORTALS[0]);

ok("a zone that does not exist is refused", p.tzOk("Mars/Olympus"), false,
   "Intl throws on an unknown name, and one throw would take out every date on the page");
ok("a real zone is accepted", p.tzOk("Asia/Manila"), true);
ok("nothing chosen is not a zone", p.tzOk(null), false);
ok("nothing chosen means nothing is passed to Intl",
   (p.set(null), p.tzOpts({ year: "numeric" }).timeZone), undefined,
   "an undefined timeZone is the browser's own, which is what every one of these did before 056");
ok("a chosen zone is passed through",
   (p.set("Asia/Manila"), p.tzOpts({ year: "numeric" }).timeZone), "Asia/Manila");
ok("and the caller's own options survive",
   (p.set("Asia/Manila"), p.tzOpts({ year: "numeric" }).year), "numeric",
   "tzOpts copies rather than replaces — a formatter that lost its options would render a bare date");

/* ── every portal offers it ─────────────────────────────────────────────── */
console.log("\n  Everybody who asked for it can reach it");

for (const file of PORTALS) {
  const html = readFileSync(file, "utf8");
  ok(file + ": renders the card", html.includes("function tzCard"), true);
  ok(file + ": wires it after drawing", html.includes("wireTz()"), true,
     "a card whose Save button is not connected is worse than no card");
}

console.log("\n" + (failed ? "  " + failed + " FAILED" : "  the clock holds"));
process.exit(failed ? 1 : 0);
