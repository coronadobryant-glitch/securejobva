/* Sits the typing part the way an applicant does, and measures what comes out.

   The typing test moved back onto this page and nothing drove it. The card's
   own test builds its row by hand, which is the shape that shipped the Resume
   state green and dead — a fixture cannot fail to contain what you gave it,
   and it cannot type either.

   So this lifts the real wiring out of the built status.html and gives it a
   page and a clock: characters go in one at a time at a chosen speed, and the
   words a minute that come back have to be the speed they were typed at. That
   is the only way to tell a measurement from a number — a wpm figure computed
   from a fixture agrees with whatever the fixture said.

   Each scenario gets a fresh page on purpose. The wiring keeps the moment of
   the first keystroke in a closure, so a second run against the same instance
   is timed from the first run's first key and reports about half the speed.
   That was found here, by this file, on its first draft.

   Run: node tools/test-typing.mjs */
import { readFileSync } from "node:fs";

const html = readFileSync("status.html", "utf8");

function slice(from, to, what) {
  const a = html.indexOf(from);
  if (a < 0) throw new Error("no " + what + " (start) in status.html");
  const b = html.indexOf(to, a);
  if (b < 0) throw new Error("no " + what + " (end) in status.html");
  return html.slice(a, b);
}

const TYPE_TEXT = (() => {
  const src = slice('var TYPE_TEXT = "', "\nfunction assessCard(", "TYPE_TEXT");
  return eval("(function(){" + src.slice(0, src.lastIndexOf(";") + 1) + "return TYPE_TEXT})()");
})();
const accSrc = slice("function typingAccuracy(typed) {", "\nfunction writtenPart(", "typingAccuracy");
const wiring = (() => {
  const s = slice('var box = document.getElementById("a-type");',
                  "/* How close what was typed is", "typingPart wiring");
  return s.slice(0, s.lastIndexOf("}"));
})();

console.log("passage: " + TYPE_TEXT.length + " characters");
console.log("wiring:  " + wiring.split("\n").length + " lines lifted from status.html\n");

let NOW = 1700000000000;
const FakeDate = { now: () => NOW };
const el = (id) => ({
  id, value: "", textContent: "", style: {}, focused: false, h: {},
  addEventListener(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); },
  fire(ev, e) { (this.h[ev] || []).forEach((fn) => fn(e || { preventDefault() {} })); },
  focus() { this.focused = true; },
});

const typingAccuracy = new Function("TYPE_TEXT", accSrc + "; return typingAccuracy;")(TYPE_TEXT);

/* A brand new page each time. The wiring keeps `started` in a closure, so
   reusing one instance measures the second run from the first run's first
   keystroke. */
let box, live, conn, err, done, saved;
function fresh() {
  const ids = ["a-type", "a-live", "a-conn", "a-err", "a-done"];
  const els = {};
  ids.forEach((id) => { els[id] = el(id); });
  [box, live, conn, err, done] = ids.map((i) => els[i]);
  saved = null;
  const document = { getElementById: (id) => els[id] || null };
  const closePart = (patch, part) => { saved = { patch, part }; return Promise.resolve(); };
  new Function("document", "TYPE_TEXT", "typingAccuracy", "closePart", "Date", wiring)
    (document, TYPE_TEXT, typingAccuracy, closePart, FakeDate);
}

function type(text, wpm) {
  const msPerChar = 60000 / (wpm * 5);
  for (const ch of text) { box.value += ch; NOW += msPerChar; box.fire("input"); }
}

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log((ok ? "  ok   " : "  FAIL ") + label +
    (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
};
const near = (label, got, want, slack) => {
  const ok = Math.abs(got - want) <= slack;
  if (!ok) bad++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + " — " + got +
    (ok ? "" : " (wanted " + want + " ± " + slack + ")"));
};
const LINK = "https://www.speedtest.net/result/c/9f3a-not-real";

console.log("1. Type the whole passage cleanly, at 60 wpm");
fresh();
is("nothing said before the first keystroke", live.textContent, "");
type(TYPE_TEXT, 60);
near("wpm measured off the keystrokes", Number(/^(\d+)/.exec(live.textContent)[1]), 60, 1);
is("live line reads back both numbers", /^\d+ wpm, 100% accurate so far$/.test(live.textContent), true);

console.log("\n2. The speed test link");
done.fire("click");
is("refused with nothing in the box", err.textContent, "Paste a link to your speed test too — speedtest.net gives you one.");
is("and the cursor is put in it", conn.focused, true);
conn.value = "speedtest.net/result/123";
done.fire("click");
is("a bare host is still refused", /speed test too/.test(err.textContent), true);
conn.value = LINK;
done.fire("click");
is("a real link is accepted", err.style.display, "none");
is("and the part is closed as typing", saved && saved.part, "typing");
near("wpm saved", saved.patch.typing_wpm, 60, 1);
is("accuracy saved", saved.patch.typing_accuracy, 100);
is("connection link saved", saved.patch.connection_proof, LINK);
is("no score or verdict sent from here", Object.keys(saved.patch).sort(), ["connection_proof", "typing_accuracy", "typing_wpm"]);

console.log("\n3. Too little to mean anything");
fresh();
type(TYPE_TEXT.slice(0, 40), 60);
conn.value = LINK;
done.fire("click");
is("forty characters is refused", /Type the message above first/.test(err.textContent), true);
is("and nothing was saved", saved, null);

console.log("\n4. Pasting");
fresh();
box.fire("paste");
is("the paste is called out", err.textContent, "Type it yourself — pasting is turned off on this part.");
box.fire("drop");
is("so is a drop", /pasting is turned off/.test(err.textContent), true);
type("T", 60);
is("and the accusation comes down as she types", err.textContent, "");
err.style.display = "";
err.textContent = "That did not save. Check your connection and try the part again.";
type("h", 60);
is("but a failed save is NOT cleared by typing", err.textContent, "That did not save. Check your connection and try the part again.");

console.log("\n5. What the accuracy actually costs");
const one = TYPE_TEXT.slice(0, 50) + TYPE_TEXT.slice(51);
is("one missed letter in " + TYPE_TEXT.length, typingAccuracy(one), 100 - Math.round(100 / one.length));
is("stopping half way is still accurate", typingAccuracy(TYPE_TEXT.slice(0, 160)), 100);
is("nothing typed", typingAccuracy(""), 0);
console.log("  note  " + typingAccuracy("qqqq".repeat(20)) + "% for eighty characters of junk");

console.log("\n6. A realistic run: three typos, 47 wpm");
fresh();
const real = TYPE_TEXT.replace("Tuesday", "Tuesdya").replace("warehouse", "warehosue").replace("courier", "couier");
type(real, 47);
const m = /^(\d+) wpm, (\d+)%/.exec(live.textContent);
near("wpm", Number(m[1]), 47, 1);
near("accuracy with three typos", Number(m[2]), 98, 2);
conn.value = LINK;
done.fire("click");
is("saved", saved && saved.part, "typing");
console.log("  note  saved as " + saved.patch.typing_wpm + " wpm at " + saved.patch.typing_accuracy + "%");

console.log("\n7. Slow and careless, against the pass marks");
fresh();
type(TYPE_TEXT.slice(0, 200).replace(/e/g, "3"), 22);
const m2 = /^(\d+) wpm, (\d+)%/.exec(live.textContent);
console.log("  note  " + m2[1] + " wpm at " + m2[2] + "% — target is " +
  /var TYPE_TARGET = (\d+)/.exec(html)[1] + " wpm, minimum accuracy " +
  /var TYPE_MIN_ACC = (\d+)/.exec(html)[1] + "%");

console.log("\n" + (bad ? bad + " FAILED" : "all ok"));
process.exit(bad ? 1 : 0);
