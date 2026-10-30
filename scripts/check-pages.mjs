import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { calculate, mortgagePayment } from "../assets/finance.js";

const pages = [
  "index",
  "informe",
  "comparar",
  "analizar",
  "extension",
  "ajustes",
];
for (const page of pages) {
  const html = await readFile(
    new URL(`../${page}.html`, import.meta.url),
    "utf8",
  );
  assert.match(html, /<html lang="es">/);
  assert.match(html, /<title>[^<]+FincaLens<\/title>/);
  assert.match(html, /id="main"/);
  assert.match(html, /type="module"/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${page}: duplicate IDs`);
  const links = [
    ...html.matchAll(/href="([^"?#]+)(?:\?[^"#]*)?(?:#[^"]*)?"/g),
  ].map((match) => match[1]);
  for (const href of links.filter((href) => href.endsWith(".html")))
    assert.ok(
      pages.includes(href.slice(0, -5)),
      `${page}: broken link ${href}`,
    );
}
const base = calculate({ price: 189000, rent: 1150 });
assert.ok(Math.abs(base.mortgage - 653.8899002) < 0.00001);
assert.ok(Math.abs(base.cf - 323.6100998) < 0.00001);
assert.equal(base.capital, 51090);
const cash = calculate({ price: 189000, rent: 1150, finance: 0 });
assert.equal(cash.mortgage, 0);
assert.equal(cash.valuation, 0);
const missing = calculate({ price: 98000, rent: null });
assert.equal(missing.cf, null);
assert.equal(missing.netYield, null);
assert.equal(missing.score, null);
const zeroRent = calculate({ price: 189000, rent: 0 });
assert.ok(zeroRent.cf < 0);
assert.equal(mortgagePayment(120000, 0, 10), 1000);
assert.throws(
  () => calculate({ price: 189000, rent: 1000, finance: 100 }),
  RangeError,
);
assert.ok(calculate({ price: 189000, rent: 1150, interest: 5 }).cf < base.cf);
assert.ok(calculate({ price: 189000, rent: 1300 }).cf > base.cf);
console.log(
  "6 HTML pages checked; financial model reference and edge cases passed.",
);
