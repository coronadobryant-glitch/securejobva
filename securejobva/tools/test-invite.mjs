/* Drives api/invite.js without Supabase or a deploy.

   It had no test at all. That mattered less for the obvious branches than for
   the one line nobody would notice breaking: redirect_to is a QUERY parameter
   on /auth/v1/otp, and a copy of it in the JSON body is silently ignored.
   Move it into the body — or nest it under options, the way supabase-js does
   and the way status.mjs records costing two days — and every client invite
   still sends, still signs them in, and lands them on the Supabase Site URL
   instead of /seats. Nothing errors. Every check stays green. This is the
   check that goes red.

   The rest is the contract the trigger in sql/ relies on: refusals are
   refusals, and a failure to send is answered 200 and logged. Nothing retries
   this call either way — the trigger in 040 is a pg_net post, which fires once
   and keeps the answer — so a 200 is about what net._http_response reads as a
   failure, not about stopping a retry loop.

   Everything is faked except the handler. Nothing is sent anywhere.

   Run: node tools/test-invite.mjs */
import handler from "../api/invite.js";

let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "FAIL") + "  " + label +
    (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
};
const ok = (label, cond, note) => {
  if (!cond) bad++;
  console.log("  " + (cond ? "ok  " : "FAIL") + "  " + label + (note ? "  — " + note : ""));
};

function mockRes() {
  const out = { code: 0, body: null };
  out.status = (c) => { out.code = c; return out; };
  out.json = (b) => { out.body = b; return out; };
  return out;
}

/* What the handler asked the auth server for. otpStatus decides the answer;
   otpThrows stands in for the network dropping. */
let calls = [];
let otpStatus = 200;
let otpThrows = false;
globalThis.fetch = async (url, opt) => {
  calls.push({ url: String(url), method: opt && opt.method, headers: (opt && opt.headers) || {},
    body: opt && opt.body ? JSON.parse(opt.body) : null });
  if (otpThrows) throw new Error("socket hang up");
  return { ok: otpStatus < 300, status: otpStatus, text: async () => "refused" };
};

/* The log line on a failure is read too — see the last block. */
let logged = [];
const realError = console.error;
console.error = (...a) => { logged.push(a.map(String).join(" ")); };

Object.assign(process.env, {
  WEBHOOK_SECRET: "shh",
  SITE_URL: "https://www.securejobva.com"
});

const SITE = "https://www.securejobva.com";
const INVITE = { email: "owner@northwind.example", business: "Northwind" };

const call = async (body, headers, method) => {
  calls = [];
  logged = [];
  const res = mockRes();
  await handler({ method: method || "POST", headers: headers || { "x-webhook-secret": "shh" }, body }, res);
  return res;
};

console.log("\ninvite\n");

/* ── refuses anything it should not act on ─────────────────────────────── */

is("GET is refused", (await call(INVITE, {}, "GET")).code, 405);
is("a wrong secret is refused", (await call(INVITE, { "x-webhook-secret": "nope" })).code, 401);
is("a missing secret is refused", (await call(INVITE, {})).code, 401);
is("…and nothing was sent for any of them", calls.length, 0);

{
  const keep = process.env.WEBHOOK_SECRET;
  delete process.env.WEBHOOK_SECRET;
  const r = await call(INVITE, { "x-webhook-secret": "" });
  is("no WEBHOOK_SECRET on the server refuses rather than defaulting open", r.code, 500);
  is("…and sends nothing", calls.length, 0);
  process.env.WEBHOOK_SECRET = keep;
}

/* A body that is not JSON is the caller's mistake, and answering it with a
   crash hands Vercel a 500 and a stack trace instead of a reason. */
{
  let r, threw = null;
  try { r = await call("{not json", undefined); } catch (e) { threw = e; }
  ok("a body that is not JSON gets a 400, not a crash", !threw && r && r.code === 400,
    threw ? "threw " + threw.message : "answered " + (r && r.code));
  is("…and sends nothing", calls.length, 0);
}

/* ── a client with no address is a normal state, not a failure ─────────── */

for (const [label, body] of [
  ["no email field", { business: "Northwind" }],
  ["a blank email", { email: "   " }],
  ["an address with nothing before the @", { email: "@northwind.example" }],
  /* The one the shared rule (073, 092) added: no dot after the @. The old
     check here only asked for something before the @, so this one went on to
     Supabase as an invite. Without it, loosening the rule back would pass. */
  ["an address with no dot after the @", { email: "owner@northwind" }]
]) {
  const r = await call(body);
  is(label + ": answered 200, because it is not a failure", r.code, 200);
  ok(label + ": says it skipped, and why", !!(r.body && r.body.skipped));
  is(label + ": nothing sent", calls.length, 0);
}

/* ── the invite itself ─────────────────────────────────────────────────── */

otpStatus = 200;
{
  const r = await call(INVITE);
  is("an invite is answered 200", r.code, 200);
  is("…and reports one sent", r.body && r.body.sent, 1);
  is("exactly one request to the auth server", calls.length, 1);
  const c = calls[0] || { url: "", headers: {}, body: {} };
  const u = new URL(c.url);

  is("it goes to /auth/v1/otp", u.pathname, "/auth/v1/otp");
  is("as a POST", c.method, "POST");

  /* The line this file exists for. */
  is("redirect_to is in the QUERY, pointing at /seats", u.searchParams.get("redirect_to"), SITE + "/seats");
  ok("redirect_to is not in the body, where the endpoint ignores it",
    !("redirect_to" in (c.body || {})) && !(c.body && c.body.options && "redirect_to" in c.body.options) &&
    !(c.body && c.body.options && "emailRedirectTo" in c.body.options));

  is("create_user is true — the account does not exist yet", c.body && c.body.create_user, true);
  is("the address is the one on the client, trimmed", c.body && c.body.email, INVITE.email);

  /* The publishable key and nothing stronger: the file's whole argument is
     that a web-facing function does not hold the service role. */
  const key = c.headers.apikey || "";
  ok("it authenticates with the publishable key", /^sb_publishable_|^eyJ/.test(key));
  ok("never with a service-role or secret key", !/^sb_secret_/.test(key) && !/service_role/i.test(key));
  is("Authorization carries the same key", c.headers.Authorization, "Bearer " + key);
}

{
  const r = await call({ email: "  owner@northwind.example  " });
  is("whitespace around the address is trimmed before sending", calls[0] && calls[0].body.email, "owner@northwind.example");
  is("…and it still sends", r.body && r.body.sent, 1);
}

{
  const keep = process.env.SITE_URL;
  process.env.SITE_URL = "https://preview.example";
  await call(INVITE);
  is("SITE_URL decides where the link lands", new URL(calls[0].url).searchParams.get("redirect_to"),
    "https://preview.example/seats");
  process.env.SITE_URL = keep;
}

{
  const r = await call(JSON.stringify(INVITE));
  is("a body that arrives as a JSON string is read the same", r.body && r.body.sent, 1);
}

/* ── a failure is logged and answered 200 ──────────────────────────────── */

otpStatus = 429;
{
  const r = await call(INVITE);
  is("the auth server refusing is still answered 200", r.code, 200);
  is("…reporting nothing sent", r.body && r.body.sent, 0);
  ok("…and it is logged, so somebody can chase it", logged.length > 0);
  /* P17: the log is Vercel's, readable by anyone with the project, and kept.
     The address is a client's; the status is what is needed to chase it. */
  ok("the log line does not carry the client's address",
    logged.every((l) => l.indexOf(INVITE.email) < 0), logged[0]);
}
otpStatus = 200;

otpThrows = true;
{
  let r, threw = null;
  try { r = await call(INVITE); } catch (e) { threw = e; }
  ok("the network dropping does not throw out of the handler", !threw, threw && threw.message);
  is("…it is answered 200 with nothing sent", r && [r.code, r.body && r.body.sent], [200, 0]);
}
otpThrows = false;

console.error = realError;
console.log(bad ? "\n" + bad + " failed\n" : "\nevery invite lands on /seats\n");
process.exit(bad ? 1 : 0);
