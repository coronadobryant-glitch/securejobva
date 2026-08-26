/* Pulls countBy() and bars() out of the built admin page and drives them, so
   the geometry is checked rather than assumed. Chart bugs are silent: a bar of
   width NaN just does not paint, and nobody notices until a number is wrong in
   a meeting. */
import { readFileSync } from "node:fs";

const html = readFileSync("admin.html", "utf8");
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

function grab(name) {
  const at = js.indexOf("function " + name + "(");
  if (at < 0) throw new Error("cannot find " + name + "()");
  let depth = 0, i = js.indexOf("{", at);
  const start = at;
  for (; i < js.length; i++) {
    if (js[i] === "{") depth++;
    else if (js[i] === "}") { depth--; if (!depth) return js.slice(start, i + 1); }
  }
  throw new Error("unbalanced " + name);
}

/* bars() calls esc(), which lives elsewhere in the page. Pass it into the
   sandbox rather than dragging the whole script in. */
const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const { countBy, bars } = new Function(
  "esc",
  grab("countBy") + "\n" + grab("bars") + "\nreturn { countBy: countBy, bars: bars };"
)(esc);

let failed = 0;
const ok = (name, cond, note) => {
  console.log((cond ? "  ok    " : "  FAIL  ") + name + (note ? "  — " + note : ""));
  if (!cond) failed++;
};

/* ── countBy ── */
const rows = [
  { pipeline: "new", tracks: ["Customer Service", "Admin Tasks"], skill_english: "fluent" },
  { pipeline: "new", tracks: ["Customer Service"], skill_english: "advanced" },
  { pipeline: "hired", tracks: [], skill_english: null },
  { pipeline: "", tracks: null, skill_english: "" }
];

const pipe = countBy(rows, "pipeline");
ok("countBy counts values", pipe.new === 2 && pipe.hired === 1, JSON.stringify(pipe));
ok("countBy ignores empty", !("" in pipe), "blank pipeline not counted as a category");

const tracks = countBy(rows, "tracks");
ok("countBy flattens arrays", tracks["Customer Service"] === 2 && tracks["Admin Tasks"] === 1,
   JSON.stringify(tracks));
ok("countBy survives null array", !("null" in tracks));

const eng = countBy(rows, "skill_english");
ok("unanswered skill is not a level", !("null" in eng) && !("" in eng),
   "null and empty stay uncounted, so blank never reads as beginner");

/* ── bars: the geometry ── */
const html1 = bars("Pipeline", pipe, ["new", "reviewed", "hired"], { new: "New", hired: "Hired" });
const widths = [...html1.matchAll(/width:([-\d.]+)%/g)].map((m) => Number(m[1]));

ok("every width is a real number", widths.length > 0 && widths.every(Number.isFinite),
   widths.join(", "));
ok("no width exceeds 100%", widths.every((w) => w <= 100), "max " + Math.max(...widths));
ok("no negative width", widths.every((w) => w >= 0));
ok("largest bar is full width", Math.max(...widths) === 100);
ok("zero-count rows are dropped", !/reviewed/.test(html1),
   "a stage nobody is at draws no empty bar");
ok("labels are applied", /New/.test(html1) && /Hired/.test(html1));
ok("counts are direct-labelled", /class="bar__n">2</.test(html1),
   "the number is on the bar, not only in a tooltip");

/* ── the empty case ── */
ok("empty data draws nothing", bars("Nothing", {}, ["a", "b"]) === "",
   "no axis, no title, no empty frame");
ok("single row still renders", /width:100%/.test(bars("One", { a: 1 })));

/* ── escaping: a track name is applicant-supplied text ── */
const nasty = bars("X", { '<img src=x onerror=alert(1)>': 3 });
ok("category names are escaped", !/<img/.test(nasty), "applicant text cannot inject markup");

/* ── divide-by-zero guard ── */
let threw = false;
try { bars("Z", { a: 0, b: 0 }); } catch (e) { threw = true; }
ok("all-zero counts cannot throw", !threw, "filtered out before max() is taken");

console.log("\n" + (failed ? failed + " FAILED" : "all chart checks passed"));
process.exit(failed ? 1 : 0);
