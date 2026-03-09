import { validateBasicAuth } from "../auth.js";
import { errorResponse, jsonResponse } from "../utils.js";

const VERSION = "0.1.0";
const BUILD = "2026-03-09";
const ARCH = "js";

export async function handleInfo({ request, config, db }) {
  if (!validateBasicAuth(request, config.basicAuth)) {
    return errorResponse(401, "Unauthorized");
  }

  const body = {
    version: VERSION,
    build: BUILD,
    arch: ARCH,
    devices: config.allowQueryNums ? await db.countDevices() : undefined
  };

  return jsonResponse(body, 200);
}

