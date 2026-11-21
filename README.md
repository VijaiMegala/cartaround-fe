# CartAround frontend

A zero-install frontend for the Bengaluru store directory and each store's product catalogue. It reads the backend's live API; it does not include sample inventory.

## Run locally

Set `BACKEND_URL` in `cart-around-frontend/.env` to the backend origin (see `.env.example`), then:

```bash
cd cart-around-frontend
npm run dev
```

Open http://localhost:5173. The frontend server proxies `/api/*` to `BACKEND_URL`, so no backend CORS changes are needed. A shell `BACKEND_URL` overrides the `.env` value. To use a different frontend port:

```bash
PORT=5174 npm run dev
```

The home screen loads `GET /api/stores`. Use **List / Map** to switch views. The Google map shows an individual logo pin at each resolved physical branch; selecting a pin or store opens its product screen. Brand favicons are used where available, with initials as a fallback. The four delivery-only listings have no physical pin.

The frontend server reads `GOOGLE_MAPS_API_KEY` from its environment or the adjacent backend `.env`. It resolves branch positions with Google Places and keeps coordinates in `.cache/store-locations.json` for at most 29 days. That file is ignored by Git. Stable Place IDs are saved in `store-place-ids.json` so expired coordinates can be refreshed without repeating broad text searches. Maps JavaScript loads the key in the browser, so restrict the key to your site origin and the required Google Maps APIs before hosting this frontend publicly. Map usage may incur Google Maps Platform charges.

Store pages load `GET /api/stores/:id` and `GET /api/stores/:id/products`, with product search and pagination. Product availability labels reflect the backend's reported scope and status; unknown stock is never presented as available.
