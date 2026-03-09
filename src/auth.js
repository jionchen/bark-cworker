import { normalizeRegistrationCodeRecord } from "./db.js";

function constantTimeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return result === 0;
}

function encodeBase64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

export function validateBasicAuth(request, basicAuth) {
  if (!basicAuth) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  if (typeof authHeader !== "string" || !authHeader.startsWith("Basic ")) {
    return false;
  }

  const expected = encodeBase64(basicAuth);
  const received = authHeader.slice(6);
  return constantTimeCompare(received, expected);
}

export async function hashRegistrationCode(registerCode, salt = "") {
  const payload = new TextEncoder().encode(`${salt}:${registerCode}`);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function getRegistrationCodeValue(params = {}) {
  return (
    params.register_code ||
    params.registercode ||
    params.code ||
    ""
  ).trim();
}

export async function verifyRegisterAccess({ request, config, db, params }) {
  if (config.registerRequireBasicAuth && !validateBasicAuth(request, config.basicAuth)) {
    return {
      ok: false,
      status: 401,
      message: "Unauthorized"
    };
  }

  const registerCode = getRegistrationCodeValue(params);
  if (!registerCode) {
    return {
      ok: false,
      status: 401,
      message: "registration code is required"
    };
  }

  const codeHash = await hashRegistrationCode(registerCode, config.registerCodeSalt);
  const record = await db.getRegistrationCodeByHash(codeHash);
  const state = normalizeRegistrationCodeRecord(record);

  if (!state.usable) {
    return {
      ok: false,
      status: 401,
      message: `registration code ${state.reason}`
    };
  }

  return {
    ok: true,
    record
  };
}

