import { mapsKey } from "../../store-map.mjs";

export default async function handler(_request, response) {
  const key = await mapsKey();
  response.writeHead(key ? 200 : 503, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(key ? { key } : { message: "Google Maps key is not configured." }));
}
