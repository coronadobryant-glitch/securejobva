/* Drives the real lead-guard code out of index.html against a mocked
   localStorage and a fetch we can make fail on demand. */
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const from = html.indexOf("  var QUEUE     =");
const to = html.indexOf("  function send() {");
if (from < 0 || to < 0) throw new Error("guard block not found");
const guard = html.slice(from, to);

// mocks
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
let mode = "fail";
const sent = [];
globalThis.fetch = async (url, opt) => {
  const body = JSON.parse(opt.body);
  if (mode === "network") throw new Error("offline");
  if (mode === "fail") return { ok: false, status: 503 };
  if (mode === "dead") return { ok: false, status: 400 };
  if (mode === "conflict") return { ok: false, status: 409 };
  sent.push(body);
  return { ok: true, status: 201 };
};

const CFG = { endpoint: "https://example.test/rest/v1/seat_requests", headers: { apikey: "k" } };
const api = new Function("CFG", guard + "\n return { park, drain, queueRead, post };")(CFG);

const wait = () => new Promise((r) => setTimeout(r, 30));
const qlen = () => api.queueRead().length;
let bad = 0;
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}  got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

console.log("\nlead guard\n");

// a failed submission is parked, not lost
mode = "fail";
api.park({ name: "Ada", email: "ada@example.com" });
is("failed submission is parked", qlen(), 1);

// it stays parked while the endpoint is still down
api.drain(); await wait();
is("stays parked while still failing", qlen(), 1);

// offline is transient too
mode = "network";
api.drain(); await wait();
is("network error keeps it parked", qlen(), 1);

// when the endpoint recovers it drains and clears
mode = "ok";
api.drain(); await wait();
is("drains when the endpoint recovers", qlen(), 0);
is("and the lead actually went", sent.length, 1);
is("with its details intact", sent[0].email, "ada@example.com");

// A duplicate primary key means the row is already there. That is the
// application arriving twice, not failing -- and calling it a failure is how
// somebody saw "one tap left" over an application already in the table.
mode = "conflict";
store.clear();
api.park({ name: "Dup", email: "dup@example.com" });
api.drain(); await wait();
is("a 409 counts as delivered", qlen(), 0);

// a permanently rejected row is kept, not silently dropped
mode = "dead";
api.park({ name: "Grace", email: "grace@example.com" });
api.drain(); await wait();
is("a 400 row is kept for a human", qlen(), 1);

// the cap holds
store.clear();
mode = "fail";
for (let i = 0; i < 30; i++) api.park({ name: "n" + i });
is("queue is capped at 20", qlen(), 20);
is("and keeps the newest", JSON.parse(store.get("sjva-queue-intake")).pop().body.name, "n29");

// expiry
store.clear();
store.set("sjva-queue-intake", JSON.stringify([
  { at: Date.now() - 8 * 24 * 60 * 60 * 1000, body: { name: "old" } },
  { at: Date.now(), body: { name: "new" } }
]));
is("rows older than a week are dropped", api.queueRead().map((r) => r.body.name), ["new"]);

// storage being unavailable must never throw into the page
globalThis.localStorage = {
  getItem() { throw new Error("blocked"); },
  setItem() { throw new Error("blocked"); },
  removeItem() { throw new Error("blocked"); }
};
let threw = null;
try { api.park({ name: "x" }); api.drain(); } catch (e) { threw = e.message; }
is("survives storage being blocked", threw, null);


/* ── a refusal is not a failure ─────────────────────────────────────────────
   027 refuses a second application while one is live, and refuses another for
   three months after a decline. Both come back 400, which post() used to read
   as "dead" — and "dead" parks the row in the queue and tells the applicant
   "we saved it and will keep trying".

   That is a promise nobody can keep: the rule will refuse the retry too, so
   the queue would carry the row until it expired while the person waited for
   an application that was never going to arrive. These drive the real post()
   out of careers.html. */
{
  const careers = readFileSync("careers.html", "utf8");
  const at = careers.indexOf("  function post(d) {");
  if (at < 0) throw new Error("careers.html: post() not found");
  const end = careers.indexOf("\n  }", careers.indexOf('return "retry"; }); /* offline', at));
  const src = careers.slice(at, end + 4);

  let reply = { ok: true, status: 201, body: "" };
  const post = new Function("CFG", "hdrs", "fetch",
    src + "\nreturn post;")(
    { endpoint: "https://example.test/rest/v1/applications" },
    () => ({}),
    async () => ({
      ok: reply.ok,
      status: reply.status,
      text: async () => reply.body
    })
  );

  const refusal = JSON.stringify({
    code: "P0001",
    message: "You applied before and were not taken forward that time. You are welcome to apply again from 12 November 2026.",
    hint: "sjva-one-application"
  });

  reply = { ok: true, status: 201, body: "" };
  is("a saved application is ok", await post({}), "ok");

  reply = { ok: false, status: 409, body: "" };
  is("a duplicate row is still ok", await post({}), "ok");

  reply = { ok: false, status: 503, body: "" };
  is("a server wobble is retried", await post({}), "retry");

  reply = { ok: false, status: 400, body: '{"code":"PGRST204","message":"no such column"}' };
  is("a broken payload is still dead", await post({}), "dead");

  reply = { ok: false, status: 400, body: refusal };
  const refused = await post({});
  is("a refusal is not dead", typeof refused === "object" && !!refused.refused, true);
  is("and carries the words a person reads",
    refused.refused.indexOf("12 November 2026") > -1, true);
  is("and never says it will keep trying",
    /keep trying|saved it/i.test(refused.refused), false);

  reply = { ok: false, status: 400, body: "not json at all" };
  is("an unreadable body falls back to dead", await post({}), "dead");
}

/* ── sql/101: the boxes are asked for by the database too ──────────────────
   An application without the 18+ and consent answers is refused with
   sjva-consent-needed. post() must read that as a refusal (never parked —
   the retry would be refused the same way) and refused() must send her back
   to the step with the two boxes and say so under them, rather than ending
   on the "we could not take this one" screen with no way to tick anything. */
{
  const careers = readFileSync("careers.html", "utf8");
  const lift = (name) => {
    const a = careers.indexOf("  function " + name + "(");
    if (a < 0) throw new Error("careers.html: " + name + "() not found");
    let d = 0, i = careers.indexOf("{", a);
    for (; i < careers.length; i++) {
      if (careers[i] === "{") d++;
      else if (careers[i] === "}") { d--; if (!d) return careers.slice(a, i + 1); }
    }
    throw new Error("careers.html: unbalanced " + name);
  };

  const at = careers.indexOf("  function post(d) {");
  const end = careers.indexOf("\n  }", careers.indexOf('return "retry"; }); /* offline', at));
  const post = new Function("CFG", "hdrs", "fetch", "hasConsent", "withoutConsent",
    careers.slice(at, end + 4) + "\nreturn post;")(
    { endpoint: "https://example.test/rest/v1/applications" },
    () => ({}),
    async () => ({
      ok: false, status: 400,
      text: async () => JSON.stringify({
        code: "P0001",
        message: "Please tick both boxes — that you are 18 or older, and that you agree to how we use your details — then send it again.",
        hint: "sjva-consent-needed"
      })
    }),
    () => true, (d) => d
  );
  const v = await post({ name: "Ana" });
  is("a consent refusal is a refusal, not dead", !!(v && v.refused), true);
  is("and keeps its hint", v && v.hint, "sjva-consent-needed");

  const els = {};
  const el = (id) => (els[id] = els[id] || { id, textContent: "", innerHTML: "" });
  let shown = null, finished = null;
  const refused = new Function("show", "LAST", "document", "said", "say", "mark", "finish",
    lift("refused") + "\nreturn refused;")(
    (n) => { shown = n; }, 5,
    { getElementById: el },
    (t, f) => f, (s) => s, () => {}, (m) => { finished = m; }
  );
  refused(v, { name: "Ana" });
  is("she is sent back to the step with the boxes", shown, 4);
  is("the reason is written under them", el("err-agree").textContent.indexOf("tick both boxes") > -1, true);
  is("and the dialog does not end on a dead screen", finished, null);
  is("payload without the answers: both boxes are cleared, so the line is true",
     [els["ap-adult"].checked, els["ap-consent"].checked], [false, false]);

  /* The payload said yes to both and was refused anyway: the fault is in
     what the page read, not in her, so telling her to tick boxes she has
     ticked would loop for ever. She gets the handoff and the email button. */
  shown = null; finished = null;
  el("ap-adult").checked = true; el("ap-consent").checked = true;
  el("err-agree").textContent = "";
  refused(v, { name: "Ana", adult_confirmed: true, privacy_consent_text: "I agree." });
  is("a payload that said yes to both ends on the handoff", finished, "handoff");
  is("and is not sent back to the boxes", shown, null);
  is("and nothing asks her to tick what she ticked", el("err-agree").textContent, "");
  is("the handoff says what happened", el("apply-done-p").textContent.indexOf("You ticked both boxes") === 0, true);

  /* A blank consent sentence (a label the page could not read) is not a yes. */
  shown = null; finished = null;
  refused(v, { name: "Ana", adult_confirmed: true, privacy_consent_text: "  " });
  is("a blank consent sentence goes back to the boxes", shown, 4);
}

/* ── contact: only an outage promises a resend ───────────────────────────────
   "dead" is a 4xx the database will repeat for the same payload, so the
   screen after it must be the email one, not "it goes by itself". */
{
  const contact = readFileSync("contact.html", "utf8");
  is("contact: the kept screen needs a retry, not just a park",
     /var kept = v === "retry" && parkedIt;/.test(contact), true);
}

/* ── the contact form keeps a message that did not send ─────────────────────
   contact.html had no queue: a failed send left an "email it instead" link,
   which on most phones opens nothing, and the message was gone. These drive
   its real post(), park() and drain(). */
{
  const contact = readFileSync("contact.html", "utf8");
  const from = contact.indexOf("  function post(d) {");
  const to = contact.indexOf('  var btn = document.getElementById("c-send");');
  if (from < 0 || to < 0) throw new Error("contact.html: guard block not found");

  const cstore = new Map();
  const ls = {
    getItem: (k) => (cstore.has(k) ? cstore.get(k) : null),
    setItem: (k, v) => cstore.set(k, String(v)),
    removeItem: (k) => cstore.delete(k)
  };
  let reply = { status: 503, body: "" };
  const got = [];
  const fakeFetch = async (url, opt) => {
    if (reply === "network") throw new Error("offline");
    if (reply.status < 300) got.push(JSON.parse(opt.body));
    return { ok: reply.status < 300, status: reply.status, text: async () => reply.body };
  };
  const c = new Function("ENDPOINT", "HEADERS", "fetch", "localStorage",
    contact.slice(from, to) + "\nreturn { post, park, drain, queueRead };")(
    "https://example.test/rest/v1/contact_messages", {}, fakeFetch, ls);
  const clen = () => c.queueRead().length;

  reply = { status: 503, body: "" };
  is("contact: a 503 is a retry", await c.post({}), "retry");
  reply = "network";
  is("contact: no answer is a retry", await c.post({}), "retry");
  reply = { status: 429, body: "" };
  is("contact: 429 is a retry", await c.post({}), "retry");
  reply = { status: 400, body: '{"code":"PGRST204"}' };
  is("contact: a broken payload is dead", await c.post({}), "dead");
  reply = { status: 400, body: '{"message":"no","hint":"sjva-address"}' };
  is("contact: a refusal carries its hint", (await c.post({})).hint, "sjva-address");

  is("contact: park says it kept the message", c.park({ name: "Rosa", message: "hola" }), true);
  is("contact: and it is there", clen(), 1);
  reply = { status: 503, body: "" };
  c.drain(); await wait();
  is("contact: stays parked while still failing", clen(), 1);
  reply = { status: 201, body: "" };
  c.drain(); await wait();
  is("contact: drains when the endpoint recovers", clen(), 0);
  is("contact: and the message actually went", got.length && got[0].message, "hola");

  cstore.clear();
  c.park({ name: "Ten" });
  reply = { status: 400, body: '{"message":"too many","hint":"sjva-throttled"}' };
  c.drain(); await wait();
  is("contact: the hourly limit keeps it for later", clen(), 1);
  reply = { status: 400, body: '{"message":"bad","hint":"sjva-address"}' };
  c.drain(); await wait();
  is("contact: any other refusal is done with", clen(), 0);

  cstore.clear();
  for (let i = 0; i < 30; i++) c.park({ name: "m" + i });
  is("contact: queue is capped at 20", clen(), 20);

  cstore.clear();
  cstore.set("sjva-queue-contact", JSON.stringify([
    { at: Date.now() - 8 * 24 * 60 * 60 * 1000, body: { name: "old" } },
    { at: Date.now(), body: { name: "new" } }
  ]));
  is("contact: rows older than a week are dropped", c.queueRead().map((r) => r.body.name), ["new"]);

  /* Two drains at once — the load-time one and the "online" event — must not
     send a row twice, and a message parked while one runs must survive it. */
  cstore.clear();
  got.length = 0;
  c.park({ name: "Once", message: "one" });
  reply = { status: 201, body: "" };
  c.drain(); c.drain();
  c.park({ name: "Later", message: "two" });
  await wait();
  is("contact: a second drain does not send it twice", got.filter((b) => b.name === "Once").length, 1);
  is("contact: a row parked mid-drain is kept", c.queueRead().map((r) => r.body.name), ["Later"]);

  const blocked = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); }
  };
  const c2 = new Function("ENDPOINT", "HEADERS", "fetch", "localStorage",
    contact.slice(from, to) + "\nreturn { park, drain };")("x", {}, fakeFetch, blocked);
  let threw = null, keptIt = null;
  try { keptIt = c2.park({ name: "x" }); c2.drain(); } catch (e) { threw = e.message; }
  is("contact: survives storage being blocked", threw, null);
  is("contact: and does not claim it kept the message", keptIt, false);
}

/* ── the booking link carries the request ───────────────────────────────────
   cal.com fills name, email and notes from the address and keeps metadata[]
   on the booking, so staff can match a booking to its request. */
{
  const index = readFileSync("index.html", "utf8");
  const a = index.indexOf("  function booking(d) {");
  if (a < 0) throw new Error("index.html: booking() not found");
  const b = index.indexOf("\n  }", a);
  const booking = new Function("CFG", index.slice(a, b + 4) + "\nreturn booking;")(
    { scheduler: "https://cal.com/securejobva.com/20min" });
  const u = new URL(booking({ id: "abc-1", name: "Jo Doe", email: "jo@x.com", company: "A&B \"Co\"" }));
  is("booking: name is filled in", u.searchParams.get("name"), "Jo Doe");
  is("booking: email is filled in", u.searchParams.get("email"), "jo@x.com");
  is("booking: the company survives an ampersand", u.searchParams.get("notes"), "Seat request for A&B \"Co\"");
  is("booking: the request id rides along", u.searchParams.get("metadata[seat_request]"), "abc-1");
  is("booking: no raw quote can close the href", /"/.test(booking({ company: "\"x\"" })), false);
}

console.log("");
console.log(bad ? bad + " FAILED" : "all passed");
console.log("");
process.exit(bad ? 1 : 0);
