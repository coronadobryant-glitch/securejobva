/* What somebody who is not hired yet is told when she opens /hub.

   The gate is one comparison — status === "hired" — and the sentence under it
   used to promise something else: the portal "appears here the day you are
   placed". Being placed with a client is a later day, decided separately, and
   may not have happened yet; the portal opens the moment she is marked Hired.
   An applicant hired on Monday and matched on Friday was told to wait for a
   page that had been open since Monday (F8, 1 Oct).

   This reads the gate out of the built hub.html, so it checks what ships
   rather than the generator's copy of it, and pins the two things that must
   stay true together: the condition is the stage, and the sentence says the
   stage.

   Offline: nothing here touches the network or the database.

   Run: node tools/test-hub-gate.mjs */
import { readFileSync, existsSync } from "node:fs";

let failed = 0;
function ok(what, got, want) {
  const pass = got === want;
  if (!pass) failed++;
  console.log("  " + (pass ? "ok    " : "FAIL  ") + what +
    (pass ? "" : "  got " + JSON.stringify(got) + ", want " + JSON.stringify(want)));
}

const FILE = "hub.html";
if (!existsSync(FILE)) { console.log("  FAIL  " + FILE + " is not built"); process.exit(1); }
const html = readFileSync(FILE, "utf8");

const at = html.indexOf('if (a.status !== "hired")');
ok("the gate is the stage, and only the stage", at > -1, true);
const gate = at > -1 ? html.slice(at, html.indexOf("return;", at)) : "";

console.log("\n  What the gate says");
ok("it is the 'opens when you are hired' screen", gate.indexOf("This opens when you are hired.") > -1, true);
ok("it no longer says 'the day you are placed'", /placed/i.test(gate), false);
ok("it says the portal opens as soon as she is marked Hired", gate.indexOf("as soon as you are marked Hired") > -1, true);
ok("it says a client is not needed first", gate.indexOf("you do not need a client first") > -1, true);
ok("it shows where her application has got to", gate.indexOf("esc(a.status)") > -1, true);
ok("and points to her status page", gate.indexOf('href="/status"') > -1, true);

/* Nowhere else on the page may repeat the old promise either. */
ok("no 'day you are placed' anywhere in hub.html", html.indexOf("day you are placed") > -1, false);

console.log(failed ? "\n  " + failed + " failed" : "\n  all ok");
process.exit(failed ? 1 : 0);
