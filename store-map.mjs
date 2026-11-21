import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const cachePath = process.env.VERCEL
  ? join(tmpdir(), "cartaround-store-locations.json")
  : join(root, ".cache", "store-locations.json");
const cacheMaxAge = 29 * 24 * 60 * 60 * 1000;
let inFlight;

export async function mapsKey() {
  if (process.env.GOOGLE_MAPS_API_KEY) return process.env.GOOGLE_MAPS_API_KEY;
  try {
    const env = await readFile(
      join(root, "..", "cart-around-backend", ".env"),
      "utf8",
    );
    return (
      env
        .match(/^GOOGLE_MAPS_API_KEY=(.*)$/m)?.[1]
        ?.trim()
        .replace(/^['"]|['"]$/g, "") || null
    );
  } catch {
    return null;
  }
}

const fingerprint = (store) =>
  createHash("sha256")
    .update(
      `${store.store_name}|${store.address}|${store.location_input?.location_header || ""}`,
    )
    .digest("hex");

async function readCache() {
  for (const path of [cachePath, join(root, "store-locations-seed.json")]) {
    try {
      const data = JSON.parse(await readFile(path, "utf8"));
    return Object.fromEntries(
      Object.entries(data.locations || {}).filter(
        ([, entry]) =>
          entry.source === "registry" ||
          Date.now() - Date.parse(entry.resolvedAt || data.cachedAt) <
            cacheMaxAge,
      ),
    );
    } catch {
      /* Try the next cache source. */
    }
  }
  return {};
}

async function readPlaceIds() {
  try {
    return JSON.parse(
      await readFile(join(root, "store-place-ids.json"), "utf8"),
    );
  } catch {
    return {};
  }
}

function validMatch(place, store) {
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (!(lat > 12.7 && lat < 13.2 && lng > 77.4 && lng < 77.9)) return false;
  const name = place.displayName?.text?.toLowerCase() || "";
  const brand = store.brand.toLowerCase();
  const aliases =
    brand === "max fashion"
      ? ["max"]
      : brand === "pet warehouse / petsfirst"
        ? ["petsfirst", "pet warehouse"]
        : brand === "simpli namdhari's"
          ? ["namdhari"]
          : brand === "paws & collars"
            ? ["paws", "collars"]
            : brand === "samsung experience store"
              ? ["samsung"]
              : [brand];
  return aliases.some((alias) => name.includes(alias));
}

function matchScore(place, store) {
  let score = 0;
  const address = place.formattedAddress?.toLowerCase() || "";
  const original = store.address?.toLowerCase() || "";
  const firstNumber = original.match(/\b\d{2,4}(?:\/\d{1,4})?\b/)?.[0];
  if (firstNumber && address.includes(firstNumber)) score += 10;
  if (address.includes(store.location.toLowerCase())) score += 2;
  for (const word of store.store_name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3)) {
    if (place.displayName?.text?.toLowerCase().includes(word)) score++;
  }
  return score;
}

async function resolveStore(store, key, placeIds) {
  const known = placeIds[store.id];
  if (known?.fingerprint === fingerprint(store)) {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(known.placeId)}`,
      {
        headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "location" },
        signal: AbortSignal.timeout(12000),
      },
    );
    if (response.ok) {
      const data = await response.json();
      if (data.location?.latitude && data.location?.longitude)
        return {
          latitude: data.location.latitude,
          longitude: data.location.longitude,
          fingerprint: fingerprint(store),
          resolvedAt: new Date().toISOString(),
        };
    } else if (response.status === 429) {
      const error = new Error("Google Places returned 429");
      error.status = 429;
      throw error;
    }
  }
  const firstNumber =
    store.address.match(/\b\d{2,4}(?:\/\d{1,4})?\b/)?.[0] || "";
  const queries =
    store.id === "blr-67"
      ? ["Namdhari Fresh Brigade Metropolis Bengaluru"]
      : [
          `${store.store_name}, ${store.address}`,
          `${store.brand} ${firstNumber} ${store.location} Bengaluru`,
        ];
  for (const query of queries) {
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask":
            "places.displayName,places.formattedAddress,places.location",
        },
        body: JSON.stringify({
          textQuery: query,
          pageSize: 5,
          regionCode: "IN",
        }),
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!response.ok) {
      const error = new Error(`Google Places returned ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    const candidates = (data.places || []).filter((place) =>
      validMatch(place, store),
    );
    if (candidates.length) {
      candidates.sort((a, b) => matchScore(b, store) - matchScore(a, store));
      const best = candidates[0];
      return {
        latitude: best.location.latitude,
        longitude: best.location.longitude,
        fingerprint: fingerprint(store),
        resolvedAt: new Date().toISOString(),
      };
    }
  }
  return null;
}

async function resolveLocations(apiOrigin, key) {
  const upstream = await fetch(new URL("/api/stores", apiOrigin), {
    signal: AbortSignal.timeout(20000),
  });
  if (!upstream.ok) throw new Error("Store API unavailable");
  const stores = await upstream.json();
  const cache = await readCache();
  const placeIds = await readPlaceIds();
  const physical = stores.filter((store) => store.is_physical !== false);
  const lookupOrder = [...physical].sort((a, b) => {
    const rank = (store) =>
      store.adapter === "namdhari" ? 0 : placeIds[store.id] ? 1 : 2;
    return rank(a) - rank(b);
  });
  for (const store of lookupOrder) {
    if (store.adapter === "namdhari" && store.location_input?.location_header) {
      const [latitude, longitude] = store.location_input.location_header
        .split(":")
        .map(Number);
      if (
        latitude > 12.7 &&
        latitude < 13.2 &&
        longitude > 77.4 &&
        longitude < 77.9
      ) {
        cache[store.id] = {
          latitude,
          longitude,
          fingerprint: fingerprint(store),
          source: "registry",
        };
        continue;
      }
    }
    if (cache[store.id]?.fingerprint === fingerprint(store)) continue;
    try {
      const found = await resolveStore(store, key, placeIds);
      if (found) cache[store.id] = found;
    } catch (error) {
      console.warn(`Could not locate ${store.id}: ${error.message}`);
      if (error.status === 429) break;
    }
  }
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(
    cachePath,
    JSON.stringify(
      { cachedAt: new Date().toISOString(), locations: cache },
      null,
      2,
    ),
  );
  return {
    locations: Object.fromEntries(
      physical
        .filter((store) => cache[store.id])
        .map((store) => [
          store.id,
          {
            latitude: cache[store.id].latitude,
            longitude: cache[store.id].longitude,
          },
        ]),
    ),
    unmapped: physical
      .filter((store) => !cache[store.id])
      .map((store) => store.id),
  };
}

export async function storeLocations(apiOrigin) {
  const key = await mapsKey();
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  if (!inFlight)
    inFlight = resolveLocations(apiOrigin, key).finally(() => {
      inFlight = null;
    });
  return inFlight;
}
