/* Pulls payingLines() out of status.mjs and drives it.
 *
 * That section exists because a fake business called "Northwind Test Co" sat
 * on the paying half for four days in September 2026 and nothing routinely
 * looked. The fix was to print the name of every business being billed. The
 * trouble with testing the fix is that the half is empty again, so against the
 * real database it renders one line — "nobody is being billed yet" — and the
 * branch that would actually have caught Northwind never runs at all.
 *
 * So it runs here instead, against rows shaped like the ones that were really
 * there: the same $306.13, the same ongoing placement, the same trial week and
 * chargeable week. Plus the cases Northwind did not cover and a real customer
 * will — a business with two assistants, one of whom has finished; a business
 * that has paid twice; a business with nothing against it yet.
 *
 * Lifted out by source text rather than imported, because status.mjs is a
 * script that talks to the network the moment it loads. test-billing.mjs takes
 * billingBlock() out of /seats the same way and for the same reason.
 *
 * Nothing here touches the network or the database. */
import { readFileSync } from "node:fs";

const src = readFileSync("tools/status.mjs", "utf8");

function grab(name) {
  const at = src.indexOf("function " + name + "(");
  if (at < 0) throw new Error("cannot find " + name + "() in status.mjs");
  let depth = 0, i = src.indexOf("{", at);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (!depth) return src.slice(at, i + 1); }
  }
  throw new Error("unbalanced " + name);
}

const payingLines = new Function(grab("payingLines") + "\nreturn payingLines;")();

let failed = 0;
function ok(what, got, want, note) {
  const pass = got === want;
  if (!pass) failed++;
  console.log("  " + (pass ? "ok    " : "FAIL  ") + what +
    (pass ? (note ? "  — " + note : "") : "  got " + JSON.stringify(got) + ", want " + JSON.stringify(want)));
}

/* The note off a named business, so a failure says which line was wrong. */
const noteFor = (rows, what) => {
  const r = rows.find((x) => x.what === what);
  return r ? r.note : "(no line for " + what + ")";
};

/* ── nothing there at all ────────────────────────────────────────────────── */

console.log("\n  An empty paying half");

const empty = payingLines([], [], [], []);
ok("says so in one line", empty.length, 1);
ok("and does not call it a fault", empty[0].state, "ok",
  "no customer yet is where this business currently is, not a failure");
ok("in words, not counts", empty[0].what, "nobody is being billed yet");

/* ── the read failed ─────────────────────────────────────────────────────── */

console.log("\n  When the half cannot be read");

const blind = payingLines(null, null, null, null);
ok("warns rather than claiming empty", blind[0].state, "warn",
  "silence and nothing there must never look the same");
ok("and says which", blind[0].note, "the paying half could not be read");

/* ── Northwind, as it actually was ───────────────────────────────────────── */

console.log("\n  The rows that were really there, 7–11 September");

const nw = payingLines(
  [{ id: "c1", name: "Northwind Test Co" }],
  [{ id: "p1", client_id: "c1", status: "ongoing" }],
  [{ id: "w1", status: "approved" }, { id: "w2", status: "approved" }],
  [{ id: "y1", client_id: "c1", amount_cents: 30613 }]
);
ok("the name is on screen", nw[0].what, "Northwind Test Co",
  "the whole point — \"clients 1\" reads as progress, this does not");
ok("with what is against it", nw[0].note, "1 live placement(s), $306.13 recorded paid");
ok("and it still does not fail", nw[0].state, "ok",
  "a paying client is the point of the business");

/* ── the cases a real customer brings ────────────────────────────────────── */

console.log("\n  What a real customer looks like");

const real = payingLines(
  [{ id: "c1", name: "Two Assistants Ltd" },
   { id: "c2", name: "Paid In Parts Co" },
   { id: "c3", name: "Signed But Not Started" }],
  [{ id: "p1", client_id: "c1", status: "ongoing" },
   { id: "p2", client_id: "c1", status: "trial" },
   { id: "p3", client_id: "c1", status: "ended" },
   { id: "p4", client_id: "c2", status: "ongoing" }],
  [{ id: "w1", status: "approved" }, { id: "w2", status: "sent" },
   { id: "w3", status: "draft" }],
  [{ id: "y1", client_id: "c2", amount_cents: 12000 },
   { id: "y2", client_id: "c2", amount_cents: 50 }]
);

ok("two live, one finished", noteFor(real, "Two Assistants Ltd"),
  "2 live placement(s), $0.00 recorded paid",
  "an ended placement is history — a business that finished with somebody is not still placed");
ok("two payments are summed", noteFor(real, "Paid In Parts Co"),
  "1 live placement(s), $120.50 recorded paid",
  "showing only the last one would understate what came in");
ok("nothing yet reads as nothing", noteFor(real, "Signed But Not Started"),
  "0 live placement(s), $0.00 recorded paid");
ok("every business gets a line", real.filter((r) => r.state === "ok").length, 4,
  "three businesses and the weeks line");
ok("weeks are counted and graded", noteFor(real, "weeks"), "3 total, 1 approved",
  "approved is what a client is billed for");

/* ── the half cent ───────────────────────────────────────────────────────── */

console.log("\n  Money that does not divide");

const odd = payingLines(
  [{ id: "c1", name: "Half A Cent Co" }],
  [{ id: "p1", client_id: "c1", status: "ongoing" }],
  [{ id: "w1", status: "approved" }],
  [{ id: "y1", client_id: "c1", amount_cents: 1 },
   { id: "y2", client_id: "c1", amount_cents: 2 }]
);
ok("three cents is $0.03", noteFor(odd, "Half A Cent Co"),
  "1 live placement(s), $0.03 recorded paid",
  "cents are summed as integers and divided once, never a fraction at a time");

console.log("\n" + (failed ? "  " + failed + " FAILED" : "  the paying half reads right"));
process.exit(failed ? 1 : 0);
