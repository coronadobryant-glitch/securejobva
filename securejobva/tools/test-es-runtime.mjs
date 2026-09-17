/* The sentences the step forms build after the page has loaded.

   tools/build-es.mjs translates markup by walking text nodes, and it never
   steps inside a script block — a literal there may be a selector, a class
   name, or a track name the database reads in English. So every sentence
   index.html and careers.html write at runtime reached /es in English while
   the markup around them was Spanish: the step counter, every validation
   message, the confirmation at the end.

   They go through say() now, and build-es.mjs plants the Spanish in SAYS. This
   drives the real say() out of the real built pages rather than asserting
   about the dictionary, because the dictionary being right and the page using
   it are two different claims — and it was the second one that was false.

   Run: node tools/test-es-runtime.mjs */
import { readFileSync, existsSync } from "node:fs";
import { sayKeys, SAY_PAGES, SAY_COMPUTED } from "./lib-seg.mjs";

let bad = 0;
const is = (label, got, want) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log("  " + (ok ? "ok  " : "FAIL") + "  " + label +
    (ok ? "" : "\n         got  " + JSON.stringify(got) + "\n         want " + JSON.stringify(want)));
};
const ok = (label, cond, note) => {
  if (!cond) bad++;
  console.log("  " + (cond ? "ok  " : "FAIL") + "  " + label + (note ? "  — " + note : ""));
};

/* Lift SAYS and say() out of a built page and give back a working say(). */
function sayFrom(file) {
  const html = readFileSync(file, "utf8");
  const at = html.indexOf("var SAYS = ");
  if (at < 0) throw new Error(file + ": no SAYS to lift");
  const decl = html.slice(at, html.indexOf(";\n", at) + 1);

  const lift = (n) => {
    const a = html.indexOf("function " + n + "(");
    if (a < 0) throw new Error(file + ": " + n + "() not found");
    let d = 0, i = html.indexOf("{", a);
    for (; i < html.length; i++) {
      if (html[i] === "{") d++;
      else if (html[i] === "}") { d--; if (!d) return html.slice(a, i + 1); }
    }
    throw new Error(file + ": unbalanced " + n);
  };
  const api = new Function(decl + "\n" + lift("say") + "\n" + lift("sayList") +
    "\nreturn { say: say, sayList: sayList, SAYS: SAYS };")();
  return api;
}

console.log("\n  the English pages are unchanged\n");

for (const p of SAY_PAGES) {
  const en = sayFrom("dist/" + p);
  is(p + ": SAYS is empty, so say() returns its own English",
    en.say("Send it"), "Send it");
  is(p + ": and a placeholder still takes its value",
    en.say("Step {n} of {last}", { n: 1, last: 5 }), "Step 1 of 5");
}

console.log("\n  the Spanish pages say it in Spanish\n");

if (!existsSync("dist/es/careers.html")) {
  console.log("  no Spanish build to read — run node build.mjs");
  process.exit(1);
}

{
  const es = sayFrom("dist/es/careers.html");

  is("the step counter", es.say("Step {n} of {last}", { n: 1, last: 5 }), "Paso 1 de 5");
  is("the send button", es.say("Send it"), "Enviar");
  is("a validation message", es.say("We need your full name."), "Necesitamos tu nombre completo.");
  is("the confirmation heading", es.say("Application in."), "Solicitud recibida.");

  /* The reason the concatenated ones had to become templates: the number and
     the list land where Spanish puts them, not where English did. */
  is("a counted sentence puts its number where Spanish wants it",
    es.say("{n} groups are not finished: {list}. Each one is marked below.",
      { n: 3, list: "1, 2 y 3" }),
    "Hay 3 grupos sin terminar: 1, 2 y 3. Cada uno está marcado abajo.");

  is("the list joiner is a Spanish word", es.sayList(["1", "2", "3"]), "1, 2 y 3");

  is("a word spliced into a sentence is translated too",
    es.say("“{word}” cannot be both. Pick a different word as {which}.",
      { word: "Cuidadoso", which: es.say("least") }),
    "«Cuidadoso» no puede ser las dos. Elige otra palabra como la que menos.");

  ok("an unknown key still falls back to its English rather than to nothing",
    es.say("not a sentence this page has") === "not a sentence this page has");
}

{
  const es = sayFrom("dist/es/index.html");
  is("the seat form counts in Spanish too",
    es.say("Step {n} of {last}", { n: 2, last: 4 }), "Paso 2 de 4");
  is("and names the company where Spanish wants it",
    es.say("A shortlist for {company} lands in {email} within one working day.",
      { company: "Rosehill", email: "a@b.com" }),
    "Una preselección para Rosehill llega a a@b.com en un día hábil.");
}

/* ── the two registers ─────────────────────────────────────────────────────

   es/strings.json already made this choice and this only follows it: the
   application dialog speaks to an applicant as tú, and the seat form speaks to
   an employer as usted. They sit on different pages so a reader never sees
   both, but each form has to be consistent with the markup around it — a
   heading that asks "¿A qué áreas estás postulando?" above an error that
   answers "Elija al menos un área" is two people talking.

   The seven sentences both forms share are worded to belong to neither, so
   they carry no marker of either one. That is the easiest of the three to
   break by "improving" the wording later, which is why it is asserted. */
console.log("\n  each form keeps its own register\n");

{
  const car = sayFrom("dist/es/careers.html");
  const idx = sayFrom("dist/es/index.html");

  ok("the applicant is addressed as tú",
    /\btu\b|\bti\b|Elige|Marca|Revisa|trabajas|puedes/.test(
      [car.say("We need your full name."),
       car.say("Which country do you work from?"),
       car.say("Pick one."),
       car.say("See your application")].join(" ")),
    "Necesitamos tu nombre completo. / ¿Desde qué país trabajas?");

  ok("the employer is addressed as usted",
    /\bsu\b|Elija|Revise|Escríbanos/.test(
      [idx.say("Which company is this for?"),
       idx.say("Check this address — the shortlist goes here."),
       idx.say("Pick your time")].join(" ")),
    "Revise esta dirección… / Elija su horario");

  const shared = ["Step {n} of {last}", "Continue", "Send it", "Sending…", " and ",
    "One tap left.",
    "That did not send, so we saved it and will keep trying. Use the email button below to reach us now."];
  for (const k of shared) {
    is("both forms agree on " + JSON.stringify(k.slice(0, 26)), car.say(k), idx.say(k));
  }
  ok("and none of the shared seven picks a side",
    !shared.some((k) => /\bElija\b|\bElige\b|\bRevise\b|\bRevisa\b|\bUse\b|\bUsa\b|\btu\b|\bsu\b/.test(car.say(k))),
    "no imperative, no possessive");
}

console.log("\n  nothing is left in English\n");

for (const p of SAY_PAGES) {
  const keys = [...new Set(sayKeys(readFileSync(p, "utf8")).concat(SAY_COMPUTED))];
  const es = sayFrom("dist/es/" + p);
  const untranslated = keys.filter((k) => es.say(k) === k && /[a-z]{2} [a-z]{2}/.test(k));
  ok("es/" + p + ": every sentence it builds comes back in Spanish",
    untranslated.length === 0,
    untranslated.length ? untranslated.length + " still English: " +
      JSON.stringify(untranslated[0]) : keys.length + " sentences");
}

console.log("\n  " + (bad ? bad + " failed" : "both languages hold") + "\n");
process.exit(bad ? 1 : 0);
