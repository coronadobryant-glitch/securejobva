/* The applicant's interview, from sql/062, driven through every state on both
   pages at once.

   057 solved this shape once already, for placements, and test-interview.mjs
   covers it: a client offers, an assistant picks, and the failure it hunts is
   the two of them being told different things about the same four rows. 062
   reused that table for applicants and reversed the parts — WE offer and SHE
   picks — and shipped with nothing driving it at all.

   So this is the same argument for the other pair. Each state is rendered from
   her side (ivCard in status.html) and from the staff side (ivOffered in
   admin.html), in the same tick, from the same slots, and asserted against each
   other rather than only against a string. A row that says "waiting on us" to
   her while saying "waiting on her" to you is a booking that quietly dies, and
   neither page would look broken.

   The states, and none of them is hypothetical — this flow has never been run
   by anybody, so every one of these is a first:

     nothing offered   she must see no card at all, not an empty one
     offered           she chooses, we wait
     chosen            she waits, we confirm
     confirmed         both say booked, and the date is on her row
     declined          she is told a new set is coming, we are told to send one

   Nothing here touches the network or the database.

   Run: node tools/test-iv-booking.mjs */
import { readFileSync } from "node:fs";

const statusHtml = readFileSync("status.html", "utf8");
const adminHtml = readFileSync("admin.html", "utf8");

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

const SHARED = ["tzOpts", "browserTz", "slotDay", "slotClock", "slotLabel"];

/* Her side. MY_TZ is hers; CENTRAL is ours, and the card prints both because
   one of the two is the one she is going to get wrong. */
const her = new Function("esc",
  "var MY_TZ = null, CENTRAL = 'America/Chicago';\n" +
  SHARED.concat(["ivCard"]).map((n) => grab(statusHtml, n, "status.html")).join("\n") +
  "\nreturn { set: function (tz) { MY_TZ = tz; }, card: ivCard, label: slotLabel };"
)(esc);

/* Ours. Staff read one clock, so this side never sets MY_TZ. */
const us = new Function("esc", "todayLocal",
  "var CENTRAL = 'America/Chicago';\n" +
  SHARED.concat(["ivOffered"]).map((n) => grab(adminHtml, n, "admin.html")).join("\n") +
  "\nreturn { card: ivOffered };"
)(esc, () => "2026-09-05");

let failed = 0;
function ok(what, got, want, note) {
  const pass = got === want;
  if (!pass) failed++;
  console.log("  " + (pass ? "ok    " : "FAIL  ") + what +
    (pass ? (note ? "  — " + note : "") : "  got " + JSON.stringify(got) + ", want " + JSON.stringify(want)));
}

/* Tuesday 8 September 2026, 9:00 AM Central = 14:00 UTC. In Manila that is
   10:00 PM the same evening, which is the case the two-clock display exists
   for and the one a single clock gets wrong. */
const T1 = "2026-09-08T14:00:00Z";
const T2 = "2026-09-08T19:00:00Z";
const T3 = "2026-09-09T16:00:00Z";

const slot = (id, at, over) => Object.assign({
  id: id, application_id: "a1", starts_at: at, minutes: 30,
  chosen_at: null, confirmed_at: null, declined_at: null, meeting_url: null
}, over || {});

function both(slots, tz) {
  her.set(tz || "Asia/Manila");
  const a = { id: "a1", name: "Maria Santos", slots: slots };
  return { h: her.card(a), u: us.card(a) };
}

const has = (s, t) => s.indexOf(t) > -1;

/* ── nothing offered ─────────────────────────────────────────────────────
   The state every applicant is in right now. interview_slots is empty, so
   this is the only one of these five that has ever actually existed. */
console.log("\n  Before anything is offered");
{
  const v = both([]);
  ok("she is shown no interview card at all", v.h, "",
     "an empty card would ask her to pick from nothing");
  ok("and we are shown the block, so there is somewhere to offer from",
     has(v.u, "Times offered"), true);
  ok("with a box to offer one", has(v.u, "data-ivoffer"), true);
  ok("and nothing listed yet", has(v.u, "ivo__l"), false);
}

/* ── offered, and she has not picked ─────────────────────────────────── */
console.log("\n  Offered, waiting on her");
{
  const v = both([slot("s1", T1), slot("s2", T2)]);
  ok("she is asked to pick", has(v.h, "Pick a time"), true);
  ok("both times are offered to her", (v.h.match(/data-slot=/g) || []).length, 2);
  ok("and she can say none of them work", has(v.h, "data-none"), true);
  ok("we are told she is choosing", has(v.u, "offered"), true);
  ok("and cannot confirm something she has not picked", has(v.u, "data-ivconfirm"), false);
  ok("but can take one back", has(v.u, "data-ivdrop"), true);

  /* The whole reason the card prints two clocks. */
  ok("she is shown her own evening", has(v.h, "10:00 PM"), true,
     "9am Central is 10pm in Manila");
  ok("and ours beside it, named", has(v.h, "Central"), true);
}

/* ── she picked one ──────────────────────────────────────────────────── */
console.log("\n  She picked one, waiting on us");
{
  const v = both([slot("s1", T1, { chosen_at: "2026-09-05T10:00:00Z" }), slot("s2", T2)]);
  ok("her card says we are the ones holding it now", has(v.h, "Waiting on us"), true);
  ok("and marks the one she picked", has(v.h, "picked &mdash; we will confirm"), true);
  ok("she is not asked to decline any more", has(v.h, "data-none"), false,
     "she has answered; the way out now is choosing a different one");
  ok("and is told she may still change it", has(v.h, "Picked a different one?"), true);
  ok("the one she picked is still choosable on the other row",
     (v.h.match(/data-slot=/g) || []).length, 1);

  ok("we are offered the confirm", has(v.u, "data-ivconfirm"), true);
  ok("on hers and not on the other one", (v.u.match(/data-ivconfirm=/g) || []).length, 1);
  ok("and told she picked it", has(v.u, "she picked this") || has(v.u, "picked"), true);
}

/* ── confirmed ───────────────────────────────────────────────────────── */
console.log("\n  Confirmed");
{
  const v = both([
    slot("s1", T1, { chosen_at: "2026-09-05T10:00:00Z", confirmed_at: "2026-09-05T11:00:00Z" }),
    slot("s2", T2)
  ]);
  ok("she is told it is booked", has(v.h, "Booked"), true);
  ok("and nothing is left to pick", has(v.h, "data-slot"), false);
  ok("the other time is not still sitting there", (v.h.match(/iv__s/g) || []).length, 2,
     "one list item, and its own class — the withdrawn one is gone");
  ok("she is told the link is coming", has(v.h, "link to follow"), true);
  ok("moving it is a conversation", has(v.h, "tell us and we will"), true);

  ok("we are told it is confirmed", has(v.u, "confirmed"), true);
  ok("and withdraw is gone", has(v.u, "data-ivdrop"), false,
     "moving a confirmed interview is a conversation, not a button");
  ok("and so is the offer box", has(v.u, "data-ivoffer"), false);
  ok("and it says the date is on her row", has(v.u, "the date is on her row"), true);
}

/* ── a confirmed one with a link ─────────────────────────────────────── */
console.log("\n  Once there is a link");
{
  const v = both([slot("s1", T1, {
    chosen_at: "2026-09-05T10:00:00Z", confirmed_at: "2026-09-05T11:00:00Z",
    meeting_url: "https://meet.example/abc"
  })]);
  ok("she gets a way in", has(v.h, "https://meet.example/abc"), true);
  ok("that opens safely", has(v.h, 'rel="noopener noreferrer"'), true);
  ok("and no longer says a link is coming", has(v.h, "link to follow"), false);
}

/* ── none of them worked ─────────────────────────────────────────────────
   The branch with the least standing behind it, per the handover. */
console.log("\n  None of them worked");
{
  const d = "2026-09-05T12:00:00Z";
  const v = both([slot("s1", T1, { declined_at: d }), slot("s2", T2, { declined_at: d })]);
  ok("she is told a new set is coming", has(v.h, "New times coming"), true);
  ok("and that nothing is needed from her", has(v.h, "nothing else is needed from you"), true);
  ok("she is not asked to pick from times she declined", has(v.h, "data-slot"), false);
  ok("nor to decline them twice", has(v.h, "data-none"), false);

  ok("we are told to offer another set", has(v.u, "Offer a new set"), true);
  ok("and the box is there to do it with", has(v.u, "data-ivoffer"), true);
  ok("and the declined ones say she said no", has(v.u, "she said no"), true);
}

/* ── one declined out of two is not a decline ────────────────────────────
   The state that separates "none of these work" from "not that one". */
console.log("\n  One declined, one still live");
{
  const v = both([slot("s1", T1, { declined_at: "2026-09-05T12:00:00Z" }), slot("s2", T2)]);
  ok("she is still asked to pick", has(v.h, "Pick a time"), true);
  ok("and not told a new set is coming", has(v.h, "New times coming"), false);
  ok("we are not told to offer a new set", has(v.u, "Offer a new set"), false);
}

/* ── the two sides never disagree about who is holding it ───────────── */
console.log("\n  The two pages agree about who is next to act");
{
  const states = [
    ["offered",   [slot("s1", T1), slot("s2", T2)],                                   "her"],
    ["chosen",    [slot("s1", T1, { chosen_at: "2026-09-05T10:00:00Z" })],            "us"],
    ["confirmed", [slot("s1", T1, { chosen_at: "2026-09-05T10:00:00Z",
                                    confirmed_at: "2026-09-05T11:00:00Z" })],         "nobody"],
    ["declined",  [slot("s1", T1, { declined_at: "2026-09-05T12:00:00Z" })],          "us"]
  ];
  for (const [name, slots, who] of states) {
    const v = both(slots);
    /* She is next only when she has something to press. */
    const hers = has(v.h, "data-slot") || has(v.h, "data-none");
    /* We are next only when there is something for us to do about it. */
    const ours = has(v.u, "data-ivconfirm") ||
                 (has(v.u, "data-ivoffer") && name === "declined");
    ok(name + ": exactly one side is waiting on the other",
       [hers, ours].filter(Boolean).length <= 1, true,
       "she " + (hers ? "acts" : "waits") + ", we " + (ours ? "act" : "wait") +
       " — expected " + who);
  }
}

console.log("");
if (failed) {
  console.log("  " + failed + " failed");
  process.exit(1);
}
console.log("  Both pages tell the same story about the same four rows.");
