import { validateBasicAuth } from "../auth.js";
import { pushToApns } from "../apns.js";
import {
  errorResponse,
  getTimestamp,
  jsonResponse,
  readRequestParams,
  sanitizeDeviceKey,
  successResponse
} from "../utils.js";

function decodePathSegment(value) {
  return decodeURIComponent(String(value || "").replaceAll("+", "%20"));
}

function parseLegacyRoutePath(routePath) {
  const cleanPath = routePath.split("/").filter(Boolean).map(decodePathSegment);
  if (!cleanPath.length || cleanPath[0] === "push") {
    return {};
  }

  const [deviceKey, titleOrBody, subtitleOrBody, body] = cleanPath;
  if (cleanPath.length === 1) {
    return { device_key: deviceKey };
  }
  if (cleanPath.length === 2) {
    return { device_key: deviceKey, body: titleOrBody };
  }
  if (cleanPath.length === 3) {
    return { device_key: deviceKey, title: titleOrBody, body: subtitleOrBody };
  }

  return {
    device_key: deviceKey,
    title: titleOrBody,
    subtitle: subtitleOrBody,
    body
  };
}

function normalizeDeviceKeys(deviceKeys) {
  if (!deviceKeys) {
    return [];
  }

  if (Array.isArray(deviceKeys)) {
    return deviceKeys.map((item) => sanitizeDeviceKey(item)).filter(Boolean);
  }

  if (typeof deviceKeys === "string") {
    const trimmed = deviceKeys.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        return normalizeDeviceKeys(JSON.parse(trimmed));
      } catch {
        return [];
      }
    }

    return trimmed
      .split(",")
      .map((item) => sanitizeDeviceKey(item.replace(/['"]/g, "")))
      .filter(Boolean);
  }

  return [];
}

export async function parsePushRequest(request, routePath) {
  const params = await readRequestParams(request);
  Object.assign(params, parseLegacyRoutePath(routePath));

  const deviceKeys = normalizeDeviceKeys(params.device_keys);
  delete params.device_keys;

  if (params.device_key) {
    params.device_key = sanitizeDeviceKey(params.device_key);
  }

  return {
    params,
    deviceKeys
  };
}

const EXCLUDED_PAYLOAD_KEYS = new Set([
  "device_key", "device_keys", "device_token", "devicetoken",
  "title", "subtitle", "body",
  "register_code", "registercode", "code",
  "rebind", "confirm_rebind",
  "key"
]);

function buildApnsRequest(parameters) {
  let sound = parameters.sound || "1107";
  if (parameters.sound && !String(sound).endsWith(".caf")) {
    sound = `${sound}.caf`;
  }

  const isDelete = parameters.delete || parameters._delete;
  const body = parameters.body || (!parameters.title && !parameters.subtitle ? "Empty Message" : undefined);

  const payload = {
    aps: isDelete
      ? {
          "content-available": 1,
          "mutable-content": 1
        }
      : {
          alert: {
            title: parameters.title || undefined,
            subtitle: parameters.subtitle || undefined,
            body
          },
          sound,
          "thread-id": parameters.group || undefined,
          category: "myNotificationCategory",
          "mutable-content": 1
        }
  };

  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && !EXCLUDED_PAYLOAD_KEYS.has(key.toLowerCase())) {
      payload[key.toLowerCase()] = value;
    }
  }

  return {
    headers: {
      "apns-collapse-id": parameters.id || undefined,
      "apns-expiration": getTimestamp() + 86400,
      "apns-push-type": isDelete ? "background" : "alert"
    },
    payload
  };
}

async function pushOne({ db, config, apns, parameters }) {
  if (!parameters.device_key) {
    return { status: 400, body: { message: "device key is empty" } };
  }

  const deviceToken = await db.getDeviceTokenByKey(parameters.device_key);
  if (!deviceToken) {
    return { status: 400, body: { message: "device token invalid" } };
  }

  const { headers, payload } = buildApnsRequest(parameters);
  const response = await apns.push({
    config,
    db,
    deviceToken,
    headers,
    payload
  });

  if (response.status === 200) {
    return {
      status: 200,
      body: { message: "success" }
    };
  }

  const responseText = await response.text();
  if (response.status === 410 || responseText.includes("BadDeviceToken")) {
    await db.markDeviceInactive(parameters.device_key);
  }

  return {
    status: response.status,
    body: { message: `push failed: ${responseText}` }
  };
}

export async function handlePush({ request, config, db, routePath, apns = { push: pushToApns } }) {
  if (request.method !== "POST" && request.method !== "GET") {
    return errorResponse(405, "Method Not Allowed");
  }

  if (!validateBasicAuth(request, config.basicAuth)) {
    return errorResponse(401, "Unauthorized");
  }

  const { params, deviceKeys } = await parsePushRequest(request, routePath);

  if (deviceKeys.length > config.maxBatchPush) {
    return errorResponse(400, `batch push count exceeds the maximum limit: ${config.maxBatchPush}`);
  }

  if (deviceKeys.length > 0) {
    const results = await Promise.all(
      deviceKeys.map(async (deviceKey) => {
        const result = await pushOne({
          db,
          config,
          apns,
          parameters: { ...params, device_key: deviceKey }
        });

        return {
          code: result.status,
          message: result.body.message,
          device_key: deviceKey
        };
      })
    );

    return jsonResponse(
      {
        code: 200,
        message: "success",
        data: results,
        timestamp: getTimestamp()
      },
      200
    );
  }

  const result = await pushOne({
    db,
    config,
    apns,
    parameters: params
  });

  if (result.status !== 200) {
    return errorResponse(result.status, result.body.message);
  }

  return successResponse();
}
