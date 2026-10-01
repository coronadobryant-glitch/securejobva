/* Every function /admin calls is called with the arguments the SQL declares.
   Offline: reads admin.html and the sql/ folder, and sends nothing.

   PostgREST finds a function by its name AND the names of the arguments in
   the body. A key spelt differently from the SQL — client_id for client,
   date for last_day — is not a type error anywhere: the page builds, the
   button draws, and the press answers 404 "could not find the function",
   which reads as "not switched on yet". tools/check.mjs already proves each
   name exists; this proves each call would find it.

   The new client, match, end, interview and outbox buttons (sql/095–111)
   all go through here, which is why it was written; every other rpc call on
   the page is held to the same rule.

   Run: node tools/test-admin-rpc-args.mjs */
import { readFileSync, readdirSync } from "node:fs";

const html = readFileSync("admin.html", "utf8");
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

/* The balanced {...} starting at i, skipping strings. */
function objectAt(src, i) {
  let depth = 0, q = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return null;
}

/* The keys written at the top level of an object literal. */
function topKeys(obj) {
  let flat = "", depth = 0, q = null;
  for (let j = 0; j < obj.length; j++) {
    const c = obj[j];
    if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; flat += '""'; continue; }
    if (c === "{" || c === "(" || c === "[") { depth++; if (depth === 1) flat += c; continue; }
    if (c === "}" || c === ")" || c === "]") { depth--; continue; }
    if (depth === 1) flat += c;
  }
  return [...flat.matchAll(/(?:^\{|,)\s*([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1]);
}

/* Each call: the name, and the body's keys. Two shapes on this page:
   api("rpc/x", { method: "POST", body: {...} }) and ivAct(btn, "rpc/x", {...}). */
const calls = [];
for (const m of js.matchAll(/"rpc\/([a-z_]+)"\s*,\s*\{/g)) {
  const start = m.index + m[0].length - 1;
  const obj = objectAt(js, start);
  if (!obj) continue;
  const b = obj.match(/\bbody\s*:\s*\{/);
  let keys;
  if (b && topKeys(obj).indexOf("body") > -1) {
    keys = topKeys(objectAt(obj, b.index + b[0].length - 1));
  } else if (topKeys(obj).indexOf("method") > -1) {
    continue; /* a body built elsewhere; nothing to read here */
  } else {
    keys = topKeys(obj);
  }
  calls.push({ name: m[1], keys });
}

/* What the newest definition of each function takes. */
const files = readdirSync("sql").filter((f) => /^\d{3}-.*\.sql$/.test(f)).sort();
const params = {};
for (const f of files) {
  const s = readFileSync("sql/" + f, "utf8");
  for (const m of s.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z_]+)\s*\(/gi)) {
    let depth = 0, j = m.index + m[0].length - 1, end = -1;
    for (; j < s.length; j++) {
      if (s[j] === "(") depth++;
      else if (s[j] === ")") { depth--; if (!depth) { end = j; break; } }
    }
    const inner = s.slice(m.index + m[0].length, end).replace(/--[^\n]*/g, "");
    const list = inner.split(",").map((p) => p.trim()).filter(Boolean).map((p) => ({
      name: p.split(/\s+/)[0].replace(/"/g, ""),
      optional: /\bdefault\b|=/i.test(p),
    }));
    params[m[1].toLowerCase()] = list;
  }
}

let ok = 0;
const fails = [];
const seen = new Set();
for (const c of calls) {
  const p = params[c.name];
  const label = c.name + "(" + c.keys.join(", ") + ")";
  if (!p) { fails.push(label + " — no migration defines public." + c.name); continue; }
  const names = p.map((x) => x.name);
  const unknown = c.keys.filter((k) => names.indexOf(k) < 0);
  const missing = p.filter((x) => !x.optional && c.keys.indexOf(x.name) < 0).map((x) => x.name);
  if (unknown.length || missing.length) {
    fails.push(label + " — the SQL takes (" + names.join(", ") + ")" +
      (unknown.length ? "; not a parameter: " + unknown.join(", ") : "") +
      (missing.length ? "; required and not sent: " + missing.join(", ") : ""));
    console.log("  FAIL  " + fails[fails.length - 1]);
    continue;
  }
  ok++;
  if (!seen.has(c.name)) console.log("  ok    " + label);
  seen.add(c.name);
}

/* The ones this run of fixes added, named so a refactor that drops a call
   is noticed rather than counted as fewer things to check. */
for (const n of ["create_client", "update_client", "resend_client_invite", "place_assistant",
                 "end_placement", "reschedule_placement_interview", "cancel_placement_interview",
                 "link_seat_request", "retry_notify"]) {
  if (!seen.has(n)) { fails.push("admin.html no longer calls " + n); console.log("  FAIL  admin.html no longer calls " + n); }
  else ok++;
}

console.log("");
if (fails.length) {
  console.log(fails.length + " failed of " + (ok + fails.length));
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
console.log(ok + " calls, every one with the arguments its function declares");
