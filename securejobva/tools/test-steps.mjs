/* The apply dialog went blank and stayed blank.

   show(n) hid every step when n was past the end — no step matched `k === n`,
   so the else branch hid all of them — then threw on steps[n].querySelector.
   The counter was skipped because `n < LAST` was false, so it froze on its old
   value. Every rail segment lit up because `k <= n` was true for all of them.

   An applicant saw an empty box with a live "Send it", their answers still in
   it, and no way forward. Four separate wrong behaviours from one unbounded
   index, and every one of them silent.

   This pulls the real show() out of the page and drives it.

   Run: node tools/test-steps.mjs
*/
import { readFileSync } from "node:fs";

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}  got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

/* Enough of an element to satisfy show(). */
function el() {
  const attrs = new Set();
  return {
    attrs,
    setAttribute: (k) => attrs.add(k),
    removeAttribute: (k) => attrs.delete(k),
    querySelector: () => null,
    get hidden() { return attrs.has("hidden"); }
  };
}

function harness(file) {
  const html = readFileSync(file, "utf8");
  const from = html.indexOf("  function show(n) {");
  if (from < 0) throw new Error(file + ": show() not found");
  const end = html.indexOf("\n  }", html.indexOf("var first = steps[n]", from));
  const src = html.slice(from, end + 4);

  const steps = [el(), el(), el(), el(), el()];
  const rail = [el(), el(), el(), el()];
  const LAST = steps.length - 1;
  const count = { textContent: "" };
  const next = { textContent: "" };
  const back = el();
  const form = { scrollTop: 1 };
  let at = 0;

  const show = new Function(
    "steps", "rail", "LAST", "count", "next", "back", "form", "setAt", "getAt",
    src.replace(/\bat = n;/, "setAt(n);") + "\n return show;"
  )(steps, rail, LAST, count, next, back, form, (n) => { at = n; }, () => at);

  return { show, steps, rail, count, next, LAST, at: () => at };
}

for (const file of ["index.html", "careers.html"]) {
  console.log("\n" + file + "\n");
  const h = harness(file);

  /* ── the ordinary walk still works ─────────────────────────────────── */

  h.show(0);
  is("step 0 is the only one visible", h.steps.map((s) => s.hidden), [false, true, true, true, true]);
  is("the counter reads step 1", h.count.textContent, "Step 1 of " + h.LAST);

  h.show(2);
  is("step 2 is the only one visible", h.steps.map((s) => s.hidden), [true, true, false, true, true]);

  h.show(h.LAST - 1);
  is("the button says Send it on the last question", h.next.textContent, "Send it");

  h.show(h.LAST);
  is("the done screen shows", h.steps.map((s) => s.hidden)[h.LAST], false);

  /* ── and an index past the end is refused ──────────────────────────── */

  h.show(2);
  const before = { steps: h.steps.map((s) => s.hidden), count: h.count.textContent, at: h.at() };

  let threw = null;
  try { h.show(h.LAST + 1); } catch (e) { threw = e.message; }
  is("one past the end does not throw", threw, null);
  is("and leaves every step exactly as it was", h.steps.map((s) => s.hidden), before.steps);
  is("and does not blank the dialog", h.steps.some((s) => !s.hidden), true);
  is("and does not freeze the counter on a stale value", h.count.textContent, before.count);
  is("and does not move `at`", h.at(), before.at);

  try { h.show(99); } catch (e) { threw = e.message; }
  is("far past the end does not throw", threw, null);
  is("still not blank", h.steps.some((s) => !s.hidden), true);

  try { h.show(-1); } catch (e) { threw = e.message; }
  is("below zero does not throw", threw, null);
  is("still not blank", h.steps.some((s) => !s.hidden), true);

  try { h.show(undefined); } catch (e) { threw = e.message; }
  is("undefined does not throw", threw, null);
  is("still not blank", h.steps.some((s) => !s.hidden), true);
}

console.log("");
console.log(bad ? bad + " FAILED" : "all passed");
console.log("");
process.exit(bad ? 1 : 0);
