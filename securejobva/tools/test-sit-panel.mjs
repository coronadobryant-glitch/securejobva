/* What /admin says about an assessment, driven against the real sitLine().

   This panel has now been wrong twice in the same way, and both times the code
   was correct for an arrangement that had moved.

   045 built an assessment that scored itself and moved somebody to Interview,
   and no screen in /admin showed the result at all — you saw a stage change
   and nothing about why. That was the first time.

   The second is this file's reason for existing. 049 held the verdict at
   'in_progress' until a person had checked the typing and marked the writing,
   so the panel showed "waiting on ..." INSTEAD of a verdict — correct, because
   there was no verdict to show. 063 grades on the send. The verdict exists
   immediately now, and the old branch went on hiding it behind the same
   sentence: grading was made automatic and the grade still could not be seen.

   Nothing failed either time. The panel rendered, the words were true of the
   database that used to be underneath it, and only reading the two against
   each other shows it.

   So this asserts the join rather than the panel: what 063's scorer guarantees
   about a row, and what this screen says when handed one.

   Run: node tools/test-sit-panel.mjs */
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

const sitLine = new Function(
  "esc", "when",
  grab("sitLine") + "; return sitLine;"
)((s) => String(s === null || s === undefined ? "" : s), () => "2 September");

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "FAIL") + "  " + label +
    (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
};

/* A row as 063's scorer leaves one: sent, scored, with a verdict, and with
   neither human figure filled in — which is now the ordinary state of every
   assessment the moment it arrives, not an exceptional one. */
const graded = (over) => ({
  id: "a1",
  sit: Object.assign({
    submitted_at: "2026-09-02T10:00:00Z",
    track: "Customer Service",
    verdict: "passed",
    score_english: 8, score_scenarios: 8, score_detail: 6, score_sales: null,
    typing_wpm: 52, typing_accuracy: 97,
    typing_verified_wpm: null, typing_verified_accuracy: null,
    written_score: null,
    typing_proof: "applicant-docs/a1/typing-1.png",
    connection_proof: "https://www.speedtest.net/result/1"
  }, over || {})
});

/* ── the verdict is the answer, and it is always shown ───────────────────── */
console.log("\n  The grade is visible");

let h = sitLine(graded());
is("a verdict nobody has checked is still shown", h.indexOf("sit__v--passed") > -1, true);
is("and says so in words", h.indexOf(">passed<") > -1, true);
is("and is not replaced by what is outstanding",
   h.indexOf("waiting on the typing") > -1, false);

h = sitLine(graded({ verdict: "below_line" }));
is("a fail is shown the same way", h.indexOf("sit__v--below_line") > -1, true);
is("in words somebody would use", h.indexOf("below the line") > -1, true);

/* ── and what is provisional about it is said, after it ──────────────────── */
console.log("\n  What is still somebody's word for it");

h = sitLine(graded());
is("the row says it is on her own figures", h.indexOf("on her own figures") > -1, true);
is("and names both things outstanding",
   h.indexOf("the typing checked and the writing marked") > -1, true);
is("and the verdict comes first",
   h.indexOf("sit__v--passed") < h.indexOf("on her own figures"), true);

h = sitLine(graded({ typing_verified_wpm: 48, typing_verified_accuracy: 96 }));
is("checking the typing takes it off the list", h.indexOf("the typing checked") > -1, false);
is("and leaves the writing on it", h.indexOf("the writing marked") > -1, true);

h = sitLine(graded({ typing_verified_wpm: 48, typing_verified_accuracy: 96, written_score: 7 }));
is("a fully checked row says nothing is outstanding",
   h.indexOf("on her own figures") > -1, false);
is("and still shows the verdict", h.indexOf("sit__v--passed") > -1, true);

/* ── the consequence somebody would otherwise have to work out ───────────── */
console.log("\n  Why a passed row has not moved");

h = sitLine(graded());
is("a pass with unchecked typing says she is not invited yet",
   h.indexOf("not invited until the typing is checked") > -1, true);

h = sitLine(graded({ typing_verified_wpm: 48, typing_verified_accuracy: 96 }));
is("checking the typing takes that line away",
   h.indexOf("not invited") > -1, false);

h = sitLine(graded({ verdict: "below_line" }));
is("and a fail never carries it — nothing was going to move anyway",
   h.indexOf("not invited") > -1, false);

/* ── the proof, which is a stored file now and not a link ────────────────── */
console.log("\n  Her proof");

h = sitLine(graded());
is("the screenshot is opened through the document signer, not an href",
   h.indexOf('data-doc="applicant-docs/a1/typing-1.png"') > -1, true);
is("and is not put in an href where a private bucket would refuse it",
   h.indexOf('href="applicant-docs') > -1, false);

h = sitLine(graded({ typing_proof: "https://typingtest.com/result/9" }));
is("a proof from before the change is still a plain link",
   h.indexOf('href="https://typingtest.com/result/9"') > -1, true);

h = sitLine(graded({ typing_proof: null }));
is("and no proof says so", h.indexOf("no proof sent") > -1, true);

/* ── the one state that predates all of this ─────────────────────────────── */
console.log("\n  Before she sends it");

is("an unsent assessment draws no panel at all",
   sitLine({ id: "a1", sit: { submitted_at: null, verdict: "in_progress" } }), "");
is("and neither does an applicant who has not started one",
   sitLine({ id: "a1", sit: null }), "");

console.log("");
if (bad) { console.log("  " + bad + " failed"); process.exit(1); }
console.log("  The panel shows the grade, then says how much of it is still her own word.");
