/* Lists what a page still needs. Run: node tools/es-todo.mjs privacy.html */
import { readFileSync } from "node:fs";
import { walk } from "./lib-seg.mjs";
const dict = JSON.parse(readFileSync("es/strings.json", "utf8"));
const seen = new Set();
walk(readFileSync(process.argv[2], "utf8"), (k) => {
  if (!(k in dict)) seen.add(k);
  return undefined;
});
[...seen].forEach((k) => console.log(JSON.stringify(k)));
console.error("\n" + seen.size + " missing");
