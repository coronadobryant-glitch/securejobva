/* Merges a batch of translations into es/strings.json.
   Run: node tools/es-merge.mjs <batch.json> */
import { readFileSync, writeFileSync } from "node:fs";
const dict = JSON.parse(readFileSync("es/strings.json", "utf8"));
const batch = JSON.parse(readFileSync(process.argv[2], "utf8"));
let added = 0, changed = 0;
for (const [k, v] of Object.entries(batch)) {
  if (!(k in dict)) added++;
  else if (dict[k] !== v) changed++;
  dict[k] = v;
}
/* Sorted, so the file diffs by meaning rather than by the order somebody
   happened to write the batch in. */
const out = {};
for (const k of Object.keys(dict).sort()) out[k] = dict[k];
writeFileSync("es/strings.json", JSON.stringify(out, null, 1) + "\n");
console.log("merged: " + added + " new, " + changed + " changed, " + Object.keys(out).length + " total");
