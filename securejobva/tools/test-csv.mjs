/* Drives csvCell() out of the built admin page.

   A CSV export is the one place applicant-typed text leaves this system and
   gets opened by a staff member in a program that executes formulas. Both
   things below are real: a stray quote or comma silently shifts every column
   after it, and a leading = is code Excel runs. Neither shows up as an error. */
import { readFileSync } from "node:fs";

const html = readFileSync("admin.html", "utf8");
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

const at = js.indexOf("function csvCell(");
if (at < 0) throw new Error("csvCell() not found in admin.html");
let depth = 0, i = js.indexOf("{", at), end = -1;
for (; i < js.length; i++) {
  if (js[i] === "{") depth++;
  else if (js[i] === "}") { depth--; if (!depth) { end = i + 1; break; } }
}
const csvCell = new Function(js.slice(at, end) + "\nreturn csvCell;")();

let failed = 0;
const is = (name, got, want) => {
  const ok = got === want;
  console.log((ok ? "  ok    " : "  FAIL  ") + name +
    (ok ? "" : "\n          got  " + JSON.stringify(got) +
               "\n          want " + JSON.stringify(want)));
  if (!ok) failed++;
};

/* ── quoting ── */
is("plain text is quoted", csvCell("Maria"), '"Maria"');
is("a comma cannot split the row", csvCell("Ramos, Maria"), '"Ramos, Maria"');
is("a quote is doubled", csvCell('She said "yes"'), '"She said ""yes"""');
is("a newline stays inside the field", csvCell("line one\nline two"), '"line one\nline two"');
is("an array becomes one cell", csvCell(["Customer Service", "Admin"]), '"Customer Service; Admin"');
is("null is empty, not the word null", csvCell(null), "");
is("undefined is empty", csvCell(undefined), "");
is("zero survives", csvCell(0), '"0"');

/* ── formula injection: the part that matters ── */
for (const lead of ["=", "+", "-", "@"]) {
  const got = csvCell(lead + "HYPERLINK(\"http://x\",\"click\")");
  const neutralised = got.startsWith('"\'' + lead);
  console.log((neutralised ? "  ok    " : "  FAIL  ") +
    "leading " + lead + " is neutralised" + (neutralised ? "" : "  got " + got));
  if (!neutralised) failed++;
}
is("a tab lead is neutralised", csvCell("\tcmd").slice(0, 3), '"\'\t'.slice(0, 3));
is("an inner = is left alone", csvCell("total = 5"), '"total = 5"');
is("a minus inside a number is left alone", csvCell("1-2"), '"1-2"');

/* the guard must not break ordinary negative numbers into nonsense —
   it prefixes them, which is correct and still reads as -5 in the cell */
is("a negative number is prefixed, not mangled", csvCell("-5"), '"\'-5"');

console.log("\n" + (failed ? failed + " FAILED" : "all CSV checks passed"));
process.exit(failed ? 1 : 0);
