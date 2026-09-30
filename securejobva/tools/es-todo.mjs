/* Lists what a page still needs. Run: node tools/es-todo.mjs privacy.html */
import { readFileSync, existsSync } from "node:fs";
import { walk } from "./lib-seg.mjs";

/* Run with no page, it used to hand undefined straight to readFileSync and die
   inside node:fs with a stack trace about a path argument — which says nothing
   about what this script wanted. A usage line does. */
const page = process.argv[2];
if (!page || !existsSync(page)) {
  console.error((page ? "no such file: " + page + "\n" : "") +
    "usage: node tools/es-todo.mjs <page.html>   e.g. node tools/es-todo.mjs privacy.html");
  process.exit(2);
}

const dict = JSON.parse(readFileSync("es/strings.json", "utf8"));
const seen = new Set();
walk(readFileSync(page, "utf8"), (k) => {
  if (!(k in dict)) seen.add(k);
  return undefined;
});
[...seen].forEach((k) => console.log(JSON.stringify(k)));
console.error("\n" + seen.size + " missing");
