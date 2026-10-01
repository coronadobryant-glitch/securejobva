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
/* Nothing retries this — pg_net fires once (see send() in api/notify.js).
   The 502 is what net._http_response keeps, so a lost alert can be found. */
is("a Resend failure is reported with 502", (await call(APPLICATION)).code, 502);
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

/* The seat form's thank-you screen promises the call and hands over the
   booking link; since F11 the business gets that in its inbox too (asserted
   in full further down). The contact form promises nothing, so it must not
   start emailing people who were never told to expect it. */
await call({ type: "INSERT", table: "seat_requests",
  record: { name: "Ana", company: "Rosehill", email: "ana@example.com", hours: 30 } });
is("a seat request sends two emails: yours, then theirs", all.length, 2);
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

/* …but a confirmation lost to an outage is retried (sql/095). The retry
   sends your alert again, which is only safe because both tries carry the
   same idempotency key — asserted further down. */
n = 0;
globalThis.fetch = async (url, opt) => {
  n++;
  const r = await realFetch(url, opt);
  return n === 1 ? r : { ok: false, status: 503, text: async () => "unavailable" };
};
const blip = await call(APPLICATION);
globalThis.fetch = realFetch;
is("a confirmation lost to an outage asks for a retry with 503", blip.code, 503);
is("and says the confirmation did not go", [blip.body.retry, blip.body.confirmed], [true, false]);

/* ── decisions, both directions ────────────────────────────────────────────
   031 posts these rather than Supabase, because a timesheet carries no address
   and the person is looked up in the database instead. The shape is different
   from a webhook and so are the rules: a failure in one direction is
   reported with a 502, in the other it never changes the answer. */

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
is("the interview email says one, not two",
  sent.body.text.includes("One interview with us"), true);
is("and the subject says one too",
  sent.body.subject, "Your application — interview next");
/* This used to require the word "pick", because the mail said "Some times are
   waiting on your application page — pick whichever suits you" over a button
   reading Pick your time. The mail is sent by the STAGE CHANGE and the stage
   can be moved before any slot exists, so that sentence was a promise the
   sender could not keep — and the first person ever moved to interview
   followed the button to a page with no times on it.

   So the assertion is inverted. The stage mail must NOT claim times are
   already there; it must say they are coming and that she will be told. What
   it may promise is a page, which always exists. */
is("it does not claim times are already waiting",
  /times are waiting|waiting on your application page/i.test(sent.body.text), false);
is("it says they are coming instead",
  sent.body.text.includes("We will offer you a few times"), true);
is("and promises the mail that follows, which 066 makes real",
  sent.body.text.includes("you will get an email the moment they do"), true);
is("and still sends her to her own page", sent.body.text.includes("/status"), true);
is("and nothing in it still says two",
  /two interviews|There are two/i.test(sent.body.subject + " " + sent.body.text), false);

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

/* ── being placed with a client ────────────────────────────────────────── */

const PLACED = (status, over) => ({
  type: "STATUS", event: "decided", table: "placements",
  person: { name: "Maricel Ordoñez", email: "maricel@example.com" },
  record: { id: "p1", status, client: "Rosehill Plumbing", started_on: "2026-09-07",
            hours_per_week: 40, trial_weeks: 2, ...over }
});

await call(PLACED("matched"));
is("being matched is told, not left silent", sent.body.to, ["maricel@example.com"]);
is("the subject says a client was found", sent.body.subject, "We have found you a client");
is("it names the client", sent.body.text.includes("Rosehill Plumbing"), true);
is("and says a meeting comes first", sent.body.text.includes("meeting"), true);
/* The whole point of this one: it must not read as a job offer. */
is("it promises nothing", sent.body.text.includes("Nothing is settled"), true);

await call(PLACED("trial"));
is("starting names the day", sent.body.subject, "You start with Rosehill Plumbing on 7 September");
is("and the hours", sent.body.text.includes("40 hours a week"), true);
is("and how long the trial runs", sent.body.text.includes("2-week trial"), true);
/* The sentence that stops somebody thinking they have been handed over. */
is("it says who still employs them",
  sent.body.text.includes("stay on the SecureJobVA team"), true);
is("and that pay does not change", sent.body.text.includes("we pay you as we always have"), true);

await call(PLACED("trial", { started_on: null, trial_weeks: null }));
is("no start date still reads as a sentence",
  sent.body.subject, "You are starting with Rosehill Plumbing");
is("and does not leave a dangling date", /on \.|on ,/.test(sent.body.text), false);

await call(PLACED("ongoing"));
is("being kept on is told", sent.body.subject, "You are staying on with Rosehill Plumbing");
is("and asks nothing of them", sent.body.text.includes("nothing you need to do"), true);

/* Losing a placement is a conversation, not an email. */
const gone = await call(PLACED("ended"));
is("a placement ending sends nothing", all.length, 0);
is("and is skipped quietly", gone.code, 200);

/* None of these may carry the queue or anybody else. */
await call(PLACED("trial"));
is("no placement email links the admin queue",
  /\/admin/.test(sent.body.text + sent.body.html), false);
is("and none names another address", /david@example\.com|bryant@example\.com/
  .test(sent.body.text + sent.body.html), false);
is("and none mentions money", /\$|rate|per hour|an hour/i
  .test(sent.body.text), false, "her portal shows hours and no money");

/* ── a client asking for somebody different ────────────────────────────────
   The worst thing in the system to go unnoticed: somebody's job is the
   subject and a client is waiting on a reply. */

const SWAP = {
  type: "STATUS", event: "arrived", table: "swap_requests", person: {},
  record: { id: "s1", client: "Rosehill Plumbing", assistant: "Maricel Ordoñez",
            since: "2026-09-07", placement: "ongoing",
            reason: "Timezone overlap is not working — we need mornings covered." }
};

const swap = await call(SWAP);
is("a swap request reaches you", swap.code, 200);
is("you and Bryant, nobody else", sent.body.to, ["david@example.com", "bryant@example.com"]);
is("the subject names both sides",
  sent.body.subject, "Replacement asked for — Rosehill Plumbing on Maricel Ordoñez");
is("their reason is in it", sent.body.text.includes("Timezone overlap"), true);
is("and how long they have had her", sent.body.text.includes("7 September"), true);
is("only one email goes out", all.length, 1);

/* The rule this whole feature rests on. */
is("nothing is addressed to the assistant",
  /maricel@|@example\.com/.test(sent.body.to.join(",").replace(/david@example\.com|bryant@example\.com/g, "")),
  false, "she must not learn this from an inbox");

/* There is no outbound half at all, so asking for one must send nothing.

   Given a real address on purpose. Asking with an empty person block would
   pass whether or not a message to her existed — the handler stops at "no
   address, no email" long before it looks for one — and this has to fail if
   somebody ever writes that message, not merely if they forget the address. */
const swapOut = await call({ ...SWAP, event: "decided",
  person: { name: "Maricel Ordoñez", email: "maricel@example.com" } });
is("there is no message to the assistant, even with her address in hand",
  all.length, 0);
is("and asking for one is skipped", swapOut.code, 200);
is("it is skipped by name", swapOut.body.skipped, "swap_requests/decided");

/* Resend failing here is reported, not swallowed — this is the one holding a
   reply. Reported is all: nothing asks twice. */
resendStatus = 500;
is("a failed swap email is reported with 502", (await call(SWAP)).code, 502);
resendStatus = 200;

/* ── the interview handshake ─────────────────────────────────────────────
   sql/057 and 058. Four moments, and the thing worth checking about all of
   them is who they reach: this is the one exchange in the product staff are
   not part of, and an email to you here would quietly undo that decision. */

/* 9:00 AM Central on Tuesday 8 September 2026. */
const IV_AT = "2026-09-08T14:00:00.000Z";
const iv = (event, over) => ({
  type: "STATUS", event, table: "interview_slots",
  person: over && over.person ? over.person : { name: "Maricel Ordoñez", email: "maricel@example.com" },
  record: Object.assign({
    id: "iv1", side: "assistant", other: "Rosehill Plumbing",
    starts_at: IV_AT, minutes: 30, meeting_url: null
  }, (over && over.record) || {})
});

all = [];
const offered = await call(iv("offered"));
is("times offered reach the assistant", offered.code, 200);
is("and only her", sent.body.to, ["maricel@example.com"]);
is("staff are not copied", JSON.stringify(sent.body.to).includes("david@example.com"), false);
is("she is pointed at her own portal", sent.body.text.includes("/hub"), true);
is("and told she may refuse them", sent.body.text.includes("none of them work"), true);
is("exactly one email", all.length, 1);

all = [];
const picked = await call(iv("picked", {
  person: { name: "Dana Whitfield", email: "dana@rosehill.example" },
  record: { side: "client", other: "Maricel Ordoñez" }
}));
is("a pick reaches the client", picked.code, 200);
is("and only them", sent.body.to, ["dana@rosehill.example"]);
is("the time is named in Central",
  sent.body.subject.includes("picked") && sent.body.text.includes("Central"), true);
is("the time itself is the client's morning", sent.body.text.includes("9:00"), true,
  "the email cannot know the reader's zone, so it names one and says which");
is("they are sent to confirm it", sent.body.text.includes("/seats"), true);

all = [];
await call(iv("declined", {
  person: { name: "Dana Whitfield", email: "dana@rosehill.example" },
  record: { side: "client", other: "Maricel Ordoñez" }
}));
is("a refusal reaches the client", sent.body.to, ["dana@rosehill.example"]);
is("and asks for other times", sent.body.text.includes("Offer a few others"), true,
  "silence and a refusal must not look the same to the person waiting");

all = [];
await call(iv("confirmed", { record: { side: "assistant", meeting_url: "https://meet.example/abc" } }));
is("a confirmation reaches her", sent.body.to, ["maricel@example.com"]);
is("with the joining link", sent.body.text.includes("https://meet.example/abc"), true);
is("and is told the time is in the client's clock", sent.body.text.includes("Central"), true);

all = [];
await call(iv("confirmed", {
  person: { name: "Dana Whitfield", email: "dana@rosehill.example" },
  record: { side: "client", other: "Maricel Ordoñez" }
}));
is("the client's copy goes to them", sent.body.to, ["dana@rosehill.example"]);
is("and says she has been told", sent.body.text.includes("She has been told"), true);
is("with no link, she is still reachable",
  sent.body.text.includes("write to you at the address"), true);

/* No `arrived` shape exists for this table, which is what keeps staff out of
   it. Asking for one must send nothing rather than falling through to the
   branch that mails you and Bryant. */
all = [];
const ivStaff = await call(iv("arrived"));
is("there is no staff copy of an interview", all.length, 0);
is("and asking for one is skipped", ivStaff.code, 200);
is("by name", ivStaff.body.skipped, "interview_slots/arrived");

/* ── her own interview, with us ──────────────────────────────────────────
   062 reused this table for an applicant and wired no mail at all: 058's
   trigger looks the parties up through placements, an applicant's slot has no
   placement, the lookup matched nothing and it returned having sent nothing.
   It never failed — there is nothing wrong with a slot that has no placement,
   it is simply the other kind. 066 routes those rows; these are the two mails
   that reach her, and the third side api/notify.js now branches on. */
const ivHer = (event, over) => iv(event, Object.assign({
  person: { name: "Maria Santos", email: "maria@example.com" },
  record: Object.assign({ side: "applicant", other: "SecureJobVA" },
                        (over && over.record) || {})
}, over && over.person ? { person: over.person } : {}));

all = [];
const hers = await call(ivHer("offered"));
is("times offered reach the applicant", hers.code, 200);
is("and only her", sent.body.to, ["maria@example.com"]);
is("the subject says what it is about", sent.body.subject, "Your interview — pick a time");
is("she is sent to her own page, not the assistant portal",
   sent.body.text.includes("/status"), true);
is("and never to /hub, which is not hers", sent.body.text.includes("/hub"), false);
is("no client is invented for an interview that has none",
   /client/i.test(sent.body.text), false);
is("and she is told she may refuse them", sent.body.text.includes("none of them work"), true);
is("exactly one email", all.length, 1);

all = [];
const set = await call(ivHer("confirmed"));
is("confirming in /admin tells her", set.code, 200);
is("with the time in the subject",
   sent.body.subject.startsWith("Your interview is set — "), true);
is("and the date in it", sent.body.subject.includes("September 8"), true);
is("it names the clock the time is in", sent.body.text.includes("Central"), true);
is("and where to see it on hers", sent.body.text.includes("/status"), true);
is("it says how the joining details arrive when there is no link",
   sent.body.text.includes("joining details"), true);
is("exactly one email", all.length, 1);

all = [];
await call(ivHer("confirmed", { record: { meeting_url: "https://meet.example/xyz" } }));
is("a meeting link is given when there is one",
   sent.body.text.includes("https://meet.example/xyz"), true);

/* Her picking one, and her declining, tell nobody by mail: /admin already
   shows the pick as a Confirm button on the row in front of the person who
   acts on it. Mailing ourselves about our own queue is how a queue stops
   being read. */
all = [];
const herPick = await call(ivHer("picked"));
is("her pick mails nobody", all.length, 0);
is("and is not an error", herPick.code, 200);

/* ── the joining link, which the confirmation promised ───────────────────
   062 gave confirm a url argument and /admin never passed one, so every
   confirmed interview had meeting_url null and her mail fell through to "we
   will send the joining details before the day" — which nothing then sent.
   067 adds the link moment, and this is what it says. */
all = [];
const link = await call(ivHer("link", {
  record: { meeting_url: "https://meet.google.com/abc-defg-hij" }
}));
is("a link sent afterwards reaches her", link.code, 200);
is("and only her", sent.body.to, ["maria@example.com"]);
is("the subject says what it is and when",
   sent.body.subject, "Where to join your interview — Tuesday, September 8 at 9:00 AM Central, 30 minutes");
is("the link is in the text part",
   sent.body.text.includes("https://meet.google.com/abc-defg-hij"), true);
is("and clickable in the html part",
   sent.body.html.includes("href=\"https://meet.google.com/abc-defg-hij\""), true);
is("it still names the clock", sent.body.text.includes("Central"), true);
is("and tells her to be early", sent.body.text.includes("couple of minutes early"), true);
is("exactly one email", all.length, 1);

/* A placement link is not news — the client typed it while confirming, so the
   confirmation already carried it. 067 does not post the moment for that side,
   and the handler must agree rather than trust that it never arrives: the
   locks in notify.js exist for a payload posted by hand. This used to assert
   that the mail WENT, directly under a comment saying it should not — so the
   test would have gone red on the fix and pushed whoever made it to revert.
   Sent, it is a second "Where to join" whose button points at /status, a page
   an assistant has no use for. */
all = [];
const plLink = await call(iv("link", {
  record: { meeting_url: "https://meet.google.com/abc-defg-hij" }
}));
is("a placement link does not mail the assistant, who got it on the confirmation",
   all.length, 0);
is("and is not an error", plLink.code, 200);
is("it is skipped, and says so", typeof (plLink.body && plLink.body.skipped), "string");

/* ── a payment, recorded (sql/093) ──────────────────────────────────────
   Until 093 a client who paid heard nothing back. The receipt says what was
   recorded and where the statement is — and nothing the payload cannot back:
   no balance, no due date, no refund promise. */
const PAID = (over) => ({
  type: "STATUS", event: "recorded", table: "client_payments",
  person: { name: "Dana Whitfield", email: "dana@northlake.example" },
  record: Object.assign({ id: "p1", business: "Northlake Dental", amount_cents: 32750,
    paid_on: "2026-09-29", method: "bank_transfer", reference: "INV-12" }, over || {})
});
{
  const r = await call(PAID());
  is("a recorded payment is answered 200", r.code, 200);
  is("exactly one email", all.length, 1);
  const m = all[0] ? all[0].body : {};
  is("to the client's contact, and nobody else", m.to, ["dana@northlake.example"]);
  is("the subject carries the amount", m.subject, "Payment received — $327.50");
  const t = m.text || "";
  is("it names the business, the amount, the date, the method and the reference",
    /from Northlake Dental of \$327\.50, paid on .*29.*2026 by bank transfer, reference INV-12\./.test(t), true);
  is("and points at the statement", t.indexOf("https://www.securejobva.com/pay") > -1, true);
  is("and promises nothing it cannot back", /refund|due|balance|owe/i.test(t), false);
}
{
  await call(PAID({ method: "other", reference: null, amount_cents: 123456789 }));
  const t = all[0] ? all[0].body.text : "";
  is("a large amount is grouped by hand, not by the machine's locale", /\$1,234,567\.89/.test(t), true);
  is("\"other\" is left out rather than printed", /by other/.test(t), false);
}
{
  const r = await call({ ...PAID(), person: { name: "Dana", email: "" } });
  is("a client with no contact address is skipped, not an error", [r.code, all.length], [200, 0]);
}

/* ── what reaches an attribute ──────────────────────────────────────────
   esc() used to stop at & < >. Inside a double-quoted href that let a " close
   the attribute and add one of its own. 081 refuses such links now; rows
   written before it still reach this. */
{
  await call(PAID({ business: 'Acme" style="display:none', reference: "it's" }));
  const h = all[0] ? all[0].body.html : "";
  is("a double quote in a value is escaped in the HTML", h.indexOf('Acme" style') < 0, true);
  is("as &quot;", h.indexOf("Acme&quot; style") > -1, true);
  is("and a single quote as &#39;", h.indexOf("it&#39;s") > -1, true);
}

/* ── the tracks an applicant is told she applied for ─────────────────────
   091 stops new rows carrying anything but the three; rows before it could
   carry a sentence, and the confirmation is signed by us. */
{
  await call({ ...APPLICATION, record: { ...APPLICATION.record,
    tracks: ["Customer Service", "ACTION REQUIRED: your payout is on hold"] } });
  /* Her confirmation only. The staff notification lists the row as it
     landed, on purpose — it goes to us, and a strange track is something we
     should see. */
  const hers = all.filter((c) => JSON.stringify(c.body.to).indexOf("maria@example.com") > -1)
    .map((c) => (c.body.subject || "") + "\n" + (c.body.text || "") + "\n" + (c.body.html || ""));
  is("her confirmation went out", hers.length, 1);
  is("a track that is not one of the three is not in it", hers.some((s) => /ACTION REQUIRED/.test(s)), false);
  is("the real one still is", hers.some((s) => /Customer Service/.test(s)), true);
}

/* ── an address that is not one is not a reply-to ────────────────────── */
{
  await call({ ...APPLICATION, record: { ...APPLICATION.record, email: "maria@example" } });
  is("an incomplete address is not offered as reply_to", sent && sent.body.reply_to, undefined);
  is("and is not mailed a confirmation", all.length, 1);
}

/* ── the reporting rule, which is now a request to the outbox ──
   sql/095 retries anything that is not 2xx or a plain 4xx about the message.
   An outage must ask for another try, for staff and person alike; a dead
   address must not, or the outbox spends eight hours asking Resend to mail
   somebody who does not exist and then alerts you about it. */
resendStatus = 500;
is("a failed email to you is reported with 502", (await call(WEEK)).code, 502);
const lost = await call(decided({ status: "approved" }));
is("a failed email to them, Resend down, asks for a retry with 503", lost.code, 503);
is("and says so in the body", [lost.body.retry, lost.body.told], [true, false]);
resendStatus = 429;
is("rate-limited is a retry too", (await call(decided({ status: "approved" }))).code, 503);
resendStatus = 422;
const dead = await call(decided({ status: "approved" }));
is("a dead address is answered 200 — another try cannot help", dead.code, 200);
is("and is reported rather than hidden", dead.body.told, false);
resendStatus = 200;

/* ── a first word that is not a name ─────────────────────────────────────
   The greeting is the first line of a message we sign, and the name is typed
   into a public form. "www.evil.example" there made the greeting a link in
   most mail apps. */
{
  await call({ ...decided({ status: "approved" }),
    person: { name: "www.evil.example click here", email: "maricel@example.com" } });
  is("a name that is an address is greeted as there", sent.body.text.startsWith("Hi there,"), true);
  is("and the address is nowhere in it", /evil\.example/.test(sent.body.text + sent.body.html), false);
}

/* ── NOTIFY_TO is only asked for by the sends that use it ──────────────── */
{
  const keep = process.env.NOTIFY_TO;
  delete process.env.NOTIFY_TO;
  const d = await call(decided({ status: "approved" }));
  is("without NOTIFY_TO a decision still reaches the assistant", [d.code, sent && sent.body.to],
     [200, ["maricel@example.com"]]);
  const i = await call(APPLICATION);
  is("but a row landing, which mails staff, answers 500", i.code, 500);
  is("and sends nothing", all.length, 0);
  process.env.NOTIFY_TO = keep;
}

/* ── a body that is not JSON ─────────────────────────────────────────────── */
{
  let r, threw = null;
  try { r = await call("{bad"); } catch (e) { threw = e; }
  is("a text body that is not JSON gets a 400, not a crash",
     threw ? "threw " + threw.message : r.code, 400);
  is("and sends nothing", all.length, 0);
}

/* ── a reply_to Resend will not take ─────────────────────────────────────
   The one retry that happens: the address was typed by whoever sent the
   form, and a typo in it must cost staff a reply button, not the alert. */
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opt) => {
    const r = await realFetch(url, opt);
    return JSON.parse(opt.body).reply_to ? { ok: false, status: 422, text: async () => "invalid reply_to" } : r;
  };
  const r = await call(WEEK);
  globalThis.fetch = realFetch;
  is("a 422 with a reply_to is tried once more", all.length, 2);
  is("the first try carried it", all[0].body.reply_to, "maricel@example.com");
  is("the second went without it", all[1].body.reply_to, undefined);
  is("and the alert landed", r.code, 200);
}

/* ── the joining link on its own is the applicant's alone ──────────────── */
{
  const r = await call(iv("link", { record: { side: "assistant", meeting_url: "https://meet.example/abc" } }));
  is("a link event on a placement interview is skipped", [r.code, all.length], [200, 0]);
  is("by name", r.body.skipped, "interview_slots/link (assistant)");
}

/* ══ fix run 1 Oct: the outbox and the mails it carries ════════════════════
   Everything below is new with sql/094–111. The payload shapes are copied
   from those files' jsonb_build_object calls, field for field. */

const words = (m) => (m.subject || "") + "\n" + (m.text || "") + "\n" + (m.html || "");
const STAFF = /david@example\.com|bryant@example\.com/;

/* ── the idempotency key (sql/095, F51) ──────────────────────────────────
   Every retry of one outbox row carries the same x-idempotency-key, and
   Resend's key must be built from it — otherwise a retry is a second email. */
{
  const H = { "x-webhook-secret": "shh", "x-idempotency-key": "0b9f3c1e-7a51-4d1e-9c8a-2f6b1d0e4a77" };
  await call(decided({ status: "approved" }), H);
  const k1 = all[0].headers["Idempotency-Key"];
  await call(decided({ status: "approved" }), H);
  const k2 = all[0].headers["Idempotency-Key"];
  is("with the header, Resend's key ends with the outbox row's key",
    k1.endsWith(":0b9f3c1e-7a51-4d1e-9c8a-2f6b1d0e4a77"), true);
  is("and a retry of the same row asks Resend with the same key", k1, k2);
  is("the front still says what it was for", k1.startsWith("timesheets:decided:t1:person:"), true);

  await call(APPLICATION, H);
  is("the two emails of one request never share a key",
    all.length === 2 && all[0].headers["Idempotency-Key"] !== all[1].headers["Idempotency-Key"], true);
  is("but both carry the row's key",
    all.every((c) => c.headers["Idempotency-Key"].endsWith(H["x-idempotency-key"])), true);

  await call(decided({ status: "approved" }));
  const r1 = all[0].headers["Idempotency-Key"];
  await call(decided({ status: "approved" }));
  is("without the header, every call gets a fresh key as before", r1 !== all[0].headers["Idempotency-Key"], true);

  await call(decided({ status: "approved" }), { "x-webhook-secret": "shh", "x-idempotency-key": "a b\"c" });
  is("a header that is not key-shaped is not put into Resend's header",
    /a b|"/.test(all[0].headers["Idempotency-Key"]), false);
  is("and no address is ever in the key", /@/.test(k1), false);
}

/* ── the exams, sent (sql/098, F4, F34) ─────────────────────────────────── */
{
  const EXAMS = (over) => ({
    type: "STATUS", event: "arrived", table: "application_assessment",
    person: { name: "Maria Santos", email: "maria@example.com" },
    record: Object.assign({ id: "a1", track: "Customer Service", verdict: "passed",
      typing_wpm: 52, typing_accuracy: 96, typing_checked: false, needs: "typing check" }, over || {})
  });
  const r = await call(EXAMS());
  is("sent exams reach staff", [r.code, sent && sent.body.to], [200, ["david@example.com", "bryant@example.com"]]);
  is("and nobody else", all.length, 1);
  is("the subject says what is waiting on us", sent.body.subject, "Exams sent — Maria Santos passed — check her typing");
  is("reply reaches her", sent.body.reply_to, "maria@example.com");
  is("the claimed typing is in it", sent.body.text.includes("Typing claimed: 52 wpm, 96% accuracy"), true);
  is("and that it is not checked yet", sent.body.text.includes("Typing checked: Not yet"), true);
  is("it says what checking does", /moves her to Interview/.test(sent.body.text), true);
  is("it links /admin", sent.body.text.includes("/admin"), true);

  await call(EXAMS({ verdict: "below_line", needs: "a decision" }));
  is("a fail asks for a decision", sent.body.subject, "Exams sent — Maria Santos — needs a decision");
  is("and names the verdict in words", sent.body.text.includes("Verdict: Below the line"), true);

  await call(EXAMS({ typing_checked: true, needs: "nothing" }));
  is("an already-checked pass needs nothing", sent.body.text.includes("Needed: Nothing"), true);

  resendStatus = 500;
  is("a lost staff alert asks for a retry with 502", (await call(EXAMS())).code, 502);
  resendStatus = 200;
}

/* ── her pick, to us (sql/099, F6, F35) ────────────────────────────────── */
{
  const herArrived = (moment) => iv("arrived", {
    person: { name: "Maria Santos", email: "maria@example.com" },
    record: { side: "applicant", moment, other: "SecureJobVA", application_id: "a1" }
  });
  const p = await call(herArrived("picked"));
  is("her pick now reaches staff", [p.code, sent && sent.body.to], [200, ["david@example.com", "bryant@example.com"]]);
  is("the subject names her and the time",
    sent.body.subject, "Interview time picked — Maria Santos, Tuesday, September 8 at 9:00 AM Central, 30 minutes");
  is("it says to confirm it", sent.body.text.includes("Confirm it in /admin"), true);
  is("reply reaches her", sent.body.reply_to, "maria@example.com");
  is("exactly one email, and not to her", [all.length, JSON.stringify(sent.body.to).includes("maria@")], [1, false]);

  await call(herArrived("declined"));
  is("all declined reaches staff too", sent.body.subject, "No interview time works — Maria Santos");
  is("and asks for other times", sent.body.text.includes("Offer her others"), true);

  const odd = await call(herArrived("confirmed"));
  is("a moment that is not ours to act on is skipped", [odd.code, all.length], [200, 0]);

  /* The placement handshake stays between client and assistant. */
  const pl = await call(iv("arrived", { record: { side: "client", moment: "picked" } }));
  is("a placement interview never mails staff", [pl.code, all.length, pl.body.skipped],
    [200, 0, "interview_slots/arrived"]);
  /* The old lock still holds for the client-shaped events. */
  const lock = await call(ivHer("declined"));
  is("her decline as a client-shaped event mails nobody", [lock.code, all.length], [200, 0]);
}

/* ── moved and cancelled, all three sides (F50, sql/099, 100) ───────────── */
{
  const MOVED_AT = "2026-09-10T19:30:00.000Z"; /* 2:30 PM Central, Thursday 10 September */

  /* Her own interview, with us. */
  await call(ivHer("moved", { record: { starts_at: MOVED_AT, meeting_url: "https://meet.example/new" } }));
  is("her move goes to her alone", sent.body.to, ["maria@example.com"]);
  is("the subject leads with the new time",
    sent.body.subject, "Your interview has moved to Thursday, September 10 at 2:30 PM Central, 30 minutes");
  is("it says it is still going ahead", sent.body.text.includes("still going ahead"), true);
  is("the new link rides along", sent.body.text.includes("https://meet.example/new"), true);
  is("and is clickable", sent.body.html.includes('href="https://meet.example/new"'), true);
  is("she is sent to /status", /\/status/.test(sent.body.text) && !/\/hub|\/seats|\/admin/.test(words(sent.body)), true);
  is("no client is invented", /client/i.test(sent.body.text), false);

  await call(ivHer("moved"));
  is("with no link, no empty 'Where to join'", /Where to join/.test(sent.body.text), false);

  await call(ivHer("cancelled"));
  is("her cancellation names the time", sent.body.subject, "Your interview on Tuesday, September 8 at 9:00 AM Central, 30 minutes is cancelled");
  is("and says it is not a decision", sent.body.text.includes("not a decision about your application"), true);
  is("and that new times are coming", sent.body.text.includes("send new times"), true);
  is("on her page", /\/status/.test(sent.body.html) && !/\/hub|\/seats|\/admin/.test(words(sent.body)), true);

  /* The assistant's copy of a placement interview. */
  await call(iv("moved", { record: { starts_at: MOVED_AT, meeting_url: "https://meet.example/pl" } }));
  is("the assistant's move goes to her", sent.body.to, ["maricel@example.com"]);
  is("and names the client",
    sent.body.subject, "Your interview with Rosehill Plumbing has moved to Thursday, September 10 at 2:30 PM Central, 30 minutes");
  is("it says still going ahead", sent.body.text.includes("still going ahead"), true);
  is("the link rides along", sent.body.text.includes("https://meet.example/pl"), true);
  is("the clock is the client's", sent.body.text.includes("the client's clock"), true);
  is("she is sent to /hub, not /status or /seats",
    /\/hub/.test(sent.body.text) && !/\/status|\/seats|\/admin/.test(words(sent.body)), true);
  is("no applicant wording leaks in", /application/i.test(sent.body.text), false);

  await call(iv("cancelled"));
  is("the assistant's cancellation names the client",
    sent.body.subject, "Your interview with Rosehill Plumbing on Tuesday, September 8 at 9:00 AM Central, 30 minutes is cancelled");
  is("and says the client offers new times", sent.body.text.includes("Rosehill Plumbing will offer new times"), true);
  is("and that she will be emailed", sent.body.text.includes("you will get an email"), true);
  is("on /hub", /\/hub/.test(sent.body.text + sent.body.html) && !/\/status|\/seats/.test(words(sent.body)), true);

  /* The client's copy. */
  const DANA = { name: "Dana Whitfield", email: "dana@rosehill.example" };
  await call(iv("moved", { person: DANA, record: { side: "client", other: "Maricel Ordoñez", starts_at: MOVED_AT } }));
  is("the client's move goes to them", sent.body.to, ["dana@rosehill.example"]);
  is("and names the assistant",
    sent.body.subject.startsWith("Your interview with Maricel Ordoñez has moved to Thursday"), true);
  is("it says she has been told", sent.body.text.includes("She has been told"), true);
  is("they are sent to /seats", /\/seats/.test(sent.body.html) && !/\/status|\/hub|\/admin/.test(words(sent.body)), true);

  await call(iv("cancelled", { person: DANA, record: { side: "client", other: "Maricel Ordoñez" } }));
  is("the client's cancellation asks them to offer new times",
    sent.body.text.includes("offer new times at https://www.securejobva.com/seats"), true);
  is("with a button that says so", sent.body.html.includes("Offer new times"), true);
  is("and never sends them to /status or /hub", /\/status|\/hub/.test(words(sent.body)), false);
  /* The client typed the meeting link and owns the room; cancelling here
     does not close it, so the applicant's "will not work now" is false on
     this side, and this email never shows the link anyway. */
  is("the client's cancellation says nothing about the link dying",
    /will not work now|that link/.test(words(sent.body)), false);
  await call(iv("cancelled"));
  is("nor does the assistant's", /will not work now|that link/.test(words(sent.body)), false);
  is("she is told to take it out of her calendar",
    sent.body.text.includes("Take it out of your calendar; that time is no longer happening.") &&
    sent.body.html.includes("Take it out of your calendar"), true);

  /* None of the six may reach staff or carry anybody else's address. */
  for (const [label, body] of [
    ["her move", ivHer("moved")], ["her cancellation", ivHer("cancelled")],
    ["assistant move", iv("moved")], ["assistant cancellation", iv("cancelled")],
    ["client move", iv("moved", { person: DANA, record: { side: "client", other: "Maricel Ordoñez" } })],
    ["client cancellation", iv("cancelled", { person: DANA, record: { side: "client", other: "Maricel Ordoñez" } })]
  ]) {
    await call(body);
    is(label + ": one email, to one person, naming nobody on staff",
      [all.length, sent.body.to.length, STAFF.test(words(sent.body) + sent.body.to.join())], [1, 1, false]);
  }

  /* The reason given for moving or cancelling (sql/100, record.reason). The
     /admin box promises it is "quoted to both of them in the email", so both
     sides' copies must carry it, escaped, and an absent or blank one must
     leave the email as it always read. */
  const WHY = "Dana's van broke down & she needs the <morning>";
  for (const [label, body] of [
    ["assistant move", iv("moved", { record: { starts_at: MOVED_AT, reason: WHY } })],
    ["assistant cancellation", iv("cancelled", { record: { reason: WHY } })],
    ["client move", iv("moved", { person: DANA, record: { side: "client", other: "Maricel Ordoñez", starts_at: MOVED_AT, reason: WHY } })],
    ["client cancellation", iv("cancelled", { person: DANA, record: { side: "client", other: "Maricel Ordoñez", reason: WHY } })]
  ]) {
    await call(body);
    is(label + ": the reason is quoted in the text",
      sent.body.text.includes("The note that came with it:\n  " + WHY), true);
    is(label + ": and in the HTML, escaped",
      sent.body.html.includes("Dana&#39;s van broke down &amp; she needs the &lt;morning&gt;") &&
      !sent.body.html.includes("<morning>"), true);
  }
  for (const [label, body] of [
    ["assistant move", iv("moved")], ["assistant cancellation", iv("cancelled")],
    ["client move", iv("moved", { person: DANA, record: { side: "client", other: "Maricel Ordoñez" } })],
    ["client cancellation", iv("cancelled", { person: DANA, record: { side: "client", other: "Maricel Ordoñez", reason: "   " } })]
  ]) {
    await call(body);
    is(label + ": no reason, no note and no empty quote",
      /note that came with it|FFF6E0/.test(words(sent.body)), false);
  }
  await call(iv("cancelled", { record: { reason: WHY } }));
  is("a quoted reason leaves the cancellation's own lines intact",
    sent.body.text.includes("Rosehill Plumbing will offer new times") &&
    sent.body.text.includes("Take it out of your calendar"), true);

  /* Markup in a name reaches an email we sign. */
  await call(iv("moved", { record: { other: '<b>Rose"hill</b>' } }));
  is("the other party's name is escaped in the HTML", sent.body.html.includes("<b>Rose"), false);
}

/* ── a seat request moving on (sql/103, F13) ────────────────────────────── */
{
  const SEAT = (status, over) => ({
    type: "STATUS", event: "decided", table: "seat_requests",
    person: { name: "Ana Reyes", email: "ana@rosehill.example" },
    record: Object.assign({ id: "sr1", status, previous: "received",
      company: "Rosehill ACTION REQUIRED evil.example", seats: ["Customer Service", "evil.example/login"] }, over || {})
  });
  await call(SEAT("call_booked"));
  is("a stage move reaches the address on the request", sent.body.to, ["ana@rosehill.example"]);
  is("the subject names the stage", sent.body.subject, "Your seat request — call booked");
  is("it uses /seats' own words", sent.body.text.includes("Twenty minutes to agree the hours, the tasks and the rate."), true);
  is("it names only the seats this site offers", sent.body.text.includes("for an assistant in Customer Service") &&
    !/evil\.example/.test(words(sent.body)), true);
  is("and never repeats the company typed into a public form", /Rosehill|ACTION REQUIRED/.test(words(sent.body)), false);
  is("it points at /seats", sent.body.text.includes("/seats"), true);
  is("greets by first name", sent.body.text.startsWith("Hi Ana,"), true);

  for (const [st, words_] of [["matching", "already trained in your track"],
                              ["shortlist", "You choose; we handle the handover."],
                              ["running", "working the hours you set"]]) {
    await call(SEAT(st));
    is(st + " says what /seats says", sent.body.text.includes(words_), true);
  }

  await call(SEAT("closed"));
  is("closed says so", sent.body.subject, "Your seat request is closed");
  is("and how to pick it up again", sent.body.text.includes("If you want to pick it up again, book a call"), true);
  is("with the booking link", sent.body.text.includes("https://cal.com/securejobva.com/20min"), true);
  is("which carries the request's id, so a booking from it can be matched",
    sent.body.text.includes("https://cal.com/securejobva.com/20min?email=ana%40rosehill.example&metadata[seat_request]=sr1") &&
    sent.body.html.includes("metadata[seat_request]=sr1"), true);

  const rec = await call(SEAT("received"));
  is("received is never mailed — the receipt said it", [rec.code, all.length], [200, 0]);
  const unk = await call(SEAT("parked"));
  is("an unknown stage is skipped", [unk.code, all.length], [200, 0]);
  is("no staff copy", STAFF.test(JSON.stringify(sent)), false);
}

/* ── the receipt a business gets (F11) ──────────────────────────────────── */
{
  const { readFileSync } = await import("node:fs");
  const cal = (readFileSync(new URL("../index.html", import.meta.url), "utf8")
    .match(/scheduler:\s*"([^"]+)"/) || [])[1];

  await call({ type: "INSERT", table: "seat_requests",
    record: { id: "sr2", name: "Ana Reyes", company: "Click evil.example now", email: "ana@rosehill.example",
              seats: ["Admin Tasks", "Visit evil.example"], hours: 30, notes: "PAYMENT ON HOLD evil.example" } });
  is("two emails: yours, then the business's", all.length, 2);
  const m = all[1] ? all[1].body : {};
  is("the receipt goes to the address on the request alone", m.to, ["ana@rosehill.example"]);
  is("the subject is a receipt", m.subject, "We have your request — SecureJobVA");
  is("it greets by first name", (m.text || "").startsWith("Hi Ana,"), true);
  is("it names the call and the 20 minutes", /20-minute call/.test(m.text), true);
  /* The thank-you screen's booking() adds email= and metadata[seat_request]=
     so a booking can be matched to its request by id. The email builds the
     same link from the two values that are ours to repeat — the recipient's
     own address and the row id — and nothing else typed into the form. */
  const BOOK = cal + "?email=ana%40rosehill.example&metadata[seat_request]=sr2";
  is("it carries the same booking link the thank-you screen does", !!cal && (m.text || "").includes(BOOK), true);
  is("and as a button", (m.html || "").includes('href="' + BOOK.replace(/&/g, "&amp;") + '"'), true);
  is("the link carries no name or notes", /name=|notes=/.test((m.text || "") + (m.html || "")), false);
  is("it repeats the screen's shortlist timing, nothing more",
    (m.text || "").includes("within three working days of the call"), true);
  is("it points at /seats", (m.text || "").includes("/seats"), true);
  is("only the offered seats are named", (m.text || "").includes("for an assistant in Admin Tasks"), true);
  is("nothing typed into the public form goes back out", /evil\.example|Click|PAYMENT/.test(words(m)), false);
  is("it names nobody on staff", STAFF.test(words(m)), false);
  is("it promises no price", /\$|rate is|per hour/.test(m.text || ""), false);

  await call({ type: "INSERT", table: "seat_requests", record: { name: "Ana", email: "ana@rosehill" } });
  is("an address that is not one gets no receipt", all.length, 1);
}

/* ── hours waiting for the client (sql/106, F20) ────────────────────────── */
{
  const WAIT = (over) => ({
    type: "STATUS", event: "waiting", table: "timesheets",
    person: { name: "Dana Whitfield", email: "dana@rosehill.example" },
    record: Object.assign({ id: "t9", week_starts_on: "2026-09-21", hours: 38.5,
      days: "Mon 8 · Tue 8 · Wed 8 · Thu 7.5 · Fri 7", assistant: "Maricel Ordoñez",
      business: "Rosehill Plumbing", trial_week: false, again: false }, over || {})
  });
  await call(WAIT());
  is("a sent week reaches the client", sent.body.to, ["dana@rosehill.example"]);
  is("the subject names her and the week", sent.body.subject, "Maricel's hours for 21 to 27 September are waiting for you");
  is("the total and the days are in it", sent.body.text.includes("38.5 hours (Mon 8 · Tue 8"), true);
  is("it asks them to approve or send back at /seats",
    sent.body.text.includes("Approve them, or send them back with a note, at https://www.securejobva.com/seats"), true);
  is("and not at /admin or /hub", /\/admin|\/hub/.test(words(sent.body)), false);
  is("no staff copy", all.length, 1);

  await call(WAIT({ again: true }));
  is("sent again says so", sent.body.subject, "Maricel's hours for 21 to 27 September — sent again");
  is("and that it came back first", sent.body.text.includes("again, after they were sent back"), true);
  is("without guessing who sent it back", /your note/.test(sent.body.text), false);
}

/* ── a swap, heard back on (sql/107, F25, F19) ──────────────────────────── */
{
  const SW = (event, over) => ({
    type: "STATUS", event, table: "swap_requests",
    person: { name: "Dana Whitfield", email: "dana@rosehill.example" },
    record: Object.assign({ id: "s1", business: "Rosehill Plumbing", assistant: "Maricel Ordoñez",
      asked_on: "2026-09-25", reason: "We need mornings covered.", placement: "ongoing", reply: null }, over || {})
  });
  await call(SW("received"));
  is("the client hears their request arrived", sent.body.to, ["dana@rosehill.example"]);
  is("the subject says so", sent.body.subject, "We have your request for a different assistant");
  is("their reason is quoted back", sent.body.text.includes("We need mornings covered."), true);
  is("on a working placement it says billing carries on, as the page does",
    sent.body.text.includes("keeps working and you keep being billed as normal"), true);

  await call(SW("received", { placement: "matched" }));
  is("F19: before she has started, it says nothing about billing or working",
    /billed|keeps working/.test(words(sent.body)), false);

  /* A trial is only "working" once its first day has come, on Central's
     clock — the page calls one that has not "She has not started". */
  await call(SW("received", { placement: "trial", started_on: "2099-01-05" }));
  is("F19: a trial whose first day is ahead says nothing about billing or working",
    /billed|keeps working/.test(words(sent.body)), false);
  await call(SW("received", { placement: "trial", started_on: "2026-09-01" }));
  is("a trial that has started says billing carries on",
    sent.body.text.includes("keeps working and you keep being billed as normal"), true);
  await call(SW("received", { placement: "trial" }));
  is("a trial with no start date in the payload claims nothing",
    /billed|keeps working/.test(words(sent.body)), false);

  await call(SW("resolved", { reply: "We have two candidates on mornings; a shortlist follows Monday." }));
  is("resolved reaches the client", sent.body.to, ["dana@rosehill.example"]);
  is("and quotes what we told them", sent.body.text.includes("a shortlist follows Monday"), true);
  is("in the HTML too", sent.body.html.includes("a shortlist follows Monday"), true);

  await call(SW("resolved"));
  is("with no note it makes no outcome up", /Here is what we said/.test(sent.body.text), false);
  is("and asks them to reply if they have not heard", sent.body.text.includes("If you have not heard from us"), true);

  for (const ev of ["received", "resolved"]) {
    await call(SW(ev));
    is(ev + ": one email, never to the assistant or staff",
      [all.length, /maricel@/.test(sent.body.to.join()), STAFF.test(sent.body.to.join())], [1, false, false]);
  }
  await call(SW("resolved", { reply: "<img src=x onerror=alert(1)>" }));
  is("a typed reply is escaped in the HTML", sent.body.html.includes("<img"), false);
}

/* ── kept on, and ended (sql/108, 109, F26, F27) ────────────────────────── */
{
  const KEPT = {
    type: "STATUS", event: "arrived", table: "placements",
    person: { name: "Dana Whitfield", email: "dana@rosehill.example" },
    record: { id: "p1", moment: "kept_on", business: "Rosehill Plumbing", assistant: "Maricel Ordoñez",
      started_on: "2026-09-07", trial_weeks: 2 }
  };
  const k = await call(KEPT);
  is("a client keeping her on reaches staff", [k.code, sent && sent.body.to], [200, ["david@example.com", "bryant@example.com"]]);
  is("the subject says who kept whom", sent.body.subject, "Kept on — Rosehill Plumbing are keeping Maricel Ordoñez");
  is("reply reaches the client", sent.body.reply_to, "dana@rosehill.example");
  is("the start is in it", sent.body.text.includes("Started: 7 September 2026"), true);
  const other = await call({ ...KEPT, record: { ...KEPT.record, moment: "poked" } });
  is("another moment is skipped", [other.code, all.length], [200, 0]);

  const END = (over) => ({
    type: "STATUS", event: "ended", table: "placements",
    person: { name: "Dana Whitfield", email: "dana@rosehill.example" },
    record: Object.assign({ id: "p1", business: "Rosehill Plumbing", assistant: "Maricel Ordoñez",
      ended_on: "2026-10-02" }, over || {})
  });
  await call(END());
  is("an ended placement reaches the client", sent.body.to, ["dana@rosehill.example"]);
  is("the subject names her", sent.body.subject, "Placement ended — Maricel Ordoñez");
  is("it names the day it was recorded as ending",
    sent.body.text.includes("as ended on 2 October 2026"), true);
  is("and that the statement stays at /pay", sent.body.text.includes("/pay"), true);
  is("and promises nothing about money", /refund|owe|balance|due/i.test(sent.body.text), false);
  await call(END({ ended_on: null }));
  is("no date still reads as a sentence", /ended on \.|on undefined/.test(sent.body.text), false);

  /* Called off before her first day (109's 'ended before starting'):
     never_started, ended_on null. It must not say she worked and stopped. */
  await call(END({ ended_on: null, never_started: true }));
  is("a placement that never started reaches the client", sent.body.to, ["dana@rosehill.example"]);
  is("its subject says closed, not ended", sent.body.subject, "Placement closed — Maricel Ordoñez");
  is("it says it will not go ahead and has been closed",
    sent.body.text.includes("The placement with Maricel Ordoñez at Rosehill Plumbing will not go ahead, and we have closed it."), true);
  is("and prints no 'ended on' date", /ended on|as ended/.test(words(sent.body)), false);
  await call(END({ ended_on: "2026-10-02", never_started: true }));
  is("even a stray ended_on prints no date", /2 October 2026|ended on/.test(words(sent.body)), false);
  await call(END({ never_started: false }));
  is("never_started false is the ordinary ended copy",
    sent.body.text.includes("as ended on 2 October 2026"), true);
  is("the decided 'ended' still sends her nothing",
    (await call(PLACED("ended"))).code === 200 && all.length === 0, true);
}

/* ── leave, a changed answer (F44) ──────────────────────────────────────── */
{
  await call({ ...LEAVE, event: "decided", record: { ...LEAVE.record, status: "declined", previous: "approved" } });
  is("a changed answer says so first", sent.body.subject,
    "We have changed our answer — your leave for 14 September to 18 September is not approved");
  is("in the body too", sent.body.text.includes("We have changed our answer about your leave"), true);
  is("and that it is no longer approved", sent.body.text.includes("no longer approved"), true);
  await call({ ...LEAVE, event: "decided", record: { ...LEAVE.record, status: "approved", previous: "declined" } });
  is("the other way round", sent.body.text.includes("it is now approved"), true);
  await call({ ...LEAVE, event: "decided", record: { ...LEAVE.record, status: "approved", previous: null } });
  is("a first decision reads as before", sent.body.subject, "Your leave for 14 September to 18 September is approved");
  await call({ ...LEAVE, event: "decided", record: { ...LEAVE.record, status: "approved", previous: "approved" } });
  is("the same answer again is not called a change", /changed our answer/.test(sent.body.text), false);
}

/* ── the outbox giving up (sql/095) ─────────────────────────────────────── */
{
  const r = await call({ type: "STATUS", event: "arrived", table: "notify_outbox", person: {},
    record: { id: 41, count: 3, sources: "notify_decision, notify_swap", oldest: "2026-09-30T14:02:11.5+00:00" } });
  is("emails given up on reach staff", [r.code, sent && sent.body.to], [200, ["david@example.com", "bryant@example.com"]]);
  is("the subject counts them", sent.body.subject, "3 emails could not be sent");
  is("it says where they came from", sent.body.text.includes("notify_decision, notify_swap"), true);
  is("and the oldest", sent.body.text.includes("30 September 2026"), true);
  is("with no reply_to, there being no person", sent.body.reply_to, undefined);
  /* 095 gives up on a 400/405/413/422 at the first try, and those rows are
     counted here too, so "after ten tries" would be false for them. */
  is("it does not claim ten tries", /ten tries/.test(words(sent.body)), false);
  await call({ type: "STATUS", event: "arrived", table: "notify_outbox", person: {}, record: { count: 1 } });
  is("one is one email", sent.body.subject, "1 email could not be sent");
}

/* ── Resend's two kinds of 409 ─────────────────────────────────────────────
   concurrent_idempotent_requests: the same key still being worked on, which
   the next try answers — worth a retry. invalid_idempotent_request: the same
   key with a different body (the words, RESEND_FROM or NOTIFY_TO changed in
   a deploy mid-retry, or a first try went and its answer was lost), which
   every try is refused the same way — final. */
{
  const realFetch = globalThis.fetch;
  const with409 = (name) => async (url, opt) => {
    await realFetch(url, opt);
    return { ok: false, status: 409, text: async () => JSON.stringify({ statusCode: 409, name, message: "x" }) };
  };

  globalThis.fetch = with409("concurrent_idempotent_requests");
  const pc = await call(decided({ status: "approved" }));
  const sc = await call(WEEK);
  globalThis.fetch = realFetch;
  is("a concurrent 409 to a person asks for a retry", pc.code, 503);
  is("a concurrent 409 to staff asks for a retry", sc.code, 502);

  globalThis.fetch = with409("invalid_idempotent_request");
  const pi = await call(decided({ status: "approved" }));
  is("a conflicting 409 to a person is final: 200, told false",
    [pi.code, pi.body.told, pi.body.idempotency_conflict], [200, false, true]);
  const si = await call(WEEK);
  is("a conflicting 409 to staff is a logged 200, not a 502",
    [si.code, si.body.idempotency_conflict], [200, true]);
  const ai = await call(APPLICATION);
  is("on a row landing it is not retried either",
    [ai.code, ai.body.idempotency_conflict, ai.body.confirmed], [200, true, false]);
  is("and the applicant's copy is still tried after it", all.length, 2);
  globalThis.fetch = realFetch;

  /* Staff conflict, applicant's copy lost to an outage: the copy is still
     owed, so the outbox is asked back. */
  let k = 0;
  globalThis.fetch = async (url, opt) => {
    k++;
    await realFetch(url, opt);
    return k === 1
      ? { ok: false, status: 409, text: async () => '{"name":"invalid_idempotent_request"}' }
      : { ok: false, status: 503, text: async () => "unavailable" };
  };
  const mixed = await call(APPLICATION);
  globalThis.fetch = realFetch;
  is("a staff conflict with the copy lost to an outage still asks for a retry", mixed.code, 503);
}

console.log("");
console.log(bad ? bad + " FAILED" : "all passed");
console.log("");
process.exit(bad ? 1 : 0);