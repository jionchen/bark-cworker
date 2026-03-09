export function getTimestamp() {
  return Math.floor(Date.now() / 1000);
}

export function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return value !== "false";
}

export function parseInteger(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer value: ${value}`);
  }

  return parsed;
}

export function normalizeRootPath(pathname) {
  if (!pathname || pathname === "/") {
    return "/";
  }

  let normalized = pathname.trim();
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  if (!normalized.endsWith("/")) {
    normalized = `${normalized}/`;
  }

  return normalized.replace(/\/+/g, "/");
}

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers
    }
  });
}

export function successResponse(data, status = 200) {
  return jsonResponse(
    {
      code: status,
      message: "success",
      timestamp: getTimestamp(),
      ...(data === undefined ? {} : { data })
    },
    status
  );
}

export function errorResponse(status, message) {
  return jsonResponse(
    {
      code: status,
      message,
      timestamp: getTimestamp()
    },
    status
  );
}

export async function readRequestParams(request) {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  const url = new URL(request.url);
  const params = {};

  url.searchParams.forEach((value, key) => {
    params[key.toLowerCase()] = value;
  });

  if (request.method === "GET" || request.method === "HEAD") {
    return params;
  }

  if (contentType.includes("application/json")) {
    const payload = await request.json().catch(() => {
      throw new Error("request bind failed");
    });

    Object.entries(payload || {}).forEach(([key, value]) => {
      params[key.toLowerCase()] = value;
    });
    return params;
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    formData.forEach((value, key) => {
      params[key.toLowerCase()] = value;
    });
  }

  return params;
}

export function sanitizeDeviceToken(deviceToken) {
  return String(deviceToken || "").trim();
}

export function sanitizeDeviceKey(deviceKey) {
  return String(deviceKey || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .trim();
}

export async function createDeviceKey() {
  const uuid = crypto.randomUUID();
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(uuid)
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return Buffer.from(hashArray)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]|[lIO01]/g, "")
    .slice(0, 22);
}
