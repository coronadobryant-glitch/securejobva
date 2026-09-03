/* Drives chooseProbe(), which decides whose password-reset token the redirect
   probe is about to spend.

   The probe can only ask the auth server where a link would land by asking it
   to mint one, and a recovery token is single use: minting a new one voids the
   one already sitting in somebody's inbox. It used to take the first account
   the API returned — the same person every run — so the check that exists to
   prove password reset works was quietly breaking password reset. Somebody
   asked for a reset, got a real email, clicked it, and was told it had expired.

   The ordering is the safety property. Oldest link first, and never-had-one is
   oldest of all, which puts whoever just asked for a reset — newest timestamp —
   last in the queue by construction rather than by a special case.

   The declining branch is the one that matters and the one that will never
   happen on the machine where it was written, which is why the chooser is pure
   and tested here rather than trusted in place.

   Run: node tools/test-probe-choice.mjs */
import { readFileSync } from "node:fs";

/* Lifted out of the file rather than imported. status.mjs is a script: it
   probes the live project the moment it is loaded, so importing it to test one
   pure function would spend a real token every run — the bug this function
   exists to prevent, committed by its own test. */
const src = readFileSync("tools/status.mjs", "utf8");
const at0 = src.indexOf("export function chooseProbe(");
if (at0 < 0) throw new Error("no chooseProbe() in tools/status.mjs — renamed? this reads it by name");
let depth = 0, end = at0;
for (let i = src.indexOf("{", at0); i < src.length; i++) {
  if (src[i] === "{") depth++;
  else if (src[i] === "}") { depth--; if (!depth) { end = i; break; } }
}
const chooseProbe = new Function(
  src.slice(at0, end + 1).replace("export function", "function") +
  "; return chooseProbe;")();

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "FAIL") + "  " + label +
    (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
};

const NOW = Date.parse("2026-09-03T21:00:00Z");
const HOUR = 60 * 60 * 1000;
const at = (mins) => new Date(NOW - mins * 60000).toISOString();

/* An account that has never had a reset link has nothing to lose. */
is("never-sent is preferred over any timestamp",
  chooseProbe([
    { email: "old@x.com", recovery_sent_at: at(60 * 24 * 30) },
    { email: "fresh@x.com", recovery_sent_at: null },
  ], NOW, HOUR),
  { email: "fresh@x.com", held: null });

/* The person who just asked for a reset is the newest, so they are last. */
is("the person mid-reset is never the one picked",
  chooseProbe([
    { email: "justasked@x.com", recovery_sent_at: at(1) },
    { email: "ages@x.com", recovery_sent_at: at(60 * 24 * 7) },
  ], NOW, HOUR),
  { email: "ages@x.com", held: null });

is("oldest link goes first when everybody has one",
  chooseProbe([
    { email: "b@x.com", recovery_sent_at: at(200) },
    { email: "a@x.com", recovery_sent_at: at(900) },
    { email: "c@x.com", recovery_sent_at: at(70) },
  ], NOW, HOUR),
  { email: "a@x.com", held: null });

/* Everything in existence is live. There is nothing safe to spend, so it
   declines and names who it would have taken. */
is("every link live means it declines rather than breaks one",
  chooseProbe([
    { email: "a@x.com", recovery_sent_at: at(30) },
    { email: "b@x.com", recovery_sent_at: at(10) },
  ], NOW, HOUR),
  { email: null, held: "a@x.com" });

/* The boundary: exactly at the window is no longer live. */
is("a link exactly one hour old is spendable",
  chooseProbe([{ email: "a@x.com", recovery_sent_at: at(60) }], NOW, HOUR),
  { email: "a@x.com", held: null });
is("a link a minute inside the window is not",
  chooseProbe([{ email: "a@x.com", recovery_sent_at: at(59) }], NOW, HOUR),
  { email: null, held: "a@x.com" });

/* Nothing to probe with at all. */
is("no accounts, no probe", chooseProbe([], NOW, HOUR), { email: null, held: null });
is("undefined is not a crash", chooseProbe(undefined, NOW, HOUR), { email: null, held: null });
is("an account with no address is skipped",
  chooseProbe([{ recovery_sent_at: null }, { email: "a@x.com", recovery_sent_at: at(900) }], NOW, HOUR),
  { email: "a@x.com", held: null });

console.log("");
if (bad) { console.log(bad + " failed"); process.exit(1); }
console.log("9 behaviours, whose token gets spent and when none may be");
