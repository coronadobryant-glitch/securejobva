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
/* Anchored inside writtenPart, because the typing part now wires a box of
   its own and indexOf would hand back whichever comes first in the file. */
const wp = html.indexOf("function writtenPart(");
if (wp < 0) throw new Error("no writtenPart() in status.html");
const from = html.indexOf('box.addEventListener("input", function () {', wp);
if (from < 0) throw new Error("no input handler on the written box in status.html");
/* To the end of the done handler rather than to box.focus(), which is where
   this stopped when the only thing under test was the paste guard. The empty
   close lives past that line, and a slice that ends before it took resetConfirm
   with it — the input handler called a function this file had cut off, which is
   how a green walk started throwing the moment the two halves had to talk. */
const tail = 'closePart({ written_reply: box.value.slice(0, 8000) }, "written");';
const t0 = html.indexOf(tail, from);
if (t0 < 0) throw new Error("could not find the end of the written wiring");
const to = html.indexOf("});", t0) + 3;
const wiring = html.slice(from, to);

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "FAIL") + "  " + label +
    (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
};

/* A button flat enough to be inserted next to and taken away again, which is
   all the confirm does to the card. */
function fakeButton(id) {
  return {
    id, type: "", textContent: "", className: "", style: { cssText: "" },
    parentNode: null,
    clicks: [],
    addEventListener(type, fn) { if (type === "click") this.clicks.push(fn); },
    /* isTrusted is the whole point of the confirm: the deadline closes this
       part by clicking the same button, and that click must go straight
       through. Default true, because a person pressing it is the case the
       page is written for; the timer's click passes false. */
    press(trusted = true) { this.clicks.forEach((fn) => fn.call(this, { isTrusted: trusted })); },
  };
}

function build() {
  const handlers = {};
  const box = {
    value: "",
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    focus() { box.focused = true; },
    focused: false,
  };
  const count = { textContent: "" };
  const err = { textContent: "", style: { display: "none" } };

  const doneBtn = fakeButton("a-done");
  const row = {
    kids: [doneBtn],
    insertBefore(node, before) {
      node.parentNode = row;
      row.kids.splice(row.kids.indexOf(before), 0, node);
    },
    removeChild(node) { row.kids.splice(row.kids.indexOf(node), 1); node.parentNode = null; },
  };
  doneBtn.parentNode = row;

  const document = {
    getElementById: (id) => (id === "a-err" ? err : id === "a-done" ? doneBtn : null),
    createElement: () => fakeButton(""),
  };

  let saved = 0;
  const saveProgress = () => { saved++; };
  let closed = null;
  const closePart = (patch, part) => { closed = { patch, part }; };

  new Function("box", "count", "document", "saveProgress", "closePart",
    "SAVE_T", "SAVE_PENDING", wiring)(box, count, document, saveProgress, closePart, null, null);

  const fire = (type) => {
    let prevented = false;
    const e = { preventDefault() { prevented = true; } };
    (handlers[type] || []).forEach((fn) => fn.call(box, e));
    return prevented;
  };
  /* Whatever the confirm put next to the done button, or null. */
  const keep = () => row.kids.find((k) => k !== doneBtn) || null;
  return { box, count, err, fire, wired: Object.keys(handlers), saved: () => saved,
           doneBtn, keep, closed: () => closed, buttons: () => row.kids.length };
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

/* ── closing the part with nothing in it ─────────────────────────────────
   The written part on the only assessment in the database was opened at
   01:57:01 and marked done at 01:57:02 holding nought characters. The card
   offers no way back into a finished part, so that one press ended the work
   sample. It asks now. */
{
  const t = build();
  t.doneBtn.press();
  is("an empty box does not close on the first press", t.closed(), null);
  is("and she is told why", t.err.textContent.indexOf("not written anything") > -1, true);
  is("and the line is visible", t.err.style.display, "");
  is("a second button appears", t.buttons(), 2);
  is("the safe one is offered", t.keep() && t.keep().textContent, "Keep writing");
  is("and it is the solid one", t.keep() && t.keep().className, "btn btn--solid");
  is("closing empty becomes the quiet choice", t.doneBtn.textContent, "Close it empty");
  is("and stops being the solid one", t.doneBtn.className, "btn btn--ghost");
}
{
  const t = build();
  t.doneBtn.press();
  t.doneBtn.press();
  is("pressing it again does close the part", t.closed() && t.closed().part, "written");
  is("with the empty reply she asked to send", t.closed().patch.written_reply, "");
}
{
  const t = build();
  t.doneBtn.press();
  t.keep().press();
  is("keeping it puts the one button back", t.buttons(), 1);
  is("and the label with it", t.doneBtn.textContent, "Done writing");
  is("and takes the question down", t.err.textContent, "");
  is("and puts the cursor back in the box", t.box.focused, true);
}
{
  const t = build();
  t.doneBtn.press();
  t.box.value = "Dear customer, I am sorry.";
  t.fire("input");
  is("writing something answers the question by itself", t.buttons(), 1);
  is("and the button goes back to closing the part", t.doneBtn.textContent, "Done writing");
  t.doneBtn.press();
  is("which it then does on one press", t.closed() && t.closed().part, "written");
}
{
  const t = build();
  t.box.value = "A reply I actually wrote.";
  t.fire("input");
  t.doneBtn.press();
  is("a box with something in it never sees the question", t.buttons(), 1);
  is("and closes on the first press", t.closed().patch.written_reply, "A reply I actually wrote.");
}
{
  /* The one that matters most. partShell's tick calls done.click() when the
     twenty minutes go, which is how her writing is banked rather than lost
     with the tab. A confirm that catches that click leaves the part sitting
     there asking a question of an empty room, and the work goes. */
  const t = build();
  t.doneBtn.press(false);
  is("the deadline closes an empty part without asking anybody",
    t.closed() && t.closed().part, "written");
  is("and asks no question that nobody is there to answer", t.buttons(), 1);
}

console.log("");
if (bad) { console.log(bad + " failed"); process.exit(1); }
console.log("35 behaviours, the paste guard, the line it used to leave behind, " +
  "and the press that used to empty the work sample");
