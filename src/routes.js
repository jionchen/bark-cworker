import { Database } from "./db.js";
import { handleInfo } from "./handlers/info.js";
import { handleHealthz, handlePing, handleRoot } from "./handlers/misc.js";
import { handlePush } from "./handlers/push.js";
import { handleRegister, handleRegisterCheck } from "./handlers/register.js";
import { errorResponse, normalizeRootPath } from "./utils.js";

function getRelativePath(pathname, rootPath) {
  const normalizedRoot = normalizeRootPath(rootPath);
  if (normalizedRoot === "/") {
    return pathname || "/";
  }

  const rootWithoutTrailingSlash = normalizedRoot.slice(0, -1);
  if (
    pathname !== rootWithoutTrailingSlash &&
    !pathname.startsWith(normalizedRoot)
  ) {
    return null;
  }

  const stripped =
    pathname === rootWithoutTrailingSlash
      ? "/"
      : pathname.slice(normalizedRoot.length - 1);
  return stripped || "/";
}

export async function routeRequest({ request, env, config }) {
  const url = new URL(request.url);
  const routePath = getRelativePath(url.pathname, config.rootPath);
  if (routePath === null) {
    return errorResponse(404, `Cannot ${request.method} ${url.pathname}`);
  }

  let db;
  const getDb = () => {
    if (!db) {
      db = new Database(env.database);
    }
    return db;
  };

  if (routePath === "/") {
    return handleRoot();
  }

  if (routePath === "/ping") {
    return handlePing();
  }

  if (routePath === "/healthz") {
    return handleHealthz();
  }

  if (routePath === "/info") {
    return handleInfo({ request, config, db: getDb() });
  }

  if (routePath === "/register") {
    return handleRegister({ request, config, db: getDb() });
  }

  if (routePath.startsWith("/register/")) {
    const deviceKey = routePath.slice("/register/".length);
    return handleRegisterCheck({ request, config, db: getDb(), deviceKey });
  }

  if (routePath === "/push" || /^\/[a-zA-Z0-9]{10,}(?:\/[^/]+){0,3}$/.test(routePath)) {
    return handlePush({ request, config, db: getDb(), routePath });
  }

  return errorResponse(404, `Cannot ${request.method} ${routePath}`);
}
