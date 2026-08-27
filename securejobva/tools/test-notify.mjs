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

console.log("");
console.log(bad ? bad + " FAILED" : "all passed");
console.log("");
process.exit(bad ? 1 : 0);