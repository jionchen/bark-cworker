import { loadConfig } from "./config.js";
import { routeRequest } from "./routes.js";
import { errorResponse } from "./utils.js";

const worker = {
  async fetch(request, env) {
    try {
      const config = loadConfig(env);
      return routeRequest({ request, env, config });
    } catch (error) {
      return errorResponse(500, error.message);
    }
  }
};

export default worker;

