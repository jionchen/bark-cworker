import crypto from "node:crypto";

const [registerCode, name = "default", maxUses = "1", expiresAt = "", salt = ""] =
  process.argv.slice(2);

if (!registerCode) {
  console.error(
    "Usage: npm run bootstrap-register-code -- <register-code> [name] [max-uses] [expires-at-unix] [salt]"
  );
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const codeHash = crypto
  .createHash("sha256")
  .update(`${salt}:${registerCode}`)
  .digest("hex");

const maxUsesValue = maxUses === "null" ? "NULL" : Number.parseInt(maxUses, 10);
const expiresAtValue = expiresAt ? Number.parseInt(expiresAt, 10) : "NULL";

console.log(`INSERT INTO registration_codes (
  name,
  code_hash,
  status,
  expires_at,
  max_uses,
  used_count,
  created_at,
  updated_at
) VALUES (
  '${name.replace(/'/g, "''")}',
  '${codeHash}',
  'active',
  ${expiresAtValue},
  ${Number.isNaN(maxUsesValue) ? "NULL" : maxUsesValue},
  0,
  ${now},
  ${now}
);`);

