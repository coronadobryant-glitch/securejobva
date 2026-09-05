/* Sits the typing part the way an applicant does, now that it is taken
   somewhere else and sent back as a picture.

   This file used to type. The passage was in the page, the browser measured
   it, and the only way to tell a measurement from a number was to feed
   characters in one at a time at a chosen speed and require the words a minute
   that came back to be the speed they went in at. That test was right for that
   arrangement and there is nothing left of it to run: TYPE_TEXT and
   typingAccuracy went with the in-page test.

   What replaces it is a different risk. Nothing here is measured any more, so
   there is no arithmetic to get wrong — the part is a form, and the way a form
   fails is by accepting something it should refuse or by doing its two jobs in
   the wrong order. Both of those are what this drives:

     - every refusal, because a number outside its range or a missing
       screenshot reaching the row is the whole reason 048 exists;

     - and the order, which is the one that leaves a mess. The upload has to
       happen before the row is written. A row naming a file that never arrived
       points at nothing; a file with no row yet is just a file. The apply form
       learned this the other way round and left the bucket holding a CV that
       nothing pointed at, invisible to her and to whoever was deciding on her.

   The real wiring is lifted out of the built status.html, so this tests what
   ships rather than a copy of it.

   Run: node tools/test-typing.mjs */
import { readFileSync } from "node:fs";

const html = readFileSync("status.html", "utf8");

function slice(from, to, what) {
  const a = html.indexOf(from);
  if (a < 0) throw new Error("no " + what + " (start) in status.html");
  const b = html.indexOf(to, a);
  if (b < 0) throw new Error("no " + what + " (end) in status.html");
  return html.slice(a, b);
}

/* The whole body of typingPart, from its first line rather than from the first
   element it reaches for. Slicing at the elements looked tidier and cut the
   function above its own variables — appId, shot and shotPath are declared at
   the top, so the lifted half called sendShot() against an appId that was not
   in scope and threw instead of failing. The written walk was cut in the same
   place for the same reason on the same day.

   Starting at the top costs one stub — partShell, which renders the card — and
   buys the card render being exercised too. The tail is trimmed at the last
   brace, so the body runs as one block. */
const wiring = (() => {
  const s = slice("var appId = (SIT && SIT.application_id)",
                  "function writtenPart(", "typingPart wiring");
  return s.slice(0, s.lastIndexOf("}"));
})();

console.log("wiring:  " + wiring.split("\n").length + " lines lifted from status.html\n");

const el = (id) => ({
  id, value: "", textContent: "", style: {}, disabled: false, focused: false,
  files: null, h: {},
  addEventListener(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); },
  fire(ev, e) { (this.h[ev] || []).forEach((fn) => fn(e || { preventDefault() {} })); },
  focus() { this.focused = true; },
});

const APP = "090f4d2c-0f6b-4218-b4f1-874e113e2edf";
const LINK = "https://www.speedtest.net/result/c/9f3a-not-real";
const SHOT = { name: "typing-result.png", type: "image/png", size: 412000 };

/* A fresh page for each scenario, and a log of everything that left it in the
   order it left. The order is the assertion in half these tests, so it is
   recorded rather than inferred. */
let file, shotMsg, wpm, acc, conn, err, done, sent, closed, sit, drawn;
function fresh(row, opts) {
  opts = opts || {};
  const ids = ["a-shot", "a-shot-s", "a-wpm", "a-acc", "a-conn", "a-err", "a-done"];
  const els = {};
  ids.forEach((id) => { els[id] = el(id); });
  [file, shotMsg, wpm, acc, conn, err, done] = ids.map((i) => els[i]);
  sent = [];
  closed = null;
  sit = row || { application_id: APP };

  const document = { getElementById: (id) => els[id] || null };

  const fetch = (url, init) => {
    sent.push({ what: "upload", url: String(url), method: init && init.method });
    return Promise.resolve(opts.uploadFails ? { ok: false } : { ok: true });
  };
  const liveSession = () => (opts.signedOut
    ? Promise.resolve(null)
    : Promise.resolve({ access_token: "t" }));
  const api = (path, init) => {
    sent.push({ what: "record", url: path, body: init && init.body });
    return Promise.resolve(null);
  };
  const closePart = (patch, part) => {
    sent.push({ what: "close" });
    closed = { patch, part };
    return Promise.resolve();
  };

  /* The card itself is not under test here, but what it was handed is worth
     keeping: it is the only place the file input's accept list and the two
     number boxes actually appear. */
  drawn = "";
  const partShell = (title, ends, inner) => { drawn = inner; };

  new Function("document", "SIT", "fetch", "liveSession", "api", "closePart",
               "storageBase", "ANON", "kb", "esc", "partShell", "TYPE_SITE", wiring)
    (document, sit, fetch, liveSession, api, closePart,
     () => "https://x.supabase.co/storage/v1", "anon-key",
     (n) => Math.round(n / 1024) + " KB", (s) => String(s),
     partShell, "https://www.typingtest.com/");
}

const attach = (f) => { file.files = [f || SHOT]; file.fire("change"); };
const fill = (w, a, c) => {
  wpm.value = w === undefined ? "41" : w;
  acc.value = a === undefined ? "98" : a;
  conn.value = c === undefined ? LINK : c;
};
const press = () => done.fire("click");
const settle = () => new Promise((r) => setTimeout(r, 0));

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log((ok ? "  ok   " : "  FAIL ") + label +
    (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
};
const says = (label, frag) => {
  const ok = err.textContent.indexOf(frag) > -1;
  if (!ok) bad++;
  console.log((ok ? "  ok   " : "  FAIL ") + label +
    (ok ? "" : "\n         said " + JSON.stringify(err.textContent)));
};

/* ── what it refuses, and before spending anything ─────────────────────── */
console.log("1. What it will not send");

fresh(); fill("", "98", LINK); attach(); press();
is("no words a minute is refused", closed, null);
says("and says which number is missing", "words a minute");
is("and nothing was uploaded on the way to finding out", sent.length, 0);
is("and the cursor is put on it", wpm.focused, true);

fresh(); fill("251", "98", LINK); attach(); press();
is("a wpm nobody can type is refused", closed, null);
is("and still nothing uploaded", sent.length, 0);

fresh(); fill("41", "", LINK); attach(); press();
is("no accuracy is refused", closed, null);
says("and says so", "accuracy");

fresh(); fill("41", "120", LINK); attach(); press();
is("an accuracy over 100 is refused", closed, null);

fresh(); fill(); press();
is("no screenshot is refused", closed, null);
says("and says what it is for", "check the numbers against");
is("and nothing was uploaded", sent.length, 0);

fresh(); fill("41", "98", "typingtest.com"); attach(); press();
is("a speed test that is not a link is refused", closed, null);
says("and names the site that gives you one", "speedtest.net");

fresh(); fill("41", "98", "https://x.example/" + "y".repeat(500)); attach(); press();
is("a speed test link over the column limit is refused", closed, null);

/* ── the order, which is the one that leaves a mess ─────────────────────── */
console.log("\n2. The upload happens before the row is written");

fresh(); fill(); attach();
press();
await settle();
is("all three happened", sent.map((s) => s.what), ["upload", "record", "close"]);
is("the file went to her own folder in applicant-docs",
   sent[0].url.indexOf("/object/applicant-docs/" + APP + "/") > -1, true);
is("and was posted, not upserted", sent[0].method, "POST");
is("the record names the same path",
   sent[1].body.path.indexOf("applicant-docs/" + APP + "/") === 0, true);
is("and belongs to her application", sent[1].body.application_id, APP);
is("and keeps the name she chose", sent[1].body.filename, SHOT.name);

console.log("\n3. What lands on the row");
is("the part closed is the typing one", closed.part, "typing");
is("her claimed speed", closed.patch.typing_wpm, 41);
is("her claimed accuracy", closed.patch.typing_accuracy, 98);
is("the speed test link", closed.patch.connection_proof, LINK);
is("and the proof is where the screenshot went",
   closed.patch.typing_proof, sent[1].body.path);
is("which is a storage path, not a link — /admin signs it",
   closed.patch.typing_proof.indexOf("http"), -1);
is("the numbers are numbers, not the strings off the inputs",
   [typeof closed.patch.typing_wpm, typeof closed.patch.typing_accuracy],
   ["number", "number"]);

/* ── a failed upload must not write a row pointing at nothing ───────────── */
console.log("\n4. When the screenshot does not arrive");

fresh(null, { uploadFails: true }); fill(); attach();
press();
await settle();
is("the row is not written", closed, null);
is("and nothing was recorded either", sent.map((s) => s.what), ["upload"]);
says("and she is told to try again", "did not send");
is("and the button comes back", done.disabled, false);
is("with its label", done.textContent, "Save this part");

fresh(null, { signedOut: true }); fill(); attach();
press();
await settle();
is("being signed out writes no row", closed, null);
says("and says that rather than blaming the connection", "signed out");

/* ── coming back to a part she has already attached one to ──────────────── */
console.log("\n5. When a screenshot is already on the row");

fresh({ application_id: APP, typing_proof: "applicant-docs/" + APP + "/typing-1.png",
        typing_wpm: 41, typing_accuracy: 98, connection_proof: LINK });
fill();
press();
await settle();
is("she is not made to attach it twice", closed && closed.part, "typing");
is("nothing was uploaded", sent.map((s) => s.what), ["close"]);
is("and the proof already on the row is kept",
   closed.patch.typing_proof, "applicant-docs/" + APP + "/typing-1.png");

fresh({ application_id: APP, typing_proof: "applicant-docs/" + APP + "/typing-1.png" });
fill(); attach();
press();
await settle();
is("choosing another one replaces it", sent[0].what, "upload");
is("and the row gets the new path",
   closed.patch.typing_proof !== "applicant-docs/" + APP + "/typing-1.png", true);

/* ── the file she picked, before she sends it ───────────────────────────── */
console.log("\n6. What the page says about the file");

fresh(); attach();
is("it names the file", shotMsg.textContent.indexOf(SHOT.name) > -1, true);
is("and its size", shotMsg.textContent.indexOf("KB") > -1, true);
is("and is honest that it has not gone yet",
   shotMsg.textContent.indexOf("not sent yet") > -1, true);

/* ── the card she is handed ─────────────────────────────────────────────── */
console.log("\n7. What the part asks for");

fresh();
is("only images, because the bucket only takes those",
   drawn.indexOf('accept="image/png,image/jpeg"') > -1, true);
is("it sends her to typingtest.com", drawn.indexOf("typingtest.com") > -1, true);
is("in a new tab, safely", drawn.indexOf('rel="noopener noreferrer"') > -1, true);
is("and asks for both numbers off the result",
   drawn.indexOf('id="a-wpm"') > -1 && drawn.indexOf('id="a-acc"') > -1, true);
is("the speed test link is still asked for", drawn.indexOf("speedtest.net") > -1, true);
is("and nothing is left of the passage she used to type",
   drawn.indexOf('id="a-type"'), -1);

fresh({ application_id: APP, typing_wpm: 41, typing_accuracy: 98 });
is("numbers she already gave are put back", drawn.indexOf('value="41"') > -1, true);

console.log("");
if (bad) { console.log(bad + " failed"); process.exit(1); }
console.log("The part refuses what it should, uploads before it writes, " +
  "and never leaves a row pointing at a file that is not there.");
