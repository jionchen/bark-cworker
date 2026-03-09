import { getTimestamp } from "./utils.js";

const DEFAULT_PUBLIC_BARK_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg4vtC3g5L5HgKGJ2+
T1eA0tOivREvEAY2g+juRXJkYL2gCgYIKoZIzj0DAQehRANCAASmOs3JkSyoGEWZ
sUGxFs/4pw1rIlSV2IC19M8u3G5kq36upOwyFWj9Gi3Ejc9d3sC7+SHRqXrEAJow
8/7tRpV+
-----END PRIVATE KEY-----`;

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function pemToArrayBuffer(pem) {
  const normalized = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  return Uint8Array.from(Buffer.from(normalized, "base64"));
}

async function importPrivateKey(pem) {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function signJwt(unsignedToken, privateKey) {
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  return toBase64Url(Buffer.from(signature));
}

export async function getApnsAuthToken(config, db, now = getTimestamp()) {
  const cached = await db.getAuthCache();
  if (cached && now - Number(cached.issued_at) <= 3000) {
    return cached.token;
  }

  const privateKeyPem = config.apnsPrivateKey || DEFAULT_PUBLIC_BARK_PRIVATE_KEY;
  const privateKey = await importPrivateKey(privateKeyPem);
  const header = toBase64Url(
    JSON.stringify({ alg: "ES256", kid: config.apnsKeyId })
  );
  const claims = toBase64Url(
    JSON.stringify({ iss: config.apnsTeamId, iat: now })
  );
  const unsignedToken = `${header}.${claims}`;
  const signature = await signJwt(unsignedToken, privateKey);
  const token = `${unsignedToken}.${signature}`;

  await db.saveAuthCache(token, now);
  return token;
}

export async function pushToApns({
  config,
  db,
  deviceToken,
  headers,
  payload,
  fetchImpl = fetch
}) {
  const authToken = await getApnsAuthToken(config, db);
  const requestHeaders = Object.fromEntries(
    Object.entries({
      "apns-topic": config.apnsTopic,
      "apns-collapse-id": headers["apns-collapse-id"],
      "apns-expiration": String(headers["apns-expiration"]),
      "apns-push-type": headers["apns-push-type"],
      authorization: `bearer ${authToken}`,
      "content-type": "application/json"
    }).filter(([, value]) => value !== undefined)
  );

  return fetchImpl(`https://api.push.apple.com/3/device/${deviceToken}`, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(payload)
  });
}
