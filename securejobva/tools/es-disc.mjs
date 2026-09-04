/* The DISC grid's aria-labels are ninety-six strings of one shape: the word,
   then whether it is the most or least like you. Typing them out is ninety-six
   chances to translate a word one way in the label and another in the tile —
   which nobody would ever see, because the two are never on screen together.
   So they are derived from the word translations instead, and a word that has
   no translation yet is reported rather than guessed.

   Run: node tools/es-disc.mjs   (writes into es/strings.json) */
import { readFileSync, writeFileSync } from "node:fs";
import { walk } from "./lib-seg.mjs";

const dict = JSON.parse(readFileSync("es/strings.json", "utf8"));
const MOST = " — most like me";
const LEAST = " — least like me";

const wanted = new Set();
walk(readFileSync("careers.html", "utf8"), (k) => {
  if (k.endsWith(MOST) || k.endsWith(LEAST)) wanted.add(k);
  return undefined;
});

let added = 0;
const orphans = [];
for (const key of wanted) {
  const most = key.endsWith(MOST);
  const word = key.slice(0, key.length - (most ? MOST : LEAST).length);
  const es = dict[word];
  if (es === undefined) { orphans.push(word); continue; }
  const value = es + (most ? " — más como yo" : " — menos como yo");
  if (dict[key] !== value) { dict[key] = value; added++; }
}

if (orphans.length) {
  console.log("no translation for these words yet: " + orphans.join(", "));
  process.exit(1);
}

const out = {};
for (const k of Object.keys(dict).sort()) out[k] = dict[k];
writeFileSync("es/strings.json", JSON.stringify(out, null, 1) + "\n");
console.log(added + " DISC labels derived from " + wanted.size + " found");
