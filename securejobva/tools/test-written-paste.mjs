/* Drives the written reply's paste guard and its word counter.

   The written reply is the one part of the assessment a chatbot can simply
   write, so pasting is refused here. That half worked the first time anybody
   tried it: both paste and drop are cancelled and nothing lands in the box.

   The other half did not. The refusal wrote a line into #a-err and nothing
   ever took it down, so somebody who tried to paste once, was told off, and
   then wrote all hundred and fifty words by hand was still being accused of
   pasting when they pressed Done. Found by doing exactly that during the first
   assessment anybody has sat.

   That is the same rule as the apply form earlier today — an error that
   outlives the thing it is about is the page calling somebody a liar — and the
   fix has the same shape, with one extra care: #a-err is shared with
   closePart(), so only the paste line is cleared. A save that failed is not
   something the next keystroke resolves, and clearing it would hide the one
   error on this screen worth seeing.

   The listeners are lifted out of the built page and run against a fake box,
   so this tests what ships.

   Run: node tools/test-written-paste.mjs */
import { readFileSync } from "node:fs";

const html = readFileSync("status.html", "utf8");
const from = html.indexOf('box.addEventListener("input", function () {');
if (from < 0) throw new Error("no input handler on the written box in status.html");
const to = html.indexOf("box.focus();", from);
if (to < 0) throw new Error("could not find the end of the written wiring");
const wiring = html.slice(from, to);

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "FAIL") + "  " + label +
    (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
};

function build() {
  const handlers = {};
  const box = {
    value: "",
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    focus() {},
  };
  const count = { textContent: "" };
  const err = { textContent: "", style: { display: "none" } };
  const document = { getElementById: (id) => (id === "a-err" ? err : null) };

  let saved = 0;
  const saveProgress = () => { saved++; };

  new Function("box", "count", "document", "saveProgress", wiring)(box, count, document, saveProgress);

  const fire = (type) => {
    let prevented = false;
    const e = { preventDefault() { prevented = true; } };
    (handlers[type] || []).forEach((fn) => fn.call(box, e));
    return prevented;
  };
  return { box, count, err, fire, wired: Object.keys(handlers), saved: () => saved };
}

/* ── the guard itself ────────────────────────────────────────────────────── */
{
  const t = build();
  is("both ways text arrives without being typed are wired",
    t.wired.includes("paste") && t.wired.includes("drop"), true);
  is("a paste is refused", t.fire("paste"), true);
  is("and says so", t.err.textContent.indexOf("pasting is turned off") > -1, true);
  is("and the line is visible", t.err.style.display, "");
}
{
  const t = build();
  is("a drop is refused too", t.fire("drop"), true);
  is("and says the same thing", t.err.textContent.indexOf("pasting is turned off") > -1, true);
}

/* ── and the refusal does not outlive the paste ──────────────────────────── */
{
  const t = build();
  t.fire("paste");
  t.box.value = "Hello, and I am sorry about the delay.";
  t.fire("input");
  is("typing takes the accusation down", t.err.textContent, "");
  is("and hides the line rather than leaving a gap", t.err.style.display, "none");
}
{
  /* The care that makes it safe: #a-err is shared, and a failed save is not
     answered by typing another letter. */
  const t = build();
  t.err.textContent = "We could not save that. Check your connection.";
  t.err.style.display = "";
  t.box.value = "still writing";
  t.fire("input");
  is("a save failure survives the next keystroke",
    t.err.textContent, "We could not save that. Check your connection.");
  is("and stays on screen", t.err.style.display, "");
}

/* ── the counter, which is how she knows she is near 150 ─────────────────── */
{
  const t = build();
  t.box.value = "one two three four five";
  t.fire("input");
  is("words are counted", t.count.textContent, "5 words");
  t.box.value = "   ";
  t.fire("input");
  is("whitespace is not a word", t.count.textContent, "0 words");
  t.box.value = "spread   over    several     spaces";
  t.fire("input");
  is("runs of spaces do not inflate the count", t.count.textContent, "4 words");
}
{
  const t = build();
  t.box.value = "typing";
  t.fire("input");
  is("what she writes is saved as she writes it", t.saved(), 1);
}

console.log("");
if (bad) { console.log(bad + " failed"); process.exit(1); }
console.log("14 behaviours, the guard and the line it used to leave behind");
