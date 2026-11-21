import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { mapsKey, storeLocations } from "./store-map.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const apiOrigin = process.env.API_ORIGIN || "http://localhost:3000";
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");

  if (url.pathname === "/api/map/config") {
    const key = await mapsKey();
    response.writeHead(key ? 200 : 503, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    response.end(
      JSON.stringify(
        key ? { key } : { message: "Google Maps key is not configured." },
      ),
    );
    return;
  }
  if (url.pathname === "/api/map/stores") {
    try {
      const data = await storeLocations(apiOrigin);
      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify(data));
    } catch (error) {
      response.writeHead(502, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: error.message }));
    }
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    try {
      const upstream = await fetch(
        new URL(url.pathname + url.search, apiOrigin),
        {
          method: request.method,
          headers: { accept: request.headers.accept || "application/json" },
          signal: AbortSignal.timeout(20000),
        },
      );
      response.writeHead(upstream.status, {
        "content-type":
          upstream.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      });
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      response.writeHead(502, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(
        JSON.stringify({
          message:
            "Backend unavailable. Start cart-around-backend on port 3000.",
        }),
      );
    }
    return;
  }

  const file = ["/styles.css", "/app.js", "/store-map-client.js"].includes(
    url.pathname,
  )
    ? url.pathname.slice(1)
    : "index.html";
  try {
    const body = await readFile(join(root, file));
    response.writeHead(200, { "content-type": contentTypes[extname(file)] });
    response.end(body);
  } catch {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Unable to load the frontend.");
  }
}).listen(port, host, () => {
  console.log(`CartAround frontend: http://localhost:${port}`);
  console.log(`Proxying API requests to ${apiOrigin}`);
});
