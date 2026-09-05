/* What the applicant actually sees on /status once she is moved to assessment.

   This card had no test of any kind. part_done appeared in exactly one file in
   the repo — the generator that writes it — and every regression the
   walkthrough warns about lives here:

     "Answering a single question of eight marked the whole part finished, the
      Start button vanished, and there was no way back in. Fixed by 054. If
      anything in this walk regresses, expect it to be this."

   That is the assertion in the middle of this file, and until now nothing in
   the harness could have caught it coming back. The distinction 054 draws is
   between HAVING ANSWERS and BEING FINISHED: answers land in their column two
   and a half seconds after her first click (051), and only close_part writes
   part_done. A card that reads the answer columns instead locks her out of a
   part she is halfway through.

   Driven against the real assessCard() lifted out of the built page, so it
   tests what ships rather than a copy of it.

   Nothing here touches the network or the database.

   Run: node tools/test-assessment-card.mjs */
import { readFileSync, existsSync } from "node:fs";

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

/* A top-level `var NAME = ...;` lifted whole, so the card is scored against the
   real question banks rather than counts typed in here. */
function grabVar(html, name, file) {
  const at = html.indexOf("var " + name + " =");
  if (at < 0) throw new Error("cannot find var " + name + " in " + file);
  let i = html.indexOf("=", at) + 1, depth = 0, inStr = null;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inStr) { if (c === "\\") i++; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if ("[{(".includes(c)) depth++;
    else if ("]})".includes(c)) depth--;
    else if (c === ";" && depth === 0) return html.slice(at, i + 1);
  }
  throw new Error("unterminated var " + name + " in " + file);
}

let failed = 0;
function ok(what, got, want, note) {
  const pass = got === want;
  if (!pass) failed++;
  console.log("  " + (pass ? "ok    " : "FAIL  ") + what +
    (pass ? (note ? "  — " + note : "") : "  got " + JSON.stringify(got) + ", want " + JSON.stringify(want)));
}

const FILE = "status.html";
if (!existsSync(FILE)) { console.log("  FAIL  " + FILE + " is not built"); process.exit(1); }
const html = readFileSync(FILE, "utf8");

const card = new Function(
  "var MY_TZ = null;\n" +
  ["QBANK", "SCEN", "TRACK_AXES"].map((v) => grabVar(html, v, FILE)).join("\n") + "\n" +
  ["esc", "tzOpts", "when", "assessCard"].map((n) => grab(html, n, FILE)).join("\n") +
  "\nreturn assessCard;"
)();

const starts = (h) => (h.match(/data-part="/g) || []).length;
const hasSend = (h) => h.indexOf('id="a-send"') > -1;
const startFor = (h, k) => h.indexOf('data-part="' + k + '"') > -1;

/* ── before she is moved, and after she has sent ───────────────────────── */
console.log("\n  When the card appears at all");

ok("nothing while she is still just applied",
   card({ status: "applied", track: "Customer Service" }, null), "");
ok("nothing while she is hired and never sat one",
   card({ status: "hired", track: "Customer Service" }, null), "");

const atAssessment = { status: "assessment", track: "Customer Service" };
ok("it appears the moment staff move her to assessment",
   card(atAssessment, null).indexOf("Your assessment") > -1, true);

/* A finished assessment stays on screen. An empty space where her work was is
   what generates the email asking whether it arrived. */
const sent = card({ status: "approved", track: "Customer Service" },
                  { submitted_at: "2026-09-02T10:00:00Z", part_done: {} });
ok("it stays visible after she has sent it", sent.indexOf("Received") > -1, true);
ok("and offers nothing more to press", starts(sent), 0);

/* ── the shape of it ───────────────────────────────────────────────────── */
console.log("\n  What she is asked for");

const fresh = card(atAssessment, null);
ok("five parts for a track with no sales axis", starts(fresh), 5);
ok("and it says five", fresh.indexOf("Five parts") > -1, true);
ok("no sales part", startFor(fresh, "sales"), false, "sales gates no other track");
ok("counted as five left", fresh.indexOf("5 left") > -1, true);
ok("no send button until every part is done", hasSend(fresh), false);

const sales = card({ status: "assessment", track: "Sales & Marketing" }, null);
ok("six parts on the track sales actually gates", starts(sales), 6);
ok("and it says six", sales.indexOf("Six parts") > -1, true);
ok("the sales part is there", startFor(sales, "sales"), true);

/* ── 054, the one the walkthrough says to expect back ──────────────────── */
console.log("\n  Answers are not the same thing as finished");

/* 051 saves as she goes, so this is what a row looks like two and a half
   seconds after her first click on question one of eight. */
const halfway = {
  english_answers: { 0: 2 },
  scenario_answers: {},
  part_done: {}
};
const mid = card(atAssessment, halfway);
ok("one answer in does not finish the part", startFor(mid, "english"), true,
   "the Start button has to survive her first click");
ok("nor does it finish any other part", starts(mid), 5);
ok("still five left", mid.indexOf("5 left") > -1, true);
ok("and no send button", hasSend(mid), false);

/* Every column full, and still not closed. Only close_part writes part_done,
   and a card that infers "finished" from a full column locks her out of a part
   she has not submitted. */
const allAnswered = {
  english_answers: { 0: 1, 1: 2, 2: 0, 3: 3, 4: 1, 5: 2, 6: 0, 7: 1 },
  scenario_answers: { 0: 1, 1: 2 },
  detail_answers: { 0: 1 },
  written_reply: "A written answer she has typed but not sent.",
  part_done: {}
};
const full = card(atAssessment, allAnswered);
ok("a full answer column still leaves the part open", startFor(full, "english"), true);
ok("a written reply typed but not closed leaves it open", startFor(full, "written"), true);
ok("nothing is done", starts(full), 5);
ok("and there is still no send button", hasSend(full), false,
   "sending on unclosed parts is how one attempt becomes none");

/* ── closing parts, one at a time ──────────────────────────────────────── */
console.log("\n  Closing them");

const oneClosed = card(atAssessment, { part_done: { english: true } });
ok("a closed part loses its Start button", startFor(oneClosed, "english"), false);
ok("the others keep theirs", starts(oneClosed), 4);
ok("four left", oneClosed.indexOf("4 left") > -1, true);
ok("a closed part does not reopen", oneClosed.indexOf("&#10003;") > -1, true);

const allClosed = card(atAssessment, {
  part_done: { english: true, scenarios: true, detail: true, written: true, typing: true },
  typing_wpm: 46
});
ok("every part closed leaves nothing to start", starts(allClosed), 0);
ok("the send button appears only then", hasSend(allClosed), true);
ok("and it warns before she presses it", allClosed.indexOf("cannot change it") > -1, true);
ok("the pill stops counting down", allClosed.indexOf("Ready to send") > -1, true);
ok("her typing claim is shown as a claim", allClosed.indexOf("46 wpm, we check it") > -1, true);

/* The sales track needs its own part closed before the button appears, or the
   one track that needs six parts could send after five. */
const salesFive = card({ status: "assessment", track: "Sales & Marketing" }, {
  part_done: { english: true, scenarios: true, detail: true, written: true, typing: true }
});
ok("the sales track cannot send with the sales part open", hasSend(salesFive), false);
ok("it still shows one left", salesFive.indexOf("1 left") > -1, true);

/* ── open, with a clock running ────────────────────────────────────────── */
console.log("\n  Open is not the same thing as untouched");

/* part_opened is written by open_part() the first time a part is opened, and
   the deadline is measured from it — 051 put it in the database precisely so
   that reopening could not reset it. The card read part_done and never
   part_opened, so a part with six minutes gone looked identical to one nobody
   had touched: same Start, same silence. Found by closing the tab mid-part on
   the live site and coming back.

   054 stays exactly as it is. An open part is still not a finished one and is
   still counted as left; what changes is only what the row says about it. */
const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
const labelFor = (h, k) => {
  const m = h.match(new RegExp('data-part="' + k + '" type="button">([^<]*)<'));
  return m ? m[1] : null;
};

const untouched = card(atAssessment, { part_done: {}, part_opened: {} });
ok("a part nobody has opened says Start", labelFor(untouched, "english"), "Start");
ok("and offers no clock it has not started", / \d+:\d\d left/.test(untouched), false);

/* English is eight minutes. Opened three ago leaves five. */
const running = card(atAssessment, { part_done: {}, part_opened: { english: minsAgo(3) } });
ok("an open part says Resume", labelFor(running, "english"), "Resume");
ok("and says how much time is left", /(4:5\d|5:00) left/.test(running), true,
   "eight minutes, opened three ago");
ok("an open part is still not a finished one", startFor(running, "english"), true);
ok("and is still counted as left", running.indexOf("5 left") > -1, true,
   "054 counts finished, and open is not finished");
ok("the parts she has not opened still say Start", labelFor(running, "scen"), "Start");

/* The deadline passed while she was away. Opening it now closes it and banks
   whatever was saved, so offering Start would be the third lie in a row. */
const expired = card(atAssessment, { part_done: {}, part_opened: { english: minsAgo(9) } });
ok("a part whose time has gone does not say Start", labelFor(expired, "english"), "Finish");
ok("and says so in words", expired.indexOf("the time on this one has gone") > -1, true);
ok("it does not offer a negative clock", / -\d/.test(expired), false);

/* Each part carries its own length: judgement is twenty minutes, so nine
   minutes in it is still running while english would be over. */
const mixed = card(atAssessment, {
  part_done: {},
  part_opened: { english: minsAgo(9), scenarios: minsAgo(9) }
});
ok("english is over after nine minutes", labelFor(mixed, "english"), "Finish");
ok("judgement is not, because it is twenty", labelFor(mixed, "scen"), "Resume");

/* Typing has no clock at all — partShell gets 0 minutes and never opens a
   part — so it must never claim one. */
const typingOpened = card(atAssessment, { part_done: {}, part_opened: { typing: minsAgo(30) } });
ok("the untimed part never reports a deadline", labelFor(typingOpened, "typing"), "Start");

/* And finishing it still takes the button away, clock or no clock. */
const closedAfterOpen = card(atAssessment, {
  part_done: { english: true }, part_opened: { english: minsAgo(3) }
});
ok("a finished part has no button at all", startFor(closedAfterOpen, "english"), false);
ok("and no leftover clock", / \d+:\d\d left/.test(closedAfterOpen), false);

/* ── a written part closed with nothing in it ───────────────────────────
   close_part stamps part_done without looking at what it is stamping, so the
   press that ends the work sample by accident produced exactly the row below:
   written marked done, written_reply empty, nineteen minutes still on the
   clock. The card called that finished, took the button away, and left her
   nowhere to go. It happened once already. */
console.log("\n  A written part that is done and empty");

const emptyLive = card(atAssessment, {
  part_done: { written: true },
  part_opened: { written: minsAgo(1) },
  written_reply: ""
});
ok("an empty reply with time left is not finished", startFor(emptyLive, "written"), true,
   "the one press that used to be finalest");
ok("and the button says Resume", labelFor(emptyLive, "written"), "Resume");
ok("and it says what is missing", emptyLive.indexOf("nothing written yet") > -1, true);
ok("and it still counts as outstanding", emptyLive.indexOf("5 left") > -1, true);
ok("so nothing can be sent yet", hasSend(emptyLive), false);

/* Whitespace is not an answer either — a box holding a stray newline is a box
   holding nothing, and the person marking it would say so. */
const spacesLive = card(atAssessment, {
  part_done: { written: true },
  part_opened: { written: minsAgo(1) },
  written_reply: "   \n  "
});
ok("nor is a box of whitespace", startFor(spacesLive, "written"), true);

/* Once the twenty minutes have gone it is finished for real — she cannot
   write it now, and pretending otherwise would be the card lying the other
   way. But it must not reach the marker wearing the word "done". */
const emptyOver = card(atAssessment, {
  part_done: { written: true },
  part_opened: { written: minsAgo(30) },
  written_reply: ""
});
ok("once the time has gone it is closed", startFor(emptyOver, "written"), false);
ok("and says what it holds instead of done",
   emptyOver.indexOf("nothing written") > -1, true);
ok("in the colour of something missing",
   emptyOver.indexOf("apt__s--none") > -1, true);

/* And the ordinary case is untouched: a reply she wrote and closed is done, in
   the ordinary way, with no note and no way back in. */
const writtenProperly = card(atAssessment, {
  part_done: { written: true },
  part_opened: { written: minsAgo(5) },
  written_reply: "Dear customer, I am sorry about the delay and I have chased it."
});
ok("a reply she actually wrote is finished", startFor(writtenProperly, "written"), false);
ok("and carries no note about being empty",
   writtenProperly.indexOf("nothing written") > -1, false);
ok("and is not dimmed", writtenProperly.indexOf("apt__s--none") > -1, false);

console.log("");
if (failed) {
  console.log("  " + failed + " failed");
  process.exit(1);
}
console.log("  The card tells her what is finished, not what she has touched.");
