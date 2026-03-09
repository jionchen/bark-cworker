import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";

test("worker rejects unauthenticated push requests", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/push", { method: "POST" }),
    {
      BASIC_AUTH: "admin:secret",
      database: {
        prepare() {
          throw new Error("should not query database before auth");
        }
      }
    }
  );

  assert.equal(response.status, 401);
});

test("worker responds to ping without auth", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/ping"),
    {}
  );

  assert.equal(response.status, 200);
});
