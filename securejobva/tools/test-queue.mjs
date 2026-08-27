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

console.log("");
console.log(bad ? bad + " FAILED" : "all passed");
console.log("");
process.exit(bad ? 1 : 0);
