export function handlePing() {
  return new Response(
    JSON.stringify({
      code: 200,
      message: "pong",
      timestamp: Math.floor(Date.now() / 1000)
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" }
    }
  );
}

export function handleHealthz() {
  return new Response("ok", {
    status: 200,
    headers: { "content-type": "text/plain" }
  });
}

export function handleRoot() {
  return new Response("ok", {
    status: 200,
    headers: { "content-type": "text/plain" }
  });
}

