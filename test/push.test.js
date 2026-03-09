import test from "node:test";
import assert from "node:assert/strict";

import { handlePush, parsePushRequest } from "../src/handlers/push.js";

test("parsePushRequest supports device_keys batch input", async () => {
  const result = await parsePushRequest(
    new Request("https://example.com/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "hello", device_keys: ["a", "b"] })
    }),
    "/push"
  );

  assert.deepEqual(result.deviceKeys, ["a", "b"]);
});

test("handlePush rejects oversized batches", async () => {
  const response = await handlePush({
    request: new Request("https://example.com/push", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Basic YWRtaW46c2VjcmV0"
      },
      body: JSON.stringify({ body: "hello", device_keys: ["a", "b", "c"] })
    }),
    config: {
      basicAuth: "admin:secret",
      maxBatchPush: 2
    },
    db: {},
    routePath: "/push"
  });

  assert.equal(response.status, 400);
});
