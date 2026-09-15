/* Reads sql/cleanup-paying-half.sql with Postgres's own parser, including the
 * part of it that is commented out.
 *
 * That block is the reason this exists. It deletes a business and everything
 * billed through it, it ships disarmed inside /* ... *\/, and it cannot be run
 * from this machine — there is no psql here, PostgREST does not run arbitrary
 * SQL, and the service role key is a REST key rather than a database password.
 * So the one statement in the file that can do damage was, for a long while,
 * the one statement nothing had ever read.
 *
 * It was executed once, on 14 September 2026, in the Supabase SQL editor,
 * armed on a throwaway client by way of sql/rehearse-cleanup.sql. That pass
 * settled that it runs; it did not exercise the delete order or the RLS
 * policies, and both files say so at length. Nothing here reruns it — this
 * tool still never touches the database.
 *
 * It was parsed once, on 11 September, with the SQL grammar. That is weaker
 * than it sounds. To the outer grammar a plpgsql body is a quoted string, so
 * `end if` left off, a keyword misspelt, or a RAISE with more % than arguments
 * all parse clean. libpg-query 18 exposes parsePlPgSQLSync — the server's own
 * plpgsql compiler, the same one that would reject the block at the moment you
 * pasted it — and that is what closes the gap.
 *
 * The controls at the end are not decoration. A checker that cannot fail says
 * "ok" about a file it never looked at, and each control here also asserts
 * that its own mutation landed, because a control that edits nothing is a line
 * that never ran.
 *
 * Nothing calls process.exit(), and that is deliberate. libpg-query's wasm
 * build keeps a libuv async handle alive for the life of the process, and
 * exiting while it is closing aborts — "Assertion failed: !(handle->flags &
 * UV_HANDLE_CLOSING)", exit 127 — rather than exiting 1. It is a race, not a
 * certainty: two runs in three. The paths that give up early are exactly the
 * ones that hit it, so a renamed block used to crash the checker one line
 * after it had correctly said the block was missing. Every path here returns
 * its exit code to the one line at the bottom instead, which sets
 * process.exitCode and lets the process end on its own.
 *
 * It also guards the two files that run it. sql/rehearse-cleanup.sql says how
 * to run the block once against a client with no children; it ships a mutation
 * behind the same markers, so it gets the same two questions: well formed, and
 * inert until somebody arms it.
 *
 * sql/rehearse-delete-order.sql is the one that tests the ORDER, by building a
 * placement with a week hanging off it and deleting it both ways round inside
 * a transaction it ends by raising. It gets four more questions, because it is
 * the only file here that ships a mutation switched ON — a probe insert whose
 * safety is entirely the BEGIN and ROLLBACK around it — and because its own
 * plpgsql has never been executed either.
 *
 * Nothing here touches the network, git or the database. Static grammar only:
 * it cannot tell you a column exists, only that the SQL naming it is
 * well formed.
 *
 * Run it from securejobva/, the project folder. NOT from the repo root: this
 * repository's root is the home directory one level up, and FILE below is
 * relative, so from up there it cannot find the file it checks. The one
 * dependency is pinned in package.json at that root — installed up there,
 * run from down here:
 *
 *   npm --prefix .. install        once
 *   node tools/check-cleanup.mjs   from securejobva/ */
import { readFileSync } from "node:fs";

let mod;
try { mod = await import("libpg-query"); }
catch { mod = {}; }
const { loadModule, parseSync, parsePlPgSQLSync } = mod;

const FILE = "sql/cleanup-paying-half.sql";

let failed = 0;
function ok(what, pass, note) {
  if (!pass) failed++;
  console.log("  " + (pass ? "ok    " : "FAIL  ") + what + (note ? "  — " + note : ""));
}

function parses(text, plpgsql) {
  try { return { ok: true, tree: (plpgsql ? parsePlPgSQLSync : parseSync)(text) }; }
  catch (e) { return { ok: false, why: String(e.message).split("\n")[0] }; }
}

async function main() {
  if (!parsePlPgSQLSync || !loadModule) {
    console.log("\n  libpg-query with a plpgsql parser is not installed.\n" +
      "  It is pinned in package.json at the repo root — the directory that\n" +
      "  contains securejobva/ — so install it there and run this from here:\n" +
      "      npm --prefix .. install\n" +
      "  17.7.4 and 17.5.6 ship the SQL grammar only; 18.x and 17.2.0 have both.");
    return 1;
  }
  await loadModule();

  let sql;
  try { sql = readFileSync(FILE, "utf8"); }
  catch (e) {
    console.log("\n  cannot read " + FILE + "\n  " + e.message +
      "\n  Run it from securejobva/, the project folder — not the repo" +
      "\n  root, which is the directory above it and is where this" +
      "\n  message comes from.");
    return 1;
  }

/* ── the file as it ships ────────────────────────────────────────────────── */

  console.log("\n  " + FILE + " as it ships");

  const shipped = parses(sql, false);
  ok("parses", shipped.ok, shipped.why);

  const kinds = (shipped.tree?.stmts || []).map((s) => Object.keys(s.stmt || {})[0]);
  ok("changes nothing — " + kinds.length + " statements, all SELECT",
    kinds.length > 0 && kinds.every((k) => k === "SelectStmt"),
    kinds.join(", ") || "none");

/* ── the block nobody had checked ────────────────────────────────────────── */

  console.log("\n  The removal block, armed");

  const OPEN = "do $do$", CLOSE = "$do$;";
  const a = sql.indexOf(OPEN), b = sql.indexOf(CLOSE, a);
  ok("found in the file", a >= 0 && b > a,
    a < 0 ? "no `" + OPEN + "` — has it been renamed?"
      : b < 0 ? "`" + OPEN + "` is there, the closing `" + CLOSE + "` is not"
        : undefined);
  if (a < 0 || b < 0) { console.log("\n  cannot check what is not there"); return 1; }
  const block = sql.slice(a, b + 5);

  const armed = parses(block, true);
  ok("compiles as plpgsql, not merely as a quoted string", armed.ok, armed.why ||
    block.split("\n").length + " lines through the server's own plpgsql parser");

/* The SQL inside a plpgsql body is held as text and not looked at until the
   statement first runs, so the compiler above says nothing about it. Pulling
   the statements back out of the tree and parsing each one is the other half:
   still no proof a column exists, but a typo in the shape of one is caught. */

  const queries = [], exprs = [];
  (function walk(n, isStmt) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach((x) => walk(x, isStmt));
    for (const [k, v] of Object.entries(n)) {
      if (k === "query" && typeof v === "string") (isStmt ? queries : exprs).push(v.replace(/\s+/g, " ").trim());
      else walk(v, k === "sqlstmt" ? true : k === "PLpgSQL_expr" ? isStmt : false);
    }
  })(armed.tree, false);

  let bad = 0;
  for (const q of queries) if (!parses(q, false).ok) bad++;
  ok("every statement it runs is well formed SQL — " + queries.length + " of them",
    queries.length > 0 && bad === 0, bad ? bad + " did not parse" : undefined);

/* The rest of what the body holds as text: the IF conditions, the RAISE
   arguments, the initial value of by_id. Same treatment, wrapped in a select
   so the SQL grammar will take them. */

  let badx = 0;
  for (const e of exprs) if (!parses("select (" + e + ")", false).ok) badx++;
  ok("and every expression between them — " + exprs.length + " of those",
    exprs.length > 0 && badx === 0, badx ? badx + " did not parse" : undefined);

/* Children before parents is the whole correctness argument for this block:
   033 gave timesheets.placement_id a plain reference with no cascade, so the
   wrong order does not half-work, it raises. Printed rather than asserted —
   the order that is right is a thing to read against teardown() in
   walk-paying.mjs, not a string to pin a test to. */

  const order = queries.filter((q) => /^delete/i.test(q))
    .map((q) => (q.match(/^delete from (?:public\.)?(\w+)/i) || [])[1]);
  console.log("\n  Deletes, in the order it runs them:\n    " + order.join("\n    "));
  console.log("\n  teardown() in walk-paying.mjs — which HAS run against this\n" +
    "  database — also removes placement_billing and placement_pay by hand\n" +
    "  between the weeks and the placements. Both are `on delete cascade`\n" +
    "  (032-clients-and-placements.sql:154 and :160), so the block above is\n" +
    "  right to leave them; it is leaning on a cascade in a file whose own\n" +
    "  comment says not to.");

/* ── the check can fail ──────────────────────────────────────────────────── */

  console.log("\n  Controls — the parser is shown a broken block and must say so");

  function control(what, from, to) {
    const broken = block.replace(from, to);
    if (broken === block) {
      failed++;
      console.log("  FAIL  " + what + "  — the control edits nothing; the block has changed under it");
      return;
    }
    const r = parses(broken, true);
    ok(what, !r.ok, r.ok ? "PARSED CLEAN, which it must not" : r.why);
  }

  control("a misspelt keyword", "raise notice", "raisee notice");
  control("a missing semicolon",
    "where client_id = by_id;\n\n  -- The business", "where client_id = by_id\n\n  -- The business");
  control("RAISE with more % than arguments", "No email sent.'", "No email sent. %'");
  control("a declaration with no type", "n_pay   integer;", "n_pay;");
  control("an IF left unclosed", "  end if;\n", "\n");

/* One thing it will not catch, said out loud so nobody reads the run above as
   more than it is: an identifier that exists nowhere. plpgsql leaves unknown
   names in an expression for the SQL engine to resolve when the statement
   runs, so `if no_such_var is null` compiles here and fails only in the
   editor. The same is true of every table and column name in the block — for
   those, tools/status.mjs is what reads the live database. */

  const ghost = parses(block.replace("if by_id is null", "if no_such_var is null"), true);
  ok("an undeclared variable is NOT caught, as expected", ghost.ok,
    "runtime resolves it; static grammar cannot");

/* ── the file that points back at this one ───────────────────────────────── */

/* rehearse-cleanup.sql is how the block above gets run once, against a client
   with no children. It carries no plpgsql of its own on purpose — a second
   copy of the block is a copy that drifts, and this tool reads only the
   original — but it does ship a mutation behind the same /* ... *\/ markers,
   so it gets the same two questions the file above gets: well formed, and
   inert until somebody arms it. */

  const REHEARSAL = "sql/rehearse-cleanup.sql";
  console.log("\n  " + REHEARSAL);

  let reh = null;
  try { reh = readFileSync(REHEARSAL, "utf8"); } catch { /* reported below */ }

  if (reh === null) {
    ok("is there", false,
      "missing — step B of it is the only written record of how to arm the block");
  } else {
    const rp = parses(reh, false);
    ok("parses", rp.ok, rp.why);

    const rk = (rp.tree?.stmts || []).map((s) => Object.keys(s.stmt || {})[0]);
    ok("changes nothing as it ships — " + rk.length + " statements, all SELECT",
      rk.length > 0 && rk.every((k) => k === "SelectStmt"), rk.join(", ") || "none");

    /* Its step A says to arm it by deleting the two markers. Doing exactly
       that here is the only way to know the instruction still matches the
       file it describes. */
    const armed2 = reh.replace("/*\ninsert", "insert")
                      .replace("returning id, name;\n*/", "returning id, name;");
    const ra = parses(armed2, false);
    const rak = (ra.tree?.stmts || []).map((s) => Object.keys(s.stmt || {})[0]);
    ok("and its step A arms to an insert when the two markers go",
      ra.ok && armed2 !== reh && rak[0] === "InsertStmt",
      ra.why || (armed2 === reh ? "the markers it names are not there" : rak.join(", ")));
  }


/* ── the file that proves the order the block deletes in ─────────────────── */

/* rehearse-delete-order.sql builds a placement with a week hanging off it and
   deletes it both ways round, inside a transaction it ends by RAISING. Unlike
   the rehearsal above it carries plpgsql of its own — it has to, because the
   thing under test is an ordering that only a live foreign key can judge — so
   it gets the plpgsql compiler as well as the grammar.

   Its shipped form is the interesting one. It is the only file here that
   ships a mutation switched ON: step 1 inserts a client to find out whether
   this editor honours rollback at all. That is safe only for as long as the
   insert stays bracketed by BEGIN and ROLLBACK, so that is asserted rather
   than assumed. */

  const ORDER = "sql/rehearse-delete-order.sql";
  console.log("\n  " + ORDER);

  let ord = null;
  try { ord = readFileSync(ORDER, "utf8"); } catch { /* reported below */ }

  if (ord === null) {
    ok("is there", false,
      "missing — it is the only argument that the delete order is necessary");
  } else {
    const op = parses(ord, false);
    ok("parses", op.ok, op.why);

    const stmts = (op.tree?.stmts || []).map((s) => s.stmt || {});
    const kinds = stmts.map((s) => Object.keys(s)[0]);
    const trans = stmts.map((s) => s.TransactionStmt?.kind).filter(Boolean);

    /* The probe's insert must sit between a BEGIN and a ROLLBACK, and there
       must be no other mutation anywhere in the shipped file. */
    const iAt = kinds.indexOf("InsertStmt");
    const bracketed =
      iAt > 0 &&
      kinds[iAt - 1] === "TransactionStmt" &&
      kinds[iAt + 1] === "TransactionStmt" &&
      /BEGIN|START/.test(String(stmts[iAt - 1].TransactionStmt?.kind)) &&
      /ROLLBACK/.test(String(stmts[iAt + 1].TransactionStmt?.kind));
    ok("the one mutation it ships is bracketed by BEGIN and ROLLBACK",
      bracketed, trans.join(", ") || "no transaction control at all");

    ok("and it ships nothing else that writes — " + kinds.length + " statements",
      kinds.filter((k) => !["SelectStmt", "TransactionStmt", "InsertStmt"].includes(k)).length === 0 &&
      kinds.filter((k) => k === "InsertStmt").length === 1,
      kinds.join(", ") || "none");

    /* Step 2 arms the same way its siblings do. Perform the instruction. */
    const armed3 = ord.replace("/*\ndo $do$", "do $do$")
                      .replace("$do$;\n*/", "$do$;");
    const oa = parses(armed3, false);
    const oak = (oa.tree?.stmts || []).map((s) => Object.keys(s.stmt || {})[0]);
    ok("and its step 2 arms to a DO block when the two markers go",
      oa.ok && armed3 !== ord && oak.includes("DoStmt"),
      oa.why || (armed3 === ord ? "the markers it names are not there" : oak.join(", ")));

    /* The block inside it has never been executed either, so the compiler is
       the only thing standing between it and a syntax error discovered at the
       paste — the same gap 12 September closed for the file above. */
    const oblock = armed3.slice(armed3.indexOf("do $do$"),
                               armed3.indexOf("$do$;") + "$do$;".length);
    const oc = parses(oblock, true);
    ok("its plpgsql compiles", oc.ok, oc.why);

    /* It must always end by raising, or a careless run commits the graph it
       built — a client left holding a live placement, which is the failure
       the whole file is shaped to avoid. */
    /* Bound to the success path specifically. An earlier `raise exception` on
       a failure path satisfies "contains a raise" while the block still falls
       off the end and commits, so the match has to reach from the keyword to
       the message it carries, with nothing but whitespace between them. */
    const proves = /raise\s+exception\s+'ORDER PROVED/.test(oblock);
    const commits = /^\s*(commit|end\s+transaction)\s*;/im.test(oblock);
    ok("its success path raises rather than returning",
      proves && !commits,
      proves ? (commits ? "it commits somewhere" : "ORDER PROVED is the message of a RAISE EXCEPTION")
             : "ORDER PROVED is not raised — the block can reach its end and commit");
  }


  console.log("\n" + (failed
    ? "  " + failed + " FAILED"
    : "  the block is well formed as SQL and as plpgsql. This proves it will not\n" +
      "  be rejected at the paste, not that it does the right thing — nothing\n" +
      "  here runs it. One pass on 14 September 2026 showed that it runs, on a\n" +
      "  bare client; the delete order and the RLS policies are still untested.\n" +
      "  Arm it on a row you can afford to be wrong about."));
  return failed ? 1 : 0;
}

process.exitCode = await main();
