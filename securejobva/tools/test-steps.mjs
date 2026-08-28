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

/* ── the five ratings ──────────────────────────────────────────────────────
   Step 3 had no default on any of the five radio groups, no check, and no
   element to put a message in — valid(3) returned true. Somebody could walk
   past the whole page and be told nothing, and the application arrived without
   the ratings the admin row and the notification both show.

   The listener is a named function, so this drives the real one rather than
   reading it: a check that cannot fail is worse than none. */
{
  const html = readFileSync("careers.html", "utf8");
  const at = html.indexOf("  function validSkills() {");
  if (at < 0) throw new Error("careers.html: validSkills() not found");
  const src = html.slice(at, html.indexOf("\n  }", at) + 4);

  const listAt = html.indexOf("  var SKILLS = [");
  const listSrc = html.slice(listAt, html.indexOf("];", listAt) + 2);

  /* A fake page holding five rating blocks, answered or not. */
  function page(answered) {
    const slots = {}, blocks = {};
    const names = ["skill_english", "skill_customer", "skill_data_entry",
                   "skill_social", "skill_bookkeeping"];
    names.forEach((n) => {
      blocks[n] = {
        bad: false,
        classList: { toggle(c, on) { if (c === "is-bad") blocks[n].bad = on; } },
        scrollIntoView() {}
      };
      slots[n] = { textContent: "", closest: () => blocks[n] };
    });
    return {
      slots, blocks, names,
      querySelector(sel) {
        let m = sel.match(/^\[data-skill-err="([a-z_]+)"\]$/);
        if (m) return slots[m[1]];
        m = sel.match(/^\[name=([a-z_]+)\]:checked$/);
        if (m) return answered.includes(m[1]) ? { value: "advanced" } : null;
        return null;
      },
      querySelectorAll: () => []
    };
  }

  function run(answered) {
    const form = page(answered);
    const errBox = { textContent: "" };
    const document = { getElementById: (id) => (id === "err-skills" ? errBox : null) };
    const fn = new Function("form", "document", "clearErrors",
      listSrc + "\n" + src + "\nreturn validSkills();");
    const ok = fn(form, document, () => {});
    return { ok, errBox, form };
  }

  console.log("\nratings\n");

  const all = run(["skill_english", "skill_customer", "skill_data_entry",
                   "skill_social", "skill_bookkeeping"]);
  is("a fully rated step goes through", all.ok, true);
  is("and marks nothing", Object.values(all.form.blocks).filter((b) => b.bad).length, 0);

  const none = run([]);
  is("an unrated step is refused", none.ok, false);
  is("and every missing one is marked, not just the first",
    Object.values(none.form.blocks).filter((b) => b.bad).length, 5);
  is("and each says what to do", none.form.slots.skill_social.textContent, "Pick one.");
  is("and the summary counts them", /5 ratings are missing/.test(none.errBox.textContent), true);

  const some = run(["skill_english", "skill_data_entry", "skill_social"]);
  is("a partly rated step is refused", some.ok, false);
  is("only the missing ones are marked",
    Object.entries(some.form.blocks).filter(([, b]) => b.bad).map(([n]) => n),
    ["skill_customer", "skill_bookkeeping"]);
  is("the summary names them rather than counting",
    /Customer service and Bookkeeping/.test(some.errBox.textContent), true);
  is("and does not name the answered ones",
    /English|Data entry|Social media/.test(some.errBox.textContent), false);

  /* Everything above drives validSkills() directly, which proves the function
     and not that anything calls it. Removing the line that routes step 3 to it
     left all of them green — so this asserts the wiring, which is the one
     thing reading the source does prove. */
  is("step 3 is actually routed to it",
    html.includes("if (step === 3) return validSkills();"), true);

  const one = run(["skill_english", "skill_customer", "skill_data_entry", "skill_social"]);
  is("one missing reads as one, not as a count",
    one.errBox.textContent, "One rating is missing: Bookkeeping.");
}


/* ── the email a signed-in person already proved ───────────────────────────
   /status sends somebody straight to the form when we have nothing under their
   address. Typing that address again is where a typo becomes a second
   application nobody can match to them — and 027 then refuses the correction,
   because from the database's side those are two different people.

   These drive the real signedInEmail() and prefill() out of careers.html. The
   cases that matter are the ones where it must NOT fill: a draft already typed,
   a session that has expired, and anything unreadable in storage. */
{
  const careers = readFileSync("careers.html", "utf8");
  const grab = (n) => {
    const at = careers.indexOf("function " + n + "(");
    if (at < 0) throw new Error("careers.html: " + n + "() not found");
    let d = 0, i = careers.indexOf("{", at);
    for (; i < careers.length; i++) {
      if (careers[i] === "{") d++;
      else if (careers[i] === "}") { d--; if (!d) return careers.slice(at, i + 1); }
    }
    throw new Error("unbalanced " + n);
  };

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const token = (claims) => "header." + b64(claims) + ".signature";

  const run = (stored, alreadyTyped) => {
    const el = { value: alreadyTyped };
    const ctx = {
      localStorage: { getItem: () => stored },
      document: { getElementById: (id) => (id === "ap-email" ? el : null) },
      atob: (s) => Buffer.from(s, "base64").toString("binary"),
      escape: global.escape,
      decodeURIComponent, JSON, Date
    };
    new Function(...Object.keys(ctx),
      grab("signedInEmail") + "\n" + grab("prefill") + "\nprefill();"
    )(...Object.values(ctx));
    return el.value;
  };

  const live = { access_token: token({ email: "maria@example.com", exp: Math.floor(Date.now() / 1000) + 3600 }) };
  const dead = { access_token: token({ email: "maria@example.com", exp: Math.floor(Date.now() / 1000) - 10 }) };

  console.log("\nprefill\n");

  is("a signed-in address fills an empty field",
    run(JSON.stringify(live), ""), "maria@example.com");
  is("a draft already typed is never overwritten",
    run(JSON.stringify(live), "typed@example.com"), "typed@example.com");
  is("an expired session fills nothing",
    run(JSON.stringify(dead), ""), "");
  is("nobody signed in fills nothing",
    run(null, ""), "");
  is("unreadable storage fills nothing and does not throw",
    run("{ not json at all", ""), "");
  is("a session with no email fills nothing",
    run(JSON.stringify({ access_token: token({ exp: Math.floor(Date.now() / 1000) + 3600 }) }), ""), "");

  /* The field stays editable. Applying with a different address than the one
     signed in is allowed — it is only the default that changed. */
  is("the field is not made read-only",
    /id="ap-email"[^>]*\b(readonly|disabled)\b/.test(careers), false);
}

console.log("");
console.log(bad ? bad + " FAILED" : "all passed");
console.log("");
process.exit(bad ? 1 : 0);
