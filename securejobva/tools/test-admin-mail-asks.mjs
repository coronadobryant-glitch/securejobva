/* What /admin promises about email, against what the database will send.
   Offline: reads admin.html and the sql/ folder, sends nothing anywhere.

   Every case here is the same mistake: a question or a message on /admin that
   says an email will (or will not) go, and a trigger in sql/ that decides
   otherwise. The reviewers of the 1 Oct fixes found six of them:

     sitSaveMayMove   the assessment save asked only on the first wpm figure,
                      and 097 moves her (and mails her) in three more cases
     seatStageMails   reopening a closed seat request was called a step back,
                      and 103 mails it; a request with no address was promised
                      an email 103 never sends
     OUTBOX_SOURCE    the "Emails that did not go" card showed raw function
                      names for every sender added since 095
     the reason box   on a booked interview said "for the notes", and 100 kept
                      it nowhere; 100 now quotes it to both people, so the
                      box has to say so
     a swap handled   said "the client has been emailed" when 107 had no
                      address to write to
     an emptied rate  returned before the redraw, so the stage just saved was
                      not in PLACEMENTS and the next save asked again

   Run: node tools/test-admin-mail-asks.mjs */
import { readFileSync, readdirSync } from "node:fs";

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

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "FAIL") + "  " + label +
    (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
};

/* ── the assessment save (097) ───────────────────────────────────────────── */
console.log("\n  Saving the assessment panel");
const mayMove = new Function(grab("sitSaveMayMove") + "; return sitSaveMayMove;")();
const her = (status, sit) => ({ id: "a1", name: "Ana", status: status, sit: Object.assign({
  verdict: "passed", typing_verified_wpm: null, typing_verified_accuracy: null, written_score: null
}, sit) });
const body = (wpm, acc, ws) => ({ typing_verified_wpm: wpm, typing_verified_accuracy: acc, written_score: ws });

is("the first checked wpm on a pass asks",
   mayMove(her("assessment"), body(52, null, null)), true);
is("(a) only the checked accuracy asks too -- 097 counts either figure",
   mayMove(her("assessment"), body(null, 97, null)), true);
is("(b) typing already checked, below the line, a written mark asks -- 063 can lift it to a pass",
   mayMove(her("assessment", { verdict: "below_line", typing_verified_wpm: 40, typing_verified_accuracy: 95 }),
     body(40, 95, 8)), true);
is("(c) checked figures replacing claimed ones before any pass asks",
   mayMove(her("assessment", { verdict: "below_line" }), body(55, 98, null)), true);
is("a correction to figures already checked asks -- it re-scores",
   mayMove(her("assessment", { typing_verified_wpm: 50 }), body(48, null, null)), true);
is("a save that changes nothing does not ask",
   mayMove(her("assessment", { typing_verified_wpm: 50, written_score: 7 }), body(50, null, 7)), false);
is("figures stored as strings compare as numbers",
   mayMove(her("assessment", { typing_verified_wpm: "50" }), body(50, null, null)), false);
is("a written mark with no checked typing at all does not ask -- 097 needs a checked figure",
   mayMove(her("assessment"), body(null, null, 8)), false);
is("she is not at Assessment: nothing moves, nothing asks",
   mayMove(her("interview"), body(52, null, null)), false);
is("no assessment row: nothing asks",
   mayMove({ id: "a1", status: "assessment", sit: null }, body(52, null, null)), false);
is("the question says 'if this leaves her passing', not that she passes",
   js.indexOf("If this leaves her passing, it moves") > -1, true);
is("the old first-wpm-only test is gone",
   js.indexOf('s0.verdict === "passed" &&') > -1, false);

/* ── the seat request stage (103) ────────────────────────────────────────── */
console.log("\n  Moving a seat request");
const seatMails = new Function(grab("seatStageMails") + "; return seatStageMails;")();
const addr = "boss@example.com";
is("forward into Matching mails", seatMails("matching", "call_booked", addr), true);
is("backward to Call booked is quiet", seatMails("call_booked", "shortlist", addr), false);
is("to Received is quiet", seatMails("received", "matching", addr), false);
is("to Closed mails", seatMails("closed", "running", addr), true);
is("reopened from Closed mails -- 103 has no Closed on its list", seatMails("call_booked", "closed", addr), true);
is("reopened from Closed to Received is still quiet", seatMails("received", "closed", addr), false);
is("no address: 103 returns early, so no email is promised", seatMails("closed", "running", ""), false);
is("a blank address is no address", seatMails("matching", "received", "   "), false);
is("no move is no email", seatMails("closed", "closed", addr), false);

/* ── the outbox labels ───────────────────────────────────────────────────── */
console.log("\n  Emails that did not go");
const labels = new Function(js.match(/var OUTBOX_SOURCE = \{[\s\S]*?\n\};/)[0] + "; return OUTBOX_SOURCE;")();
const sources = new Set();
for (const f of readdirSync("sql").filter((x) => x.endsWith(".sql") && !x.includes(".local"))) {
  const s = readFileSync("sql/" + f, "utf8");
  const re = /perform\s+public\.notify_send\(/g;
  let m;
  while ((m = re.exec(s))) {
    let d = 1, i = m.index + m[0].length;
    const st = i;
    for (; i < s.length && d; i++) { if (s[i] === "(") d++; else if (s[i] === ")") d--; }
    const last = s.slice(st, i - 1).trim().match(/'([a-z_]+)'\s*$/);
    if (last) sources.add(last[1]);
  }
  for (const t of s.matchAll(/after insert on public\.(\w+)\s+for each row execute function public\.notify_form\(\)/g)) {
    sources.add("notify-" + t[1]);
  }
  for (const c of s.matchAll(/post_client_invite\(\w+,\s*'([a-z_]+)'\)/g)) sources.add(c[1]);
}
const missing = [...sources].filter((k) => !labels[k]);
is("every source a migration hands notify_send has a plain label (" + sources.size + " found)", missing, []);

/* ── the booked interview's reason box (100) ─────────────────────────────── */
console.log("\n  A booked interview");
const s100 = readFileSync("sql/100-a-confirmed-placement-interview-can-move.sql", "utf8");
const carried = /post_interview_note_with_reason\([\s\S]*?\bwhy\)/.test(s100) &&
  /set_config\('sjva\.interview_reason'/.test(s100);
is("100 carries the reason into both emails (move and cancel)", carried, true);
is("so the box no longer says it is for the notes",
   html.indexOf("for the notes, not for them") > -1, false);
is("it says who will read it",
   html.indexOf("quoted to both of them in the email") > -1, carried);
is("and what is typed is what is sent",
   /rpc\/cancel_placement_interview", \{\s*method: "POST", body: \{ slot: slot, why: reason \}/.test(js) &&
   js.indexOf('var whyEl = row.querySelector("[data-piv-why]");') > -1, true);

/* ── a swap marked handled (107) ─────────────────────────────────────────── */
console.log("\n  A swap marked handled");
const hasAddr = (clients) => new Function("CLIENTS",
  grab("priv") + "; " + grab("clientHasAddress") + "; return clientHasAddress;")(clients);
is("a client with a contact address can be told",
   hasAddr([{ id: "c1", client_private: { contact_email: "a@b.co" } }])("c1"), true);
is("a client with none cannot",
   hasAddr([{ id: "c1", client_private: { contact_email: " " } }])("c1"), false);
is("nor one this page has not loaded",
   hasAddr([])("c1"), false);
is("the no-address case says nobody was emailed",
   js.indexOf("they have no contact address, so nobody was emailed. Tell them yourself.") > -1, true);
is("and its button does not say it will tell them",
   js.indexOf('"Mark it handled"') > -1, true);

/* ── an emptied rate box ─────────────────────────────────────────────────── */
console.log("\n  An emptied rate box");
is("still redraws, so the stage this save wrote is the one the next save reads",
   js.indexOf('loadPlacements("Rates can be changed, not cleared", null, id, true)') > -1, true);
is("and the old early return is gone",
   js.indexOf('if (emptied) { flash(ok, "Rates can be changed, not cleared", true); return; }') > -1, false);

console.log("");
if (bad) { console.log("  " + bad + " failed"); process.exit(1); }
console.log("  Every email /admin promises is one the database sends, and none it leaves out.");
