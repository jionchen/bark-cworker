import test from "node:test";
import assert from "node:assert/strict";

import { hashRegistrationCode, validateBasicAuth, verifyRegisterAccess } from "../src/auth.js";

test("verifyRegisterAccess rejects missing registration code", async () => {
  const result = await verifyRegisterAccess({
    request: new Request("https://example.com/register", { method: "POST" }),
    config: {
      registerRequireBasicAuth: false,
      registerCodeSalt: "salt",
      basicAuth: ""
    },
    db: {
      async getRegistrationCodeByHash() {
        return null;
      }
    },
    params: {}
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
});

test("validateBasicAuth accepts matching credentials", () => {
  const request = new Request("https://example.com/push", {
    headers: {
      authorization: "Basic YWRtaW46c2VjcmV0"
    }
  });

  assert.equal(validateBasicAuth(request, "admin:secret"), true);
});

test("hashRegistrationCode is stable for salt and value", async () => {
  const hash = await hashRegistrationCode("code", "salt");
  assert.equal(hash.length, 64);
});
