import { storeLocations } from "../../store-map.mjs";

export default async function handler(_request, response) {
  try {
    const backend = process.env.BACKEND_URL;
    if (!backend) throw new Error("BACKEND_URL is not configured");
    const data = await storeLocations(backend);
    response.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "public, max-age=300, s-maxage=3600",
    });
    response.end(JSON.stringify(data));
  } catch (error) {
    response.writeHead(502, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: error.message }));
  }
}
