import { normalizeRootPath, parseBoolean, parseInteger } from "./utils.js";

const DEFAULTS = {
  allowNewDevice: true,
  allowQueryNums: true,
  rootPath: "/",
  registerRequireBasicAuth: true,
  registerAllowRebind: false,
  maxBatchPush: 20,
  apnsTeamId: "5U8LBRXG3A",
  apnsKeyId: "LH4T9V5U4R",
  apnsTopic: "me.fin.bark"
};

export function loadConfig(env = {}) {
  const config = {
    allowNewDevice: parseBoolean(env.ALLOW_NEW_DEVICE, DEFAULTS.allowNewDevice),
    allowQueryNums: parseBoolean(env.ALLOW_QUERY_NUMS, DEFAULTS.allowQueryNums),
    rootPath: normalizeRootPath(env.ROOT_PATH || DEFAULTS.rootPath),
    basicAuth: env.BASIC_AUTH || "",
    registerCodeSalt: env.REGISTER_CODE_SALT || "",
    registerRequireBasicAuth: parseBoolean(
      env.REGISTER_REQUIRE_BASIC_AUTH,
      DEFAULTS.registerRequireBasicAuth
    ),
    registerAllowRebind: parseBoolean(
      env.REGISTER_ALLOW_REBIND,
      DEFAULTS.registerAllowRebind
    ),
    maxBatchPush: parseInteger(env.MAX_BATCH_PUSH, DEFAULTS.maxBatchPush),
    apnsTeamId: env.APNS_TEAM_ID || DEFAULTS.apnsTeamId,
    apnsKeyId: env.APNS_KEY_ID || DEFAULTS.apnsKeyId,
    apnsPrivateKey: env.APNS_PRIVATE_KEY || "",
    apnsTopic: env.APNS_TOPIC || DEFAULTS.apnsTopic
  };

  if (config.maxBatchPush < 1) {
    throw new Error("MAX_BATCH_PUSH must be greater than 0");
  }

  return config;
}

