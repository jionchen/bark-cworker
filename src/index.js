import { loadConfig } from "./config.js";
import { routeRequest } from "./routes.js";
import { errorResponse } from "./utils.js";

const worker = {
  async fetch(request, env) {
    try {
      const config = loadConfig(env);
      return await routeRequest({ request, env, config });
    } catch {
      return errorResponse(500, "Internal Server Error");
    }
  }
};

export default worker;

