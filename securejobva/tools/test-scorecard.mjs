/* The interview scorecard in /admin, driven against the real scoreLine().

   The block it replaces was walked past for weeks by the person who asked for
   it. It was a bare <details>, styled at .8rem in --muted with the disclosure
   triangle stripped off, so it read as a caption on the row above rather than
   as somewhere to type — and it collapsed itself precisely when unscored,
   which is the only state anybody needs it in. Every applicant in the database
   was unscored, so every one of them was shut.

   That is not a thing a test catches. What a test can catch is the rest of it,
   and the rest of it was wrong too:

     it asked about work nobody applies for — there is no Bookkeeping track and
     no Social Media track, and the site offers three jobs;

     it re-marked what a machine had already marked better, since 049 scores
     english, customer, detail and sales off her real answers;

     and it was 1 to 10 with no anchors, so nobody's 7 meant anybody else's 7.

   So this asserts what 065's scorecard is: the five things only a conversation
   shows, then one row per job she actually applied for, on a five point scale
   whose levels are written on the options.

   Nothing here touches the network or the database.

   Run: node tools/test-scorecard.mjs */
import { readFileSync } from "node:fs";

const html = readFileSync("admin.html", "utf8");
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

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
  const at = js.indexOf("var " + name + " =");
  if (at < 0) throw new Error("cannot find var " + name + " in admin.html");
  let i = js.indexOf("=", at) + 1, depth = 0, inStr = null;
  for (; i < js.length; i++) {
    const c = js[i];
    if (inStr) { if (c === "\\") i++; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if ("[{(".includes(c)) depth++;
    else if ("]})".includes(c)) depth--;
    else if (c === ";" && depth === 0) return js.slice(at, i + 1);
  }
  throw new Error("unterminated var " + name);
}

const make = (allowed) => new Function("esc", "can",
  ["IV_CONVERSATION", "IV_JOBS", "IV_ANCHOR"].map(grabVar).join("\n") + "\n" +
  ["kitLine", "ivPick", "scoreLine"].map(grab).join("\n") +
  "\nreturn scoreLine;"
)((s) => String(s === null || s === undefined ? "" : s), () => allowed);

const scoreLine = make(true);

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "FAIL") + "  " + label +
    (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
};
const has = (s, t) => s.indexOf(t) > -1;
const count = (s, t) => (s.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;

/* Two of the four real applicants, with their real tracks. */
const bryant = { tracks: ["Customer Service", "Admin Tasks"] };
const samantha = { tracks: ["Customer Service", "Sales & Marketing", "Admin Tasks"] };
const kirze = { tracks: ["Customer Service"] };

/* ── what a conversation shows, always ───────────────────────────────────── */
console.log("\n  The five only a call can answer");
{
  const h = scoreLine(kirze);
  is("spoken English is asked for", has(h, 'data-score="iv_spoken"'), true);
  is("and says why it is here", has(h, "only place anybody hears her"), true);
  is("the setup is asked for", has(h, 'data-score="iv_setup"'), true);
  is("and says what the speed test does not cover",
     has(h, "proves bandwidth and nothing else"), true);
  is("reliability is asked for", has(h, 'data-score="iv_reliability"'), true);
  is("using the tools is asked for", has(h, 'data-score="iv_tools"'), true);
  is("and is about learning a client's, not knowing hers",
     has(h, "Learning a client"), true);
  is("and is kept apart from the room and the hardware",
     has(h, "Inbox and calendar"), true);
  is("and whether her answers hold up", has(h, 'data-score="iv_answers"'), true);
  is("which names the check the paste guard calls the real one",
     has(h, "Ask about two of her own"), true);
}

/* ── one row per job, and only the ones she applied for ──────────────────── */
console.log("\n  Only the jobs she applied for");
{
  const h = scoreLine(bryant);
  is("Customer Service is scored", has(h, 'data-score="iv_customer_service"'), true);
  is("Admin Tasks is scored", has(h, 'data-score="iv_admin_tasks"'), true);
  is("Sales & Marketing is not — he did not apply for it",
     has(h, 'data-score="iv_sales_marketing"'), false);
  is("seven rows in total, five plus his two jobs", count(h, "data-score="), 7);
  is("and the block says which jobs it is scoring",
     has(h, "Customer Service</b> and <b>Admin Tasks"), true);
  /* The first version escaped the join rather than the names, so the sentence
     printed "Customer Service&lt;/b&gt; and &lt;b&gt;Admin Tasks" on the live
     page — bold markup as visible text, in the one sentence on the block that
     names the person's jobs. */
  is("and does not print the markup as words", has(h, "&lt;/b&gt;"), false);
}
{
  const h = scoreLine(kirze);
  is("one track gives one job row", count(h, "data-score="), 6);
  is("and it is worded in the singular", has(h, "the job she applied for"), true);
}
{
  const h = scoreLine(samantha);
  is("all three tracks give three job rows", count(h, "data-score="), 8);
  is("and the plural", has(h, "the jobs she applied for"), true);
}

/* ── the jobs that do not exist ──────────────────────────────────────────── */
console.log("\n  The two boxes that used to be there");
{
  const h = scoreLine(samantha);
  is("bookkeeping is gone — no track leads to it", has(h, "ookkeeping"), false);
  is("so is social media as a skill", has(h, 'data-score="score_social"'), false);
  is("and none of 008's five columns is written any more",
     ["score_english", "score_customer", "score_data_entry", "score_social",
      "score_bookkeeping"].some((c) => has(h, 'data-score="' + c + '"')), false);
  is("english is not re-marked after the machine marked it",
     has(h, 'data-score="score_english"'), false);
}

/* ── the scale ───────────────────────────────────────────────────────────── */
console.log("\n  Five points, with the levels written on them");
{
  const h = scoreLine(kirze);
  is("the scale stops at five", has(h, '<option value="6"'), false);
  is("and it does not go to ten", has(h, '<option value="10"'), false);
  is("one is not close", has(h, "1 · not close"), true);
  is("three is workable", has(h, "3 · workable"), true);
  is("five is outstanding", has(h, "5 · outstanding"), true);
  is("and blank stays available for anything not asked",
     has(h, '<option value="">'), true);
}

/* ── what it says about itself ───────────────────────────────────────────── */
console.log("\n  The heading");
{
  is("an unscored row says so", has(scoreLine(kirze), "not scored"), true);

  const scored = Object.assign({ iv_avg: 3.6, scored_by: "davidgabon123@gmail.com" }, kirze);
  const h = scoreLine(scored);
  is("a scored one shows the average out of five", has(h, "3.6/5"), true);
  is("and who gave it", has(h, "davidgabon123@gmail.com"), true);
  is("and no longer says not scored", has(h, "not scored"), false);

  const one = Object.assign({ iv_spoken: 4 }, kirze);
  is("a score already given comes back selected",
     has(scoreLine(one), '<option value="4" selected'), true);
}

/* ── what she says she has to work with ──────────────────────────────────
   Collected on the apply form since the beginning and shown nowhere until
   065 put kit and speed into the queue view. 061 left them out because
   nothing read them, and nothing read them because they were not there. */
console.log("\n  Her own claim about her kit");
{
  const h = scoreLine(Object.assign({
    speed: "50 Mbps or more",
    kit: ["Computer meets the specs", "Noise-canceling headset", "HD webcam"]
  }, kirze));
  is("her connection speed is shown", has(h, "50 Mbps or more"), true);
  is("and everything she ticked", has(h, "Noise-canceling headset"), true);
  is("labelled as her word rather than a measurement", has(h, "She says"), true);
  is("and it is not scored", count(h, "data-score="), 6);
}
{
  /* bryant, exactly as he is in the database. */
  const h = scoreLine({ tracks: ["Customer Service", "Admin Tasks"],
                        speed: "25 to 50 Mbps", kit: [] });
  is("an empty kit list is called out rather than left blank",
     has(h, "no equipment ticked"), true);
  is("and his slower line is still shown", has(h, "25 to 50 Mbps"), true);
}
{
  const h = scoreLine(kirze);
  is("an applicant who was never asked shows no claim line", has(h, "She says"), false);
}
{
  const h = scoreLine(Object.assign({ speed: "50 Mbps or more" }, kirze));
  is("speed without kit still shows", has(h, "50 Mbps or more"), true);
  is("and says the equipment is missing", has(h, "no equipment ticked"), true);
}

/* ── the rows that predate tracks[] ──────────────────────────────────────── */
console.log("\n  Rows written before tracks existed");
{
  const old = { track: "Admin Tasks", tracks: null };
  const h = scoreLine(old);
  is("the single track column is still read", has(h, 'data-score="iv_admin_tasks"'), true);
  is("and gives exactly one job row", count(h, "data-score="), 6);
}
{
  const none = { tracks: [] };
  const h = scoreLine(none);
  is("somebody with no track still gets the five", count(h, "data-score="), 5);
  is("and is told why there is no job row", has(h, "no job row to score"), true);
}
{
  const gone = { tracks: ["Bookkeeping"] };
  is("a track this site does not offer scores nothing",
     count(scoreLine(gone), "data-score="), 5);
}

/* ── who may see it ──────────────────────────────────────────────────────── */
console.log("\n  Permission");
is("somebody who cannot edit is shown no scorecard", make(false)(kirze), "");

console.log("");
if (bad) { console.log("  " + bad + " failed"); process.exit(1); }
console.log("  Five things a call shows, then the jobs she actually applied for.");
