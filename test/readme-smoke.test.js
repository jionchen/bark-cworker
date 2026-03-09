import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("README includes deploy button", () => {
  const readme = fs.readFileSync("README.md", "utf8");
  assert.match(readme, /deploy\.workers\.cloudflare\.com\/button/);
});

test("README.zh includes deploy button", () => {
  const readme = fs.readFileSync("README.zh.md", "utf8");
  assert.match(readme, /deploy\.workers\.cloudflare\.com\/button/);
});
