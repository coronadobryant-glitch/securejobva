/* Drives api/notify.js without Supabase, Resend, or a deploy.

   The alternative is finding out whether it works by submitting a real
   application and waiting, which is a slow way to learn you spelled a header
   wrong. Everything here is faked except the handler itself.

   Run: node tools/test-notify.mjs
*/
import handler from "../api/notify.js";

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}  got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

/* A stand-in for Vercel's res, capturing what the handler decided. */
function mockRes() {
  const out = { code: 0, body: null };
  out.status = (c) => { out.code = c; return out; };
  out.json = (b) => { out.body = b; return out; };
  return out;
}

let sent = null;
let all = [];
let resendStatus = 200;
/* Two emails go out for an application now — yours and the applicant's — so
   keeping only the last one would quietly retarget every assertion below at the
   confirmation and still pass. all[] holds them in order; sent stays the one
   addressed to you. */
globalThis.fetch = async (url, opt) => {
  const call = { url, headers: opt.headers, body: JSON.parse(opt.body) };
  all.push(call);
  sent = all[0];
  return {
    ok: resendStatus < 300,
    status: resendStatus,
    text: async () => "refused"
  };
};

const APPLICATION = {
  type: "INSERT",
  table: "applications",
  record: {
    id: "a1", name: "Maria S.", email: "maria@example.com", phone: "+63 900 000 0000",
    country: "Philippines", region: "Cebu", tracks: ["Customer Service", "Admin Tasks"],
    experience: "1-2 years", shifts: ["Night"], speed: "25 Mbps",
    kit: ["Headset", "Webcam"], cv: "https://example.com/cv.pdf", note: "Available immediately",
    /* present on the row, deliberately not in the email */
    user_id: "u1", posting_consent: true
  }
};

const env = {
  WEBHOOK_SECRET: "shh",
  RESEND_API_KEY: "re_test",
  NOTIFY_TO: "david@example.com, bryant@example.com",
  RESEND_FROM: "support@securejobva.com",
  SITE_URL: "https://www.securejobva.com"
};
Object.assign(process.env, env);

const call = async (body, headers, method) => {
  sent = null;
  all = [];
  const res = mockRes();
  await handler({ method: method || "POST", headers: headers || { "x-webhook-secret": "shh" }, body }, res);
  return res;
};

console.log("\nnotify\n");

/* ── refuses anything it should not act on ─────────────────────────────── */

is("GET is refused", (await call(APPLICATION, {}, "GET")).code, 405);
is("a wrong secret is refused", (await call(APPLICATION, { "x-webhook-secret": "nope" })).code, 401);
is("a missing secret is refused", (await call(APPLICATION, {})).code, 401);

delete process.env.WEBHOOK_SECRET;
is("no WEBHOOK_SECRET set means refuse, not allow", (await call(APPLICATION)).code, 500);
process.env.WEBHOOK_SECRET = "shh";

/* ── ignores quietly rather than erroring ──────────────────────────────── */

is("an UPDATE is skipped", (await call({ ...APPLICATION, type: "UPDATE" })).code, 200);
is("and sends nothing", sent, null);
is("an unlisted table is skipped", (await call({ ...APPLICATION, table: "client_logos" })).code, 200);
is("and sends nothing", sent, null);

/* ── the email itself ──────────────────────────────────────────────────── */

const ok = await call(APPLICATION);
is("an application sends", ok.code, 200);
is("to both addresses", sent.body.to, ["david@example.com", "bryant@example.com"]);
is("from the verified domain", sent.body.from, "SecureJobVA <support@securejobva.com>");
is("reply goes to the applicant", sent.body.reply_to, "maria@example.com");
is("the subject names the track", sent.body.subject, "New application — Customer Service, Admin Tasks");
is("the array is readable, not JSON", sent.body.text.includes("Tracks: Customer Service, Admin Tasks"), true);
is("a plain-text part exists", sent.body.text.includes("Name: Maria S."), true);
is("the portal link is in both parts",
  sent.body.text.includes("/admin") && sent.body.html.includes("/admin"), true);

/* Columns that exist on the row but were never asked for should not ride along
   into an inbox just because they were in the payload. */
is("user_id is not in the email", /user_id/.test(sent.body.text + sent.body.html), false);

/* ── the other two tables ──────────────────────────────────────────────── */

await call({ type: "INSERT", table: "seat_requests",
  record: { name: "Ana", company: "Rosehill", email: "ana@example.com", seats: ["Customer Service"],
            hours: 30, weekly: 233, blocks: ["Morning"], timezone: "US Eastern" } });
is("a seat request names the company", sent.body.subject, "New seat request — Rosehill");
is("the rounded quote reads as money", sent.body.text.includes("Quoted: $233 a week"), true);

await call({ type: "INSERT", table: "contact_messages",
  record: { name: "Sam", email: "sam@example.com", reason: "Billing", message: "A question" } });
is("a contact message names the reason", sent.body.subject, "Contact form — Billing");

/* ── empty fields are dropped, not printed blank ───────────────────────── */

await call({ type: "INSERT", table: "applications",
  record: { name: "Jo", email: "jo@example.com", tracks: [], phone: "", note: null } });
is("an empty array is not a row", /Tracks:/.test(sent.body.text), false);
is("an empty string is not a row", /Phone:/.test(sent.body.text), false);
is("a null is not a row", /Note:/.test(sent.body.text), false);
is("the subject says so plainly", sent.body.subject, "New application — no track given");

/* ── escaping ──────────────────────────────────────────────────────────── */

await call({ type: "INSERT", table: "applications",
  record: { name: "<script>alert(1)</script>", email: "x@example.com" } });
is("markup in a field is escaped in the HTML", sent.body.html.includes("<script>alert"), false);
is("and is still readable", sent.body.html.includes("&lt;script&gt;"), true);

/* ── a Resend outage must not lose the row ─────────────────────────────── */

resendStatus = 500;
is("a Resend failure asks Supabase to retry", (await call(APPLICATION)).code, 502);
resendStatus = 200;


/* ── the confirmation the done screen promises ─────────────────────────────
   careers.html tells every applicant a confirmation is on its way to them by
   name. These are the assertions that keep that true, and keep it from
   becoming something it was never meant to be. */

const two = await call(APPLICATION);
is("an application still answers 200", two.code, 200);
is("two emails go out, not one", all.length, 2);
is("the first is yours", all[0].body.to, ["david@example.com", "bryant@example.com"]);
is("the second is theirs", all[1].body.to, ["maria@example.com"]);
is("and it says so", two.body.confirmed, true);
is("from the same verified domain", all[1].body.from, "SecureJobVA <support@securejobva.com>");
is("the subject is about receipt, not a decision",
  all[1].body.subject, "We have your application — SecureJobVA");
is("it greets them by first name", all[1].body.text.startsWith("Hi Maria,"), true);
is("it repeats the promise the screen made",
  all[1].body.text.includes("three working days"), true);
is("it points at their own page", all[1].body.text.includes("/status"), true);

/* An applicant may forward this to anybody. It must not read as an outcome. */
is("it carries no verdict", /approved|accepted|rejected|shortlist|congratulat/i
  .test(all[1].body.text + all[1].body.html), false);
/* Nor may it carry the queue. */
is("it names no other applicant", /david@example\.com|bryant@example\.com/
  .test(all[1].body.text + all[1].body.html), false);
is("it does not link the admin queue", /\/admin/.test(all[1].body.text + all[1].body.html), false);

/* The other two forms promise nothing, so they must not start emailing people
   who were never told to expect it. */
await call({ type: "INSERT", table: "seat_requests",
  record: { name: "Ana", company: "Rosehill", email: "ana@example.com", hours: 30 } });
is("a seat request sends one email, to you", all.length, 1);
await call({ type: "INSERT", table: "contact_messages",
  record: { name: "Sam", email: "sam@example.com", reason: "Billing", message: "A question" } });
is("a contact message sends one email, to you", all.length, 1);

/* No address, no confirmation — and no crash reaching for one. */
const noEmail = await call({ type: "INSERT", table: "applications",
  record: { name: "Jo", email: "", tracks: ["Admin Tasks"] } });
is("an application with no address still notifies you", noEmail.code, 200);
is("and sends only the one email", all.length, 1);
is("and says the confirmation did not go", noEmail.body.confirmed, false);

/* The failure that matters is the one to you. A refused confirmation must not
   turn a delivered notification into a retried one, or a mistyped address
   mails you the same application forever. */
let n = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt) => {
  n++;
  const r = await realFetch(url, opt);
  return n === 1 ? r : { ok: false, status: 422, text: async () => "invalid recipient" };
};
const half = await call(APPLICATION);
globalThis.fetch = realFetch;
is("a refused confirmation still answers 200", half.code, 200);
is("and reports it honestly", half.body.confirmed, false);
is("and still counts your two", half.body.sent, 2);

/* ── decisions, both directions ────────────────────────────────────────────
   031 posts these rather than Supabase, because a timesheet carries no address
   and the person is looked up in the database instead. The shape is different
   from a webhook and so are the rules: one direction must be retried, the
   other must never be. */

const WEEK = {
  type: "STATUS", event: "arrived", table: "timesheets",
  person: { name: "Maricel Ordoñez", email: "maricel@example.com" },
  record: { id: "t1", status: "submitted", week_starts_on: "2026-08-24",
            note: null, hours: 38, days: "Mon 8 · Tue 8 · Wed 8 · Thu 7 · Fri 7" }
};

const decided = (over) => ({
  ...WEEK, event: "decided",
  record: { ...WEEK.record, ...over }
});

/* ── a week arriving ── */
const arr = await call(WEEK);
is("a sent week answers 200", arr.code, 200);
is("it goes to you and Bryant", sent.body.to, ["david@example.com", "bryant@example.com"]);
is("the subject names who and which week",
  sent.body.subject, "Timesheet sent — Maricel Ordoñez, week of 24 August");
is("reply reaches the assistant", sent.body.reply_to, "maricel@example.com");
is("the total is in the body", sent.body.text.includes("Total: 38 hours"), true);
is("the days are in the body", sent.body.text.includes("Mon 8 · Tue 8"), true);
is("it links the queue", sent.body.text.includes("/admin"), true);
is("only one email goes out", all.length, 1);

/* ── approved ── */
const app = await call(decided({ status: "approved" }));
is("an approval answers 200", app.code, 200);
is("and reports it was told", app.body.told, true);
is("it goes to the assistant alone", sent.body.to, ["maricel@example.com"]);
is("the subject says approved", sent.body.subject, "Your hours for 24 to 30 August are approved");
is("it greets them by first name", sent.body.text.startsWith("Hi Maricel,"), true);
is("it repeats the total", sent.body.text.includes("38 hours"), true);
is("it points at their own page", sent.body.text.includes("/hub"), true);

/* An assistant may forward this. It must carry neither the queue nor anybody
   else's address — the same rule the applicant confirmation follows. */
is("it does not link the admin queue", /\/admin/.test(sent.body.text + sent.body.html), false);
is("it names nobody else", /david@example\.com|bryant@example\.com/
  .test(sent.body.text + sent.body.html), false);

/* ── sent back: the reason is the message ── */
const back = await call(decided({ status: "returned", note: "Thursday looks like a double entry — can you check?" }));
is("a send-back answers 200", back.code, 200);
is("the subject asks for a change", sent.body.subject, "Your hours for 24 to 30 August need a change");
is("the reason is in the plain text",
  sent.body.text.includes("Thursday looks like a double entry"), true);
is("the reason is in the HTML",
  sent.body.html.includes("Thursday looks like a double entry"), true);
is("it says the week is still open",
  sent.body.text.includes("send it again"), true);
/* Asserted on this one as well as the approval. Checking only the happy path
   left the send-back free to point at /admin, and nothing went red when it
   did — the two emails are written separately and have to be checked
   separately. */
is("the send-back points at their page, not the queue",
  /\/hub/.test(sent.body.text + sent.body.html) &&
  !/\/admin/.test(sent.body.text + sent.body.html), true);
is("and names nobody else", /david@example\.com|bryant@example\.com/
  .test(sent.body.text + sent.body.html), false);

await call(decided({ status: "returned", note: null }));
is("no note means no dangling colon", /with a note:/.test(sent.body.text), false);

/* ── a week that crosses a month ── */
await call(decided({ status: "approved", week_starts_on: "2026-08-31" }));
is("a week spanning two months names both",
  sent.body.subject, "Your hours for 31 August to 6 September are approved");

/* ── leave, both ways ── */
const LEAVE = {
  type: "STATUS", table: "leave_requests",
  person: { name: "Jomar Villanueva", email: "jomar@example.com" },
  record: { id: "l1", status: "pending", starts_on: "2026-09-14", ends_on: "2026-09-18",
            reason: "Family wedding in Cebu" }
};
await call({ ...LEAVE, event: "arrived" });
is("leave asked for names the dates",
  sent.body.subject, "Leave requested — Jomar Villanueva, 14 September to 18 September");
is("the reason reaches you", sent.body.text.includes("Family wedding in Cebu"), true);

await call({ ...LEAVE, event: "decided", record: { ...LEAVE.record, status: "approved" } });
is("approved leave says so",
  sent.body.subject, "Your leave for 14 September to 18 September is approved");
await call({ ...LEAVE, event: "decided", record: { ...LEAVE.record, status: "declined" } });
is("declined leave does not pretend",
  sent.body.subject, "Your leave for 14 September to 18 September was not approved");
is("and offers a way forward", sent.body.text.includes("ask again"), true);

/* ── ignored quietly ── */
is("an unknown event is skipped", (await call({ ...WEEK, event: "poked" })).code, 200);
is("and sends nothing", sent, null);
is("an unlisted table is skipped", (await call({ ...WEEK, table: "notices" })).code, 200);
is("and sends nothing", sent, null);
is("a status nobody hears about is skipped",
  (await call({ ...WEEK, event: "decided", table: "timesheets", record: { ...WEEK.record, status: "draft" } })).code, 200);

/* ── no address ── */
const noAddr = await call({ ...decided({ status: "approved" }), person: { name: "Nobody", email: "" } });
is("a missing address still answers 200", noAddr.code, 200);
is("and sends nothing", all.length, 0);
is("and says so honestly", noAddr.body.told, false);

/* ── the answer an applicant was promised ──────────────────────────────────
   028 tells them we have it. Nothing told them what we decided: being hired or
   turned down existed only as a rung on /status that changed quietly. */

const STAGE = (status, over) => ({
  type: "STATUS", event: "decided", table: "applications",
  person: { name: "Maria Santos", email: "maria@example.com" },
  record: { id: "a1", name: "Maria Santos", status, ...over }
});

await call(STAGE("assessment"));
is("moving to the exams tells them", sent.body.to, ["maria@example.com"]);
is("and says which exams", sent.body.text.includes("strengths test"), true);
is("and greets them by first name", sent.body.text.startsWith("Hi Maria,"), true);

await call(STAGE("interview"));
is("the interviews email says there are two",
  sent.body.text.includes("one on how you work"), true);

await call(STAGE("approved"));
is("approved repeats the training promise",
  sent.body.subject, "You are through — paid training starts within a week");
is("and matches what /status says", sent.body.text.includes("within a week"), true);
/* Somebody reads this before rearranging a week around training. The condition
   on being paid rides in both parts or it is not really stated. */
is("it says training is paid only if they are hired",
  sent.body.text.includes("paid only if you are hired"), true);
is("and says it in the HTML too",
  sent.body.html.includes("paid only if you are hired"), true);
is("the condition is its own paragraph, not a clause on the good news",
  /<p[^>]*>Training is paid only if/.test(sent.body.html), true);

await call(STAGE("hired"));
is("hired says the portal is open", sent.body.subject, "You are on the team — your portal is open");
is("and points at /hub", sent.body.text.includes("/hub"), true);

/* The one that needed the most care. */
const no = await call(STAGE("declined", { again: "2026-11-28" }));
is("a decline is sent at all", no.body.told, true);
is("the subject does not pre-announce the answer", sent.body.subject, "About your application");
is("it gives a plain answer",
  sent.body.text.includes("not taking your application forward"), true);
is("it names the date they may apply again",
  sent.body.text.includes("28 November 2026"), true);
/* Sending someone to the careers page in the same breath as turning them down
   is not a kindness, so this one carries no button at all. */
is("a decline offers no button", /<a href/.test(sent.body.html), false);
is("and does not apologise or explain itself away",
  /sorry|unfortunately|regret/i.test(sent.body.text), false);

/* The date has to agree with what the form will actually enforce. If it is
   missing the email must still be sendable rather than saying "from ". */
await call(STAGE("declined", { again: null }));
is("no date still reads as a sentence",
  sent.body.text.includes("apply again in three months"), true);
is("and never leaves a dangling date", /from \./.test(sent.body.text), false);

/* Nothing about an application email may carry the queue or anybody else. */
is("no applicant email links the admin queue",
  /\/admin/.test(sent.body.text + sent.body.html), false);
is("and none names another address", /david@example\.com|bryant@example\.com/
  .test(sent.body.text + sent.body.html), false);

/* 'applied' is where they start — 028 already sent the receipt, and a second
   email saying they have applied is one nobody needs. */
const dup = await call(STAGE("applied"));
is("no second email for merely having applied", dup.code, 200);
is("and nothing is sent", all.length, 0);

/* ── the retry rule, which is the whole point of splitting them ── */
resendStatus = 500;
is("a failed email to you is retried", (await call(WEEK)).code, 502);
const lost = await call(decided({ status: "approved" }));
is("a failed email to them is not", lost.code, 200);
is("and is reported rather than hidden", lost.body.told, false);
resendStatus = 200;

console.log("");
console.log(bad ? bad + " FAILED" : "all passed");
console.log("");
process.exit(bad ? 1 : 0);