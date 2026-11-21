export default async function handler(request, response) {
  const backend = process.env.BACKEND_URL;
  if (!backend) {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: "BACKEND_URL is not configured" }));
    return;
  }
  const url = new URL(request.url || "/", "http://localhost");
  const path = url.searchParams.get("path");
  if (!path || path.startsWith("/") || path.includes("..")) {
    response.writeHead(400);
    response.end("Invalid API path");
    return;
  }
  url.searchParams.delete("path");
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 32768) {
        response.writeHead(413);
        response.end("Request too large");
        return;
      }
      chunks.push(chunk);
    }
    const upstream = await fetch(new URL(`/api/${path}${url.search}`, backend), {
      method: request.method,
      headers: { accept: "application/json", ...(request.headers["x-list-key"] ? { "x-list-key": request.headers["x-list-key"] } : {}), ...(chunks.length ? { "content-type": "application/json" } : {}) },
      ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    response.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
    });
    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    response.writeHead(502, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: "Backend unavailable. Check BACKEND_URL." }));
  }
}
