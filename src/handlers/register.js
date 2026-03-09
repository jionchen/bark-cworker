import { validateBasicAuth, verifyRegisterAccess } from "../auth.js";
import {
  createDeviceKey,
  errorResponse,
  readRequestParams,
  sanitizeDeviceKey,
  sanitizeDeviceToken,
  successResponse
} from "../utils.js";

function resolveRegisterFields(params) {
  return {
    deviceKey: sanitizeDeviceKey(params.device_key || params.key || ""),
    deviceToken: sanitizeDeviceToken(
      params.device_token || params.devicetoken || ""
    ),
    rebind: String(params.rebind || params.confirm_rebind || "") === "1"
  };
}

export async function handleRegister({ request, config, db }) {
  const params = await readRequestParams(request);
  const access = await verifyRegisterAccess({ request, config, db, params });

  if (!access.ok) {
    return errorResponse(access.status, access.message);
  }

  const { deviceKey: requestedKey, deviceToken, rebind } = resolveRegisterFields(params);

  if (!deviceToken) {
    return errorResponse(400, "device token is empty");
  }

  if (deviceToken.length > 160) {
    return errorResponse(400, "device token is invalid");
  }

  if (!requestedKey && !config.allowNewDevice) {
    return errorResponse(403, "device registration disabled");
  }

  const deviceKey = requestedKey || (await createDeviceKey());
  const existing = await db.getDeviceByKey(deviceKey);

  if (
    existing &&
    existing.device_token !== deviceToken &&
    !config.registerAllowRebind &&
    !rebind
  ) {
    return errorResponse(409, "device key already exists; explicit rebind required");
  }

  await db.saveDevice({
    deviceKey,
    deviceToken
  });
  await db.incrementRegistrationCodeUse(access.record.id);

  return successResponse({
    key: deviceKey,
    device_key: deviceKey
  });
}

export async function handleRegisterCheck({ request, config, db, deviceKey }) {
  if (!validateBasicAuth(request, config.basicAuth)) {
    return errorResponse(401, "Unauthorized");
  }

  const normalizedKey = sanitizeDeviceKey(deviceKey);
  if (!normalizedKey) {
    return errorResponse(400, "device key is empty");
  }

  const device = await db.getDeviceByKey(normalizedKey);
  if (!device || device.status !== "active") {
    return errorResponse(404, "device key not found");
  }

  return successResponse();
}

