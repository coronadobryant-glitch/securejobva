/* Pulls deployVerdict() out of status.mjs and drives all four of its answers.
 *
 * This is the line that says whether production is running what you committed.
 * On any given day only one of its branches can happen, and the one that
 * matters — production is behind — is the one you would otherwise first see on
 * the day it was true and you needed it to be right. On 26 August that day
 * came and the answer was nine hours late.
 *
 * It replaced a check that looked for one hardcoded string,
 * "Math.round(h * CFG.rate)", which answers whether that August fix is live
 * and, once it is, answers yes forever — a build six months stale passed it as
 * happily as one from this morning. build.mjs now stamps the commit into every
 * page and this compares it with HEAD.
 *
 * Lifted by source text rather than imported, because status.mjs talks to the
 * network the moment it loads. test-paying-status.mjs does the same, and
 * test-billing.mjs does it to /seats.
 *
 * Nothing here touches the network, git or the database. */
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

const deployVerdict = new Function(grab("deployVerdict") + "\nreturn deployVerdict;")();

let failed = 0;
function ok(what, got, want, note) {
  const pass = got === want;
  if (!pass) failed++;
  console.log("  " + (pass ? "ok    " : "FAIL  ") + what +
    (pass ? (note ? "  — " + note : "") : "  got " + JSON.stringify(got) + ", want " + JSON.stringify(want)));
}

const SEEN = ", edge copy 12s old";

/* ── the page carries no stamp ───────────────────────────────────────────── */

console.log("\n  A live page built before stamping existed");

const none = deployVerdict(null, null, "2598c80", null, SEEN);
ok("warns rather than failing", none.state, "warn",
  "nobody can act on this except by deploying — a fail here cries wolf");
ok("and says what to do", none.note.includes("deploy once to start stamping"), true);
ok("the edge age still rides along", none.note.includes("edge copy 12s old"), true);

/* ── shipped is what is here ─────────────────────────────────────────────── */

console.log("\n  Production matches HEAD");

const same = deployVerdict("2598c80", "2026-09-11T16:48:37Z", "2598c80", null, SEEN);
ok("passes", same.state, "ok");
ok("naming the commit, not a slogan", same.note,
  "2598c80, built 2026-09-11T16:48:37Z, edge copy 12s old",
  "the old line said \"the weekly fix is live\" whatever was actually deployed");

/* ── production is behind ────────────────────────────────────────────────── */

console.log("\n  Production is behind");

const old = deployVerdict("046d7df", "2026-09-11T15:10:00Z", "2598c80", "3", SEEN);
ok("fails", old.state, "fail", "this is the whole reason the line exists");
ok("says both commits and the distance", old.note,
  "live is 046d7df, local is 2598c80 — 3 commit(s) behind, deploy" + SEEN);

/* ── behind by a commit this clone has never seen ────────────────────────── */

console.log("\n  Deployed from a commit this clone does not have");

const alien = deployVerdict("deadbee", "2026-09-01T00:00:00Z", "2598c80", null, SEEN);
ok("still fails", alien.state, "fail");
ok("and says why it cannot count", alien.note.includes("not a commit this clone has"), true,
  "a deploy from another branch, or one never fetched here — silence would read as zero");
ok("without claiming a distance", alien.note.includes("commit(s) behind"), false);

/* ── the stamp is only ever read, never trusted to be shaped right ───────── */

console.log("\n  A stamp that is present but odd");

const weird = deployVerdict("2598c80", undefined, "2598c80", null, "");
ok("a missing build time does not throw", weird.state, "ok");
ok("it just reads as undefined rather than crashing the run",
  weird.note, "2598c80, built undefined",
  "status.mjs must finish its other forty checks even if this one is malformed");

console.log("\n" + (failed ? "  " + failed + " FAILED" : "  the deploy verdict reads right"));
process.exit(failed ? 1 : 0);
