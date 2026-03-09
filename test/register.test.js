import test from "node:test";
import assert from "node:assert/strict";

import { hashRegistrationCode } from "../src/auth.js";
import { handleRegister, handleRegisterCheck } from "../src/handlers/register.js";

test("handleRegister creates a device key when one is not supplied", async () => {
  const registerHash = await hashRegistrationCode("code", "salt");
  const saved = [];
  const response = await handleRegister({
    request: new Request("https://example.com/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_token: "abc123", register_code: "code" })
    }),
    config: {
      allowNewDevice: true,
      registerRequireBasicAuth: false,
      registerCodeSalt: "salt",
      registerAllowRebind: false,
      basicAuth: ""
    },
    db: {
      async getRegistrationCodeByHash(codeHash) {
        if (codeHash === registerHash) {
          return { id: 1, status: "active", used_count: 0, max_uses: 5 };
        }
        return null;
      },
      async getDeviceByKey() {
        return null;
      },
      async saveDevice(device) {
        saved.push(device);
      },
      async incrementRegistrationCodeUse() {}
    }
  });

  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.data.device_key);
  assert.equal(saved.length, 1);
});

test("handleRegisterCheck requires basic auth", async () => {
  const response = await handleRegisterCheck({
    request: new Request("https://example.com/register/demo"),
    config: { basicAuth: "admin:secret" },
    db: {
      async getDeviceByKey() {
        return { status: "active" };
      }
    },
    deviceKey: "demo"
  });

  assert.equal(response.status, 401);
});
