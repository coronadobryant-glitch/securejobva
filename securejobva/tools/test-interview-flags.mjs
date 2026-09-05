/* Drives the Interviews tab's "needs attention" panel.

   The tab raises four things nobody would otherwise notice: an interview that
   has been and gone with no score written down, somebody moved to interview
   with no date set, two bookings inside the same hour, and — added today — an
   interview booked for somebody who has not sat the assessment.

   That fourth one exists because the process and the screen disagree on
   purpose. STAGES puts the exams before the interviews and /careers tells
   applicants so, but the interview date sits on every row with no stage gate,
   so a date can be set on somebody still at applied. Blocking it would be
   wrong — pencilling in a time early is a reasonable thing to want — so the
   answer is to say so rather than to refuse.

   The function is lifted out of the built admin.html and run against a fake
   page, so this tests what ships rather than a copy of it. Nothing drove
   drawCalendar before today, which is how it went a fortnight being called
   from exactly two places, one of them the client-logo upload handler.

   Run: node tools/test-interview-flags.mjs */
import { readFileSync } from "node:fs";

const html = readFileSync("admin.html", "utf8");

const from = html.indexOf("function drawCalendar() {");
if (from < 0) throw new Error("no drawCalendar() in admin.html");
/* To the next top-level function, which is where this one ends. */
const to = html.indexOf("\nfunction ", from + 10);
if (to < 0) throw new Error("could not find the end of drawCalendar");
const src = html.slice(from, to);

/* A page with the two elements it reaches for. */
const el = (id) => ({ id, textContent: "", innerHTML: "" });
const box = el("cal-card");
const badge = el("tab-cal");
const document = { getElementById: (id) => (id === "cal-card" ? box : id === "tab-cal" ? badge : null) };
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const HOUR = 3600000;
const soon = (h) => new Date(Date.now() + h * HOUR).toISOString();
const past = (h) => new Date(Date.now() - h * HOUR).toISOString();

/* Runs the shipped function over a given queue and hands back what it drew. */
function draw(ALL) {
  box.innerHTML = "";
  badge.textContent = "";
  new Function("document", "ALL", "esc", "CLIENTS", "IV_STATE", src + "; drawCalendar();")
    (document, ALL, esc, [], []);
  return { html: box.innerHTML, badge: badge.textContent };
}

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log((ok ? "  ok   " : "  FAIL ") + label +
    (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
};
const sat = { submitted_at: "2026-09-01T10:00:00Z", verdict: "passed" };

/* The card draws the flags AND the list of upcoming interviews below them, so
   asking whether a name appears anywhere in it answers the wrong question —
   everybody booked is named in the list. This reads one flag's paragraph. */
function line(html, phrase) {
  const at = html.indexOf(phrase);
  if (at < 0) return "";
  const open = html.lastIndexOf("<p class=", at);
  const close = html.indexOf("</p>", at);
  return open < 0 || close < 0 ? "" : html.slice(open, close);
}

console.log("1. An interview booked for somebody who has not sat the assessment");
{
  const r = draw([
    { id: "1", name: "Ana Reyes", email: "a@x.com", interview_at: soon(48), pipeline: "shortlisted", sit: null },
    { id: "2", name: "Ben Cruz", email: "b@x.com", interview_at: soon(72), pipeline: "shortlisted", sit: sat },
  ]);
  is("it is raised", /1 booked before sitting the assessment/.test(r.html), true);
  const l = line(r.html, "booked before sitting the assessment");
  is("the one without an assessment is named", /Ana Reyes/.test(l), true);
  is("the one who has sat it is not", /Ben Cruz/.test(l), false);
  is("and it counts toward the tab badge", r.badge, "1");
}

console.log("\n2. A started-but-never-sent assessment still counts as not sat");
{
  const r = draw([
    { id: "1", name: "Ana Reyes", email: "a@x.com", interview_at: soon(48), pipeline: "shortlisted",
      sit: { submitted_at: null, verdict: "in_progress" } },
  ]);
  is("started is not sat", /1 booked before sitting the assessment/.test(r.html), true);
}

console.log("\n3. An interview already in the past counts too");
{
  const r = draw([
    { id: "1", name: "Ana Reyes", email: "a@x.com", interview_at: past(48), pipeline: "shortlisted", sit: null },
  ]);
  is("a booking that has been and gone is worse, not exempt",
    /1 booked before sitting the assessment/.test(r.html), true);
}

console.log("\n4. Nothing is raised when everybody has sat one");
{
  const r = draw([
    { id: "1", name: "Ana Reyes", email: "a@x.com", interview_at: soon(48), pipeline: "shortlisted", sit: sat },
    { id: "2", name: "Ben Cruz", email: "b@x.com", interview_at: soon(72), pipeline: "shortlisted", sit: sat },
  ]);
  is("no line", /booked before sitting the assessment/.test(r.html), false);
  is("no badge", r.badge, "");
}

console.log("\n5. The three that were already here still work");
{
  const r = draw([
    /* interviewed and never scored */
    { id: "1", name: "Ana Reyes", email: "a@x.com", interview_at: past(48), pipeline: "interviewed", sit: sat },
    /* at interview with no date */
    { id: "2", name: "Ben Cruz", email: "b@x.com", interview_at: null, pipeline: "interviewed", sit: sat },
  ]);
  is("interviewed, not scored", /1 interviewed, not scored/.test(r.html), true);
  is("at interview with nothing arranged", /1 at interview with nothing arranged/.test(r.html), true);
  is("both counted", r.badge, "2");
}
{
  const t = soon(24);
  const r = draw([
    { id: "1", name: "Ana Reyes", email: "a@x.com", interview_at: t, pipeline: "shortlisted", sit: sat },
    { id: "2", name: "Ben Cruz", email: "b@x.com",
      interview_at: new Date(Date.parse(t) + 30 * 60000).toISOString(), pipeline: "shortlisted", sit: sat },
  ]);
  is("two inside an hour", /1 booked within an hour of each other/.test(r.html), true);
  is("and it names both", /Ana Reyes and Ben Cruz/.test(r.html), true);
}

console.log("\n6. All four at once add up");
{
  const t = soon(24);
  const r = draw([
    { id: "1", name: "No Sit", email: "a@x.com", interview_at: t, pipeline: "shortlisted", sit: null },
    { id: "2", name: "Clash Two", email: "b@x.com",
      interview_at: new Date(Date.parse(t) + 30 * 60000).toISOString(), pipeline: "shortlisted", sit: sat },
    { id: "3", name: "Unscored", email: "c@x.com", interview_at: past(48), pipeline: "interviewed", sit: sat },
    { id: "4", name: "No Date", email: "d@x.com", interview_at: null, pipeline: "interviewed", sit: sat },
  ]);
  is("badge counts all four", r.badge, "4");
  is("and each has its own line",
    ["not scored", "nothing arranged", "before sitting the assessment", "within an hour"]
      .every((s) => r.html.indexOf(s) > -1), true);
}

console.log("\n7. The empty state still says what to do");
{
  const r = draw([{ id: "1", name: "Ana", email: "a@x.com", interview_at: null, pipeline: "shortlisted", sit: sat }]);
  is("nothing booked", /Nothing booked/.test(r.html), true);
  is("and no badge", r.badge, "");
}

console.log("\n8. She said none of the times work");
{
  const no = (h) => ({ id: "9", starts_at: soon(h), declined_at: past(1), chosen_at: null, confirmed_at: null });
  const r = draw([
    { id: "1", name: "Ana Reyes", email: "a@x.com", interview_at: null, pipeline: "shortlisted",
      sit: sat, slots: [no(48), no(72)] },
  ]);
  is("it is raised", /1 said none of the times work/.test(r.html), true);
  is("and she is named", /Ana Reyes/.test(line(r.html, "said none of the times work")), true);
  is("and it counts", r.badge, "1");
}
{
  /* One still open is not a refusal — she simply has not answered yet. */
  const r = draw([
    { id: "1", name: "Ana Reyes", email: "a@x.com", interview_at: null, pipeline: "shortlisted",
      sit: sat, slots: [
        { id: "9", starts_at: soon(48), declined_at: past(1) },
        { id: "8", starts_at: soon(72), declined_at: null },
      ] },
  ]);
  is("one still open is not a refusal", /said none of the times work/.test(r.html), false);
}
{
  /* And a confirmed interview ends the question however the rest are marked. */
  const r = draw([
    { id: "1", name: "Ana Reyes", email: "a@x.com", interview_at: soon(48), pipeline: "shortlisted",
      sit: sat, slots: [
        { id: "9", starts_at: soon(48), chosen_at: past(2), confirmed_at: past(1) },
        { id: "8", starts_at: soon(72), declined_at: past(3) },
      ] },
  ]);
  is("a confirmed interview settles it", /said none of the times work/.test(r.html), false);
}

console.log("\n" + (bad ? bad + " FAILED" : "all ok"));
process.exit(bad ? 1 : 0);
