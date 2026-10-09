import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { Database } from "../src/db.js";

async function setup(t) {
  const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } };", compatibilityDate: "2025-03-01", d1Databases: { database: "security-test" } });
  t.after(() => mf.dispose());
  const binding = await mf.getD1Database("database");
  for (const name of ["001_create_devices.sql", "002_create_registration_codes.sql"]) {
    await binding.prepare(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8")).run();
  }
  await binding.prepare("INSERT INTO registration_codes (id, name, code_hash, max_uses, created_at, updated_at) VALUES (1, 'test', 'hash', 1, 1, 1)").run();
  return { binding, db: new Database(binding) };
}

test("D1 concurrent registrations cannot exceed code quota", async (t) => {
  const { binding, db } = await setup(t);
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => db.registerDevice({ deviceKey: `device${i}`, deviceToken: `token${i}`, codeId: 1 })));
  assert.equal(await db.countDevices(), 1);
  assert.equal(results.filter(result => result === true).length, 1);
  assert.equal((await binding.prepare("SELECT used_count FROM registration_codes WHERE id = 1").first()).used_count, 1);
});

for (const condition of ["status = 'disabled'", "expires_at = 1", "max_uses = 0"]) {
  test(`D1 rechecks code validity at write time: ${condition}`, async (t) => {
    const { db, binding } = await setup(t);
    await binding.prepare(`UPDATE registration_codes SET ${condition} WHERE id = 1`).run();
    assert.equal(await db.registerDevice({ deviceKey: "device", deviceToken: "token", codeId: 1 }), false);
    assert.equal(await db.countDevices(), 0);
    assert.equal((await binding.prepare("SELECT used_count FROM registration_codes WHERE id = 1").first()).used_count, 0);
  });
}

test("D1 applies rebind restriction even when earlier read missed the device", async (t) => {
  const { db, binding } = await setup(t);
  await db.saveDevice({ deviceKey: "device", deviceToken: "original" });
  assert.equal(await db.registerDevice({ deviceKey: "device", deviceToken: "replacement", codeId: 1, allowRebind: false }), false);
  assert.equal(await db.getDeviceTokenByKey("device"), "original");
  assert.equal((await binding.prepare("SELECT used_count FROM registration_codes WHERE id = 1").first()).used_count, 0);
  assert.equal(await db.registerDevice({ deviceKey: "device", deviceToken: "replacement", codeId: 1, allowRebind: true }), true);
  assert.equal(await db.getDeviceTokenByKey("device"), "replacement");
});

test("D1 applies new device restriction at write time and allows existing refresh", async (t) => {
  const { db } = await setup(t);
  assert.equal(await db.registerDevice({ deviceKey: "device", deviceToken: "token", codeId: 1, allowNewDevice: false }), false);
  await db.saveDevice({ deviceKey: "device", deviceToken: "token" });
  assert.equal(await db.registerDevice({ deviceKey: "device", deviceToken: "token", codeId: 1, allowNewDevice: false }), true);
});

test("D1 rolls back device write if usage update fails", async (t) => {
  const { db, binding } = await setup(t);
  await binding.prepare("CREATE TRIGGER reject_usage BEFORE UPDATE ON registration_codes BEGIN SELECT RAISE(ABORT, 'test rollback'); END").run();
  await assert.rejects(db.registerDevice({ deviceKey: "device", deviceToken: "token", codeId: 1 }));
  assert.equal(await db.countDevices(), 0);
});

for (const maxUses of [null, -1]) {
  test(`D1 preserves unlimited code quota semantics: ${maxUses}`, async (t) => {
    const { db, binding } = await setup(t);
    await binding.prepare("UPDATE registration_codes SET max_uses = ? WHERE id = 1").bind(maxUses).run();
    for (let i = 0; i < 3; i++) {
      assert.equal(await db.registerDevice({ deviceKey: `device${i}`, deviceToken: "token", codeId: 1 }), true);
    }
    assert.equal(await db.countDevices(), 3);
    assert.equal((await binding.prepare("SELECT used_count FROM registration_codes WHERE id = 1").first()).used_count, 3);
  });
}

test("D1 missing registration code cannot write a device", async (t) => {
  const { db } = await setup(t);
  assert.equal(await db.registerDevice({ deviceKey: "device", deviceToken: "token", codeId: 999 }), false);
  assert.equal(await db.countDevices(), 0);
});

test("default alert receiver routes allow authenticated device registration in D1", async (t) => {
  const { binding, db } = await setup(t);
  const { hashRegistrationCode } = await import("../src/auth.js");
  const { default: worker } = await import("../src/index.js");
  const hash = await hashRegistrationCode("registrationtestcode");
  await binding.prepare("UPDATE registration_codes SET code_hash = ? WHERE id = 1").bind(hash).run();
  const response = await worker.fetch(new Request("https://example.com/register", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from("test:password").toString("base64")}` },
    body: JSON.stringify({ device_token: "testtoken", register_code: "registrationtestcode" })
  }), { BASIC_AUTH: "test:password", database: binding });
  assert.equal(response.status, 200);
  const key = (await response.json()).data.device_key;
  assert.equal(await db.getDeviceTokenByKey(key), "testtoken");
});
