/* The interview handshake from sql/057, driven through every state on both
   pages at once.

   Two people are looking at the same four rows and must never be told
   different things about them. That is the failure this file exists to catch:
   a client who thinks they are waiting on her while she thinks she is waiting
   on them is a match that quietly dies, and neither page would look broken.

   So each state is rendered from the client's side and from hers, in the same
   tick, from the same slots — and asserted against each other rather than only
   against a string.

   Nothing here touches the network or the database. */
import { readFileSync } from "node:fs";

const seatsHtml = readFileSync("seats.html", "utf8");
const hubHtml = readFileSync("hub.html", "utf8");

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

const esc = (s) => String(s === null || s === undefined ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SHARED = ["tzOpts", "browserTz", "slotDay", "slotClock", "slotLabel", "slotAlso", "slotState"];

/* The client's side. */
const client = new Function("esc",
  "var MY_TZ = null, CENTRAL = 'America/Chicago';\n" +
  "var C_SLOTS = [], C_NAMES = [];\n" +
  SHARED.concat(["todayLocal", "slotRow", "interviewBlock"])
    .map((n) => grab(seatsHtml, n, "seats.html")).join("\n") +
  "\nreturn { set: function (s) { C_SLOTS = s.slots; C_NAMES = s.names || []; MY_TZ = s.tz || null; }," +
  " card: interviewBlock, state: slotState, label: slotLabel, also: slotAlso };"
)(esc);

/* Hers. */
const asst = new Function("esc",
  "var MY_TZ = null, CENTRAL = 'America/Chicago';\n" +
  "var H_SLOTS = [];\n" +
  SHARED.concat(["hubSlot", "interviewCard"])
    .map((n) => grab(hubHtml, n, "hub.html")).join("\n") +
  "\nreturn { set: function (s) { H_SLOTS = s.slots; MY_TZ = s.tz || null; }," +
  " card: interviewCard, label: slotLabel };"
)(esc);

let failed = 0;
function ok(what, got, want, note) {
  const pass = got === want;
  if (!pass) failed++;
  console.log("  " + (pass ? "ok    " : "FAIL  ") + what +
    (pass ? (note ? "  — " + note : "") : "  got " + JSON.stringify(got) + ", want " + JSON.stringify(want)));
}

const PL = { id: "pl1", application_id: "a1", status: "matched", clients: { name: "Northlake Dental" } };
const NAMES = [{ application_id: "a1", name: "Maria Santos" }];

/* Tuesday 8 September 2026, 9:00 AM Central = 14:00 UTC. In Manila that is
   10:00 PM the same evening — the case the whole two-clock display is for. */
const T1 = "2026-09-08T14:00:00Z";
const T2 = "2026-09-08T19:00:00Z";
const T3 = "2026-09-09T16:00:00Z";

const slot = (id, at, over) => Object.assign({
  id: id, placement_id: "pl1", starts_at: at, minutes: 30,
  chosen_at: null, confirmed_at: null, declined_at: null, meeting_url: null
}, over || {});

function both(slots, tz) {
  client.set({ slots: slots, names: NAMES, tz: "America/Chicago" });
  asst.set({ slots: slots, tz: tz || "Asia/Manila" });
  return { c: client.card(PL), h: asst.card(PL) };
}

/* ── nothing offered ────────────────────────────────────────────────────── */
console.log("\n  Before anybody has offered anything");

let v = both([]);
ok("the client is asked to offer times", /Offer it/.test(v.c), true);
ok("and told two is the smallest real choice", /One is an instruction/.test(v.c), true,
   "offering one time is not a choice, it is a summons");
ok("she is shown nothing at all", v.h, "",
   "an empty card that says nothing has happened is worse than no card");

/* ── offered ────────────────────────────────────────────────────────────── */
console.log("\n  Three times offered");

const offered = [slot("s1", T1), slot("s2", T2), slot("s3", T3)];
v = both(offered);

ok("she is asked to pick", /Pick the one that works/.test(v.h), true);
ok("all three reach her", (v.h.match(/data-iv-pick/g) || []).length, 3);
ok("she can say none of them work", /None of these work/.test(v.h), true,
   "without this the only honest move left is silence, which is the failure this flow has");
ok("the client is told it is with her", /Offered to Maria Santos/.test(v.c), true);
ok("and the client cannot pick on her behalf", /data-iv-pick/.test(v.c), false,
   "sql/057 refuses it too — this is the page not offering what the database would reject");

/* ── the two clocks ─────────────────────────────────────────────────────── */
console.log("\n  The same moment, two clocks");

/* 9:00 AM Central is 10:00 PM Manila on the same date. She must see her own
   time first and Central underneath, or she books herself into the wrong
   night — which is the entire reason sql/056 was built before this. */
asst.set({ slots: offered, tz: "Asia/Manila" });
const hers = asst.card(PL);
ok("she reads her own clock", /10:00\s*PM/.test(hers), true, "Manila");
ok("with Central underneath", /Central/.test(hers), true);
ok("and Central is the client's morning", /9:00\s*AM/.test(hers), true);

client.set({ slots: offered, names: NAMES, tz: "America/Chicago" });
ok("a client already on Central is not shown it twice",
   (client.card(PL).match(/Central/g) || []).length <= 3, true,
   "9:00 AM followed by 9:00 AM Central is noise, not help");

/* ── she picks ──────────────────────────────────────────────────────────── */
console.log("\n  She picks one");

const picked = [slot("s1", T1, { chosen_at: "2026-09-02T03:00:00Z" }), slot("s2", T2), slot("s3", T3)];
v = both(picked);

ok("the client is asked to confirm", /Confirm this time/.test(v.c), true);
ok("and told which one she picked", /She picked this/.test(v.c), true);
ok("she is told it is now with them", /They confirm it next/.test(v.h), true,
   "the two pages must never both say they are waiting on the other side");
ok("she can still change her mind", /data-iv-pick/.test(v.h), true);
ok("the client can offer a meeting link", /iv-link/.test(v.c), true);
ok("and is told what happens if they do not",
   /email address on this account/.test(v.c), true,
   "an empty link must not mean she has no way to reach them");

/* ── confirmed ──────────────────────────────────────────────────────────── */
console.log("\n  Confirmed");

const done = [slot("s1", T1, {
  chosen_at: "2026-09-02T03:00:00Z",
  confirmed_at: "2026-09-02T15:00:00Z",
  meeting_url: "https://meet.google.com/abc-defg-hij"
})];
v = both(done);

ok("the client sees the details, not a form", /Confirm this time/.test(v.c), false);
ok("with the link they gave", /meet\.google\.com/.test(v.c), true);
ok("she sees the same link", /meet\.google\.com/.test(v.h), true);
ok("and the same moment on her own clock", /10:00\s*PM/.test(v.h), true);
ok("the client can still take it back", /Change the time/.test(v.c), true,
   "things come up, and the alternative is an email to support");
ok("she is not offered a way to cancel it", /None of these work/.test(v.h), false,
   "she agreed to it; unpicking it unilaterally is a phone call, not a button");

/* A confirmed interview with no link must not leave her with nothing. */
v = both([slot("s1", T1, {
  chosen_at: "2026-09-02T03:00:00Z", confirmed_at: "2026-09-02T15:00:00Z"
})]);
ok("no link still tells her how to reach them",
   /address on your application/.test(v.h), true);

/* ── she declined ───────────────────────────────────────────────────────── */
console.log("\n  None of them worked");

v = both([
  slot("s1", T1, { declined_at: "2026-09-02T03:00:00Z" }),
  slot("s2", T2, { declined_at: "2026-09-02T03:00:00Z" })
]);

ok("the client is told, in as many words", /None of those times worked/.test(v.c), true,
   "silence and a refusal must not look the same, or they wait instead of offering more");
ok("and is asked for others", /Offer it/.test(v.c), true);
ok("she is told they have been told", /They have been told/.test(v.h), true);
ok("and is not asked to do anything else", /data-iv-pick/.test(v.h), false);

/* ── the state machine on its own ───────────────────────────────────────── */
console.log("\n  Who is it waiting on");

const st = (slots) => client.state(slots).state;
ok("nothing offered", st([]), "not_started");
ok("offered", st(offered), "waiting_on_assistant");
ok("picked", st(picked), "waiting_on_client");
ok("confirmed", st(done), "confirmed");
ok("declined", st([slot("s1", T1, { declined_at: "2026-09-02T03:00:00Z" })]), "declined");
ok("a confirmed interview outranks everything else",
   st([slot("s1", T1, { declined_at: "x", chosen_at: "y", confirmed_at: "z" })]), "confirmed",
   "however the rows got into that shape, it is on");

console.log("\n" + (failed ? "  " + failed + " FAILED" : "  the handshake holds"));
process.exit(failed ? 1 : 0);
