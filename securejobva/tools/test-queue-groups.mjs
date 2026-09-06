/* The applicant queue, split into stages, driven against the real grouped().

   It was one flat list ordered by who had waited longest, which is right
   inside a stage and wrong across them: somebody who applied this morning,
   somebody sitting exams and somebody with an interview booked need different
   things done, and they were interleaved by age with a small pill to tell them
   apart.

   Grouping has exactly one failure mode worth testing for, and it is not
   cosmetic: a row that lands in no group at all. Nobody notices an applicant
   who stopped being drawn — the count at the top is computed separately, the
   filters still work, and the person is simply gone from the screen that
   decides about them. So the assertion this file exists for is the boring one:
   everybody in, exactly once, whatever their status.

   Nothing here touches the network or the database.

   Run: node tools/test-queue-groups.mjs */
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
    if (c === '"' || c === "'") { inStr = c; continue; }
    if ("[{(".includes(c)) depth++;
    else if ("]})".includes(c)) depth--;
    else if (c === ";" && depth === 0) return js.slice(at, i + 1);
  }
  throw new Error("unterminated var " + name);
}

/* rowHtml is stubbed rather than lifted: this is about which rows land where,
   and the real one drags in half the page. It prints the name so the
   assertions below can count people rather than markup. */
const grouped = new Function("esc", "rowHtml",
  ["QUEUE_ORDER", "QUEUE_HEAD", "LABEL"].map(grabVar).join("\n") + "\n" +
  grab("grouped") + "\nreturn grouped;"
)((s) => String(s === null || s === undefined ? "" : s),
  (a) => "<row>" + a.name + "</row>");

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "FAIL") + "  " + label +
    (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
};

const names = (h) => [...h.matchAll(/<row>(.*?)<\/row>/g)].map((m) => m[1]);
const heads = (h) => [...h.matchAll(/qgrp__h">(.*?)<span/g)].map((m) => m[1]);
const counts = (h) => [...h.matchAll(/qgrp__n">(\d+)</g)].map((m) => Number(m[1]));

/* The four real applicants, at the stages they are actually at tonight. */
const REAL = [
  { name: "bryant", status: "applied" },
  { name: "Samantha", status: "assessment" },
  { name: "Kirze", status: "applied" },
  { name: "Google Login", status: "interview" }
];

/* ── nobody is lost ──────────────────────────────────────────────────────── */
console.log("\n  Everybody appears, exactly once");
{
  const h = grouped(REAL);
  is("all four are drawn", names(h).length, 4);
  is("and each of them once", names(h).sort(),
     ["Google Login", "Kirze", "Samantha", "bryant"]);
}
{
  /* The one that matters. A status nobody thought of must still reach the
     screen — under its own name if need be. */
  const h = grouped(REAL.concat([{ name: "Nobody", status: "on_hold" }]));
  is("an unknown stage still draws its person", names(h).includes("Nobody"), true);
  is("under a heading of its own", heads(h).includes("on_hold"), true);
  is("and nobody else is lost to it", names(h).length, 5);
}
{
  const h = grouped([{ name: "Blank", status: null }]);
  is("a row with no status at all is drawn", names(h), ["Blank"]);
  is("as a new applicant, which is what it is", heads(h), ["New applicants"]);
}

/* ── the stages, in the order of the ladder ──────────────────────────────── */
console.log("\n  In ladder order, not by age");
{
  const h = grouped(REAL);
  is("three stages have somebody in them", heads(h),
     ["New applicants", "Assessment", "Interview"]);
  is("and the counts are right", counts(h), [2, 1, 1]);
  is("applied comes before assessment, which comes before interview",
     names(h), ["bryant", "Kirze", "Samantha", "Google Login"]);
}
{
  /* Order within a stage is left exactly as it arrives — shownRows() has
     already sorted by who has waited longest, and re-sorting here would
     silently throw that away. */
  const h = grouped([
    { name: "second", status: "applied" },
    { name: "first", status: "applied" }
  ]);
  is("the order inside a stage is untouched", names(h), ["second", "first"]);
}
{
  const h = grouped([
    { name: "H", status: "hired" }, { name: "D", status: "declined" },
    { name: "A", status: "approved" }, { name: "N", status: "applied" }
  ]);
  is("the whole ladder reads downward", names(h), ["N", "A", "H", "D"]);
  is("and declined sits last, being no step on the way anywhere",
     heads(h)[heads(h).length - 1], "Declined");
}

/* ── empty stages are not shelves ────────────────────────────────────────── */
console.log("\n  Nothing is drawn for a stage holding nobody");
{
  const h = grouped([{ name: "only", status: "interview" }]);
  is("one heading, not six", heads(h), ["Interview"]);
  is("and it says one", counts(h), [1]);
  is("no empty new-applicants shelf", h.indexOf("New applicants"), -1);
}
{
  is("an empty queue draws nothing at all", grouped([]), "");
}

console.log("");
if (bad) { console.log("  " + bad + " failed"); process.exit(1); }
console.log("  Everybody in, exactly once, in the order of the ladder.");
