/* The questionnaire, checked without a browser.

   Three things here are worth a test. The item bank has to be well formed, or
   the profile is arithmetic on nothing. The generated SQL has to still match
   the item bank, or the page asks one question and the database scores a
   different one — a drift that raises no error and produces a wrong answer
   about a real person. And the page's own rules have to hold: a complete sheet
   goes through, an incomplete one does not, and no word is both most and
   least.

   Run: node tools/test-disc.mjs */
import { readFileSync } from "node:fs";
import { GROUPS, STYLES, LETTERS } from "./disc-items.mjs";
import { sqlText, pageText } from "./build-disc.mjs";

let failed = 0;
const check = (name, fn) => {
  try { fn(); console.log("  ok    " + name); }
  catch (e) { failed++; console.log("  FAIL  " + name + "\n          " + e.message); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/* ── the bank ───────────────────────────────────────────────────────────── */

check("every group offers exactly one D, I, S and C", () => {
  GROUPS.forEach((g, i) => {
    assert(g.length === 4, "group " + i + " has " + g.length + " words");
    const k = g.map((w) => w[1]).sort().join("");
    assert(k === "CDIS", "group " + i + " covers " + k + ", not all four");
  });
});

check("no word is asked twice", () => {
  const words = GROUPS.flat().map((w) => w[0].toLowerCase());
  const dup = words.filter((w, i) => words.indexOf(w) !== i);
  assert(!dup.length, "repeated: " + [...new Set(dup)].join(", "));
});

check("the letters are not in a guessable column", () => {
  /* If D were always first, somebody who worked that out could tick a column
     and choose their own profile. Every letter has to appear in more than one
     position across the twelve groups. */
  for (const k of LETTERS) {
    const seats = new Set(GROUPS.map((g) => g.findIndex((w) => w[1] === k)));
    assert(seats.size > 1, k + " sits in position " + [...seats][0] + " every time");
  }
});

check("every letter has a name and a use", () => {
  for (const k of LETTERS) {
    assert(STYLES[k] && STYLES[k].name && STYLES[k].blurb && STYLES[k].fits,
      k + " has no description — the admin row would show a bare letter");
  }
});

check("any complete sheet scores to zero across the four letters", () => {
  /* Each group gives one letter a point and takes one from another, so the
     four totals always sum to zero. It is what makes the numbers comparable
     between two applicants, and the SQL self-test asserts the same thing. */
  const map = GROUPS.map((g) => g.map((w) => w[1]));
  for (let trial = 0; trial < 200; trial++) {
    const t = { D: 0, I: 0, S: 0, C: 0 };
    for (let g = 0; g < map.length; g++) {
      const m = trial % 4;
      const l = (m + 1 + (trial % 3)) % 4;
      t[map[g][m]]++;
      t[map[g][l === m ? (m + 1) % 4 : l]]--;
    }
    const sum = t.D + t.I + t.S + t.C;
    assert(sum === 0, "a sheet scored " + JSON.stringify(t) + ", summing to " + sum);
  }
});

/* ── the generated files still match the bank ───────────────────────────── */

check("sql/021 and careers.html are current with the item bank", () => {
  /* Compared, not regenerated. Rewriting the files to find out whether they
     needed rewriting means the check repairs what it is meant to report, and
     passes the second time you run it. */
  const onDisk = readFileSync("sql/025-disc.sql", "utf8");
  assert(onDisk === sqlText(), "sql/025-disc.sql is stale — run node tools/build-disc.mjs");
  const page = readFileSync("careers.html", "utf8");
  assert(page === pageText(page), "careers.html is stale — run node tools/build-disc.mjs");
});

check("the scoring map in the SQL is the item bank", () => {
  const sql = readFileSync("sql/025-disc.sql", "utf8");
  const block = sql.match(/map\s+jsonb\s*:=\s*'\[([\s\S]*?)\]'::jsonb/);
  assert(block, "no scoring map found in sql/025-disc.sql");
  const got = JSON.parse("[" + block[1].replace(/\r?\n/g, " ") + "]");
  const want = GROUPS.map((g) => g.map((w) => w[1]));
  assert(JSON.stringify(got) === JSON.stringify(want),
    "the map and the bank disagree:\n          sql:  " + JSON.stringify(got) +
    "\n          bank: " + JSON.stringify(want));
});

check("the page is never told which word is which letter", () => {
  /* The whole reason the database scores it. If a letter map ever reaches the
     markup, view-source is an answer key. */
  const html = readFileSync("careers.html", "utf8");
  const at = html.indexOf('<div class="disc">');
  const end = html.indexOf("</div>", html.indexOf("<!-- disc:end -->"));
  const block = html.slice(at, end);
  for (const [word, letter] of GROUPS.flat()) {
    const near = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      '[^\\n]{0,80}\\b' + letter + '\\b');
    assert(!near.test(block), '"' + word + '" appears next to its letter ' + letter);
  }
  assert(!/disc[_-]?(map|key|letters)/i.test(html), "a map-shaped name is in the page");
});

/* ── the page's own rules ───────────────────────────────────────────────── */

const html = readFileSync("careers.html", "utf8");
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

function grab(name) {
  const at = js.indexOf("function " + name + "(");
  if (at < 0) throw new Error("cannot find " + name + "()");
  let depth = 0, i = js.indexOf("{", at);
  for (; i < js.length; i++) {
    if (js[i] === "{") depth++;
    else if (js[i] === "}") { depth--; if (!depth) return js.slice(at, i + 1); }
  }
  throw new Error("unbalanced " + name);
}

/* A fake form holding one radio per word, matched by the same selectors the
   page uses. Nothing here models a browser; it models the checked flags, which
   is all discAnswers() reads. */
function sheet(fill) {
  const boxes = [];
  GROUPS.forEach((g, gi) => g.forEach((_, wi) => {
    boxes.push({ name: "disc_m" + gi, value: String(wi), checked: false, g: gi, kind: "m", wi });
    boxes.push({ name: "disc_l" + gi, value: String(wi), checked: false, g: gi, kind: "l", wi });
  }));
  if (fill) fill(boxes);

  const groups = GROUPS.map((_, gi) => ({
    gi,
    classList: { _bad: false, toggle(c, on) { if (c === "is-bad") this._bad = on; },
                 remove() { this._bad = false; } },
    querySelector() { return errs[this.gi]; },
    scrollIntoView() {}
  }));
  const errs = GROUPS.map(() => ({ textContent: "" }));

  return {
    boxes,
    groups,
    errs,
    querySelector(sel) {
      let m = sel.match(/^\[name=disc_([ml])(\d+)\]:checked$/);
      if (m) return boxes.find((b) => b.kind === m[1] && b.g === Number(m[2]) && b.checked) || null;
      m = sel.match(/^\[data-disc-g="(\d+)"\]$/);
      if (m) return groups[Number(m[1])];
      return null;
    },
    querySelectorAll(sel) {
      if (sel === "[data-disc-g]") return groups;
      return [];
    }
  };
}

function load(form) {
  const errBox = { textContent: "" };
  const ctx = {
    form,
    document: { getElementById: (id) => (id === "err-disc" ? errBox : null) },
    clearErrors() { form.errs.forEach((e) => { e.textContent = ""; }); errBox.textContent = ""; }
  };
  const src = [
    "var DISC_N = form.querySelectorAll('[data-disc-g]').length;",
    grab("discPick"),
    grab("discAnswers"),
    grab("validDisc"),
    "return { discAnswers: discAnswers, validDisc: validDisc };"
  ].join("\n");
  const api = new Function(...Object.keys(ctx), src)(...Object.values(ctx));
  api.errBox = errBox;
  return api;
}

const complete = (boxes) => boxes.forEach((b) => {
  if (b.kind === "m" && b.wi === 0) b.checked = true;
  if (b.kind === "l" && b.wi === 1) b.checked = true;
});

check("a complete sheet is accepted and sends one answer per group", () => {
  const f = sheet(complete);
  const api = load(f);
  assert(api.validDisc() === true, "a fully answered sheet was refused");
  const a = api.discAnswers();
  assert(a && a.length === GROUPS.length, "got " + (a ? a.length : "null") + " answers");
  a.forEach((x, i) => {
    assert(x.g === i, "answer " + i + " is for group " + x.g);
    assert(x.m !== x.l, "group " + i + " sent the same word most and least");
    assert(x.m >= 0 && x.m <= 3 && x.l >= 0 && x.l <= 3, "a pick is out of range");
  });
});

check("a missing least is refused and named", () => {
  const f = sheet((b) => {
    complete(b);
    b.find((x) => x.kind === "l" && x.g === 5 && x.checked).checked = false;
  });
  const api = load(f);
  assert(api.validDisc() === false, "an unfinished sheet went through");
  assert(api.discAnswers() === null, "discAnswers returned a partial sheet");
  assert(/least/i.test(f.errs[5].textContent), "group 6 was not told what it needs: " + f.errs[5].textContent);
  assert(f.groups[5].classList._bad, "group 6 was not marked");
  assert(f.errs[4].textContent === "", "a finished group was marked as a problem");
});

check("an empty sheet is refused without claiming one group is fine", () => {
  const f = sheet(null);
  const api = load(f);
  assert(api.validDisc() === false, "an empty sheet went through");
  const clean = f.errs.filter((e) => !e.textContent).length;
  assert(clean === 0, clean + " unanswered groups were reported as complete");
});

check("the same word cannot be most and least", () => {
  const f = sheet((b) => {
    complete(b);
    b.find((x) => x.kind === "l" && x.g === 2 && x.wi === 1).checked = false;
    b.find((x) => x.kind === "l" && x.g === 2 && x.wi === 0).checked = true;
  });
  const api = load(f);
  assert(api.validDisc() === false, "a word marked both ways was accepted");
  assert(/cannot be both/i.test(f.errs[2].textContent), "the reason was not given: " + f.errs[2].textContent);
});

check("the page sends answers and never a score", () => {
  /* sql/021 grants anon application_id and answers. Anything else in the body
     makes the whole insert 42501 — so this is the check that keeps the
     questionnaire storable at all. */
  const at = js.indexOf("function postDisc(");
  assert(at > -1, "postDisc() is gone");
  const body = js.slice(at, js.indexOf("\n  }", at));
  const keys = [...body.matchAll(/JSON\.stringify\(\{([^}]*)\}/g)]
    .flatMap((m) => m[1].split(",").map((p) => p.split(":")[0].trim()))
    .filter(Boolean);
  assert(keys.length === 2 && keys.includes("application_id") && keys.includes("answers"),
    "postDisc sends " + keys.join(", ") + " — anon may only write application_id and answers");
  assert(!/\b(primary_style|\bd\s*:|score)/.test(body), "postDisc looks like it sends a score");
});

console.log("\n" + (failed ? failed + " FAILED" : "all disc checks passed"));
process.exit(failed ? 1 : 0);
