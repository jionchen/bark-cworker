import test from "node:test";
import assert from "node:assert/strict";

import { normalizeRegistrationCodeRecord } from "../src/db.js";

test("normalizeRegistrationCodeRecord rejects disabled codes", () => {
  assert.equal(
    normalizeRegistrationCodeRecord({ status: "disabled" }).usable,
    false
  );
});
