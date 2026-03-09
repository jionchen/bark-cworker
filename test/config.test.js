import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../src/config.js";

test("loadConfig applies secure defaults", () => {
  const config = loadConfig({
    ROOT_PATH: "/",
    APNS_TEAM_ID: "team",
    APNS_KEY_ID: "key",
    APNS_PRIVATE_KEY: "pem"
  });

  assert.equal(config.registerRequireBasicAuth, true);
  assert.equal(config.maxBatchPush, 20);
  assert.equal(config.rootPath, "/");
});
