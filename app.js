import { renderStoreMap, destroyStoreMap } from "./store-map-client.js";

const app = document.querySelector("#app");
const state = {
  stores: null,
  storesError: null,
  area: "All areas",
  view:
    new URLSearchParams(location.search).get("view") === "map" ? "map" : "list",
  selectedStoreId: null,
  storeQuery: "",
  store: null,
  productQuery: "",
  productPage: 1,
  products: null,
  productsError: null,
  productsLoading: false,
  coordinates: null,
  routeVersion: 0,
  productVersion: 0,
  savedProducts: null,
  savedError: null,
  saving: false,
  savedVersion: 0,
  nearbyPosition: null,
  nearbyLocations: null,
  nearbyStatus: "idle",
  nearbyMessage: "",
};

function listKey() {
  let key = localStorage.getItem("cartaround-list-key");
  if (!key) {
    key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    localStorage.setItem("cartaround-list-key", key);
  }
  return key;
}

async function savedRequest(path = "", method = "GET", body) {
  const response = await fetch(`/api/saved-products${path}`, {
    method,
    headers: { accept: "application/json", "x-list-key": listKey(), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

function updateSavedCount() {
  const count = document.querySelector("#saved-count");
  if (count) count.textContent = state.savedProducts?.length ? `(${state.savedProducts.length})` : "";
}

async function loadSavedProducts() {
  const version = ++state.savedVersion;
  try {
    const products = await savedRequest();
    if (version !== state.savedVersion) return;
    state.savedProducts = products;
    state.savedError = null;
  } catch (error) {
    if (version !== state.savedVersion) return;
    state.savedError = error.message;
  }
  updateSavedCount();
  if (location.pathname === "/saved") renderSavedRoute();
  else renderProductResults();
}

function destroyMap() {
  destroyStoreMap();
}

const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

const safeURL = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

function addressMapURL(store) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address || `${store.store_name}, Bengaluru, Karnataka`)}`;
}

const initials = (name) =>
  String(name || "Store")
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
const brandTone = (brand) => {
  let hash = 0;
  for (const char of String(brand))
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ["violet", "mint", "orange", "blue", "pink", "sage"][hash % 6];
};

function storeLogo(store) {
  const supplied = safeURL(store.logo_url);
  if (supplied) return supplied;
  const domains = {
    Croma: "croma.com",
    Lenskart: "lenskart.com",
    "Max Fashion": "maxfashion.in",
    "Reliance Digital": "reliancedigital.in",
    "Samsung Experience Store": "samsung.com",
    "Titan World": "titan.co.in",
    Zudio: "zudio.com",
    PUMA: "puma.com",
    "Vijay Sales": "vijaysales.com",
    "Simpli Namdhari's": "simplinamdharis.com",
    Foodstories: "foodstories.shop",
    "Paws & Collars": "pawsncollars.com",
    Goodgudi: "goodgudi.com",
    "ARAKU Coffee": "arakucoffee.in",
    "Organic Mandya": "organicmandya.com",
    "Pet Warehouse / Petsfirst": "petsfirst.care",
    "Divine Hindu": "divinehindu.in",
    Glenands: "glenands.com",
  };
  const directIcons = {
    Zudio: "https://www.zudio.com/cdn/shop/files/logo_300x300.png?v=1613519896",
    "Oh My Dawg": "https://www.ohmydawg.in/favicon.ico",
    "Dhatu Organics":
      "https://www.dhatuorganics.com/cdn/shop/files/logo1_8bd11fbd-fbb6-4fbb-8fce-bfdd3dadd705.png?v=1776236435&width=180",
  };
  if (directIcons[store.brand]) return directIcons[store.brand];
  const domain = domains[store.brand];
  return domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
    : null;
}

function logoTile(store, className = "brand-tile") {
  const logo = storeLogo(store);
  return `<span class="${className} ${brandTone(store.brand)}"><span class="logo-fallback">${escapeHTML(initials(store.brand))}</span>${logo ? `<img src="${escapeHTML(logo)}" alt="" loading="lazy" data-store-logo />` : ""}</span>`;
}

async function getJSON(path) {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(", ")
        : data.message || `Request failed (${response.status})`,
    );
  return data;
}

function navigate(path) {
  if (location.pathname !== path) history.pushState({}, "", path);
  renderRoute();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function currentStoreId() {
  const match = location.pathname.match(/^\/stores\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function renderRoute() {
  destroyMap();
  state.routeVersion++;
  const id = currentStoreId();
  if (location.pathname === "/saved") renderSavedRoute();
  else if (id) renderStoreRoute(id, state.routeVersion);
  else renderDirectoryRoute();
}

function renderDirectoryRoute() {
  state.view =
    new URLSearchParams(location.search).get("view") === "map" ? "map" : "list";
  document.title = "CartAround — Stores in Bengaluru";
  app.innerHTML = directoryTemplate();
  renderDirectoryResults();
  if (!state.stores && !state.storesError) loadStores();
  if (state.nearbyStatus === "idle") useNearbyLocation();
}

function distanceKm(from, to) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitude = radians(Number(to.latitude) - from.latitude);
  const longitude = radians(Number(to.longitude) - from.longitude);
  const arc = Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(Number(to.latitude))) *
    Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

function useNearbyLocation() {
  if (!navigator.geolocation) {
    state.nearbyStatus = "unavailable";
    state.nearbyMessage = "Location is unavailable in this browser. Showing all stores.";
    renderNearbyStatus();
    return;
  }
  state.nearbyStatus = "locating";
  state.nearbyLocations = null;
  state.nearbyMessage = "Finding stores within 5 km of you…";
  renderDirectoryResults();
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    const position = { latitude: coords.latitude, longitude: coords.longitude };
    state.nearbyPosition = position;
    state.nearbyStatus = "loading";
    state.nearbyMessage = "Checking nearby branch locations…";
    renderNearbyStatus();
    try {
      const data = await getJSON("/api/map/stores");
      state.nearbyLocations = data.locations || {};
      state.nearbyStatus = "active";
      state.nearbyMessage = "Showing verified stores within 5 km of your location.";
    } catch {
      state.nearbyStatus = "unavailable";
      state.nearbyMessage = "Store locations could not load. Showing all stores.";
    }
    renderDirectoryResults();
  }, () => {
    state.nearbyStatus = "unavailable";
    state.nearbyMessage = "Location access was unavailable. Showing all stores.";
    renderDirectoryResults();
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}

function renderNearbyStatus() {
  const target = document.querySelector("#nearby-status");
  if (!target) return;
  if (state.view === "map" && state.nearbyPosition && state.nearbyLocations) {
    target.textContent = "Map shows only verified stores within 5 km of your location.";
    return;
  }
  target.innerHTML = `<span>${escapeHTML(state.nearbyMessage || "Use your location to find stores within 5 km.")}</span>${state.nearbyStatus === "unavailable" ? '<button type="button" data-retry-nearby>Try location again</button>' : state.nearbyStatus === "active" ? '<button type="button" data-show-all-stores>Show all stores</button>' : state.nearbyStatus === "all" ? '<button type="button" data-retry-nearby>Show nearby stores</button>' : ""}`;
}

async function loadStores() {
  try {
    const stores = await getJSON("/api/stores");
    if (!Array.isArray(stores))
      throw new Error("Unexpected store response from the backend.");
    state.stores = stores;
    state.storesError = null;
  } catch (error) {
    state.storesError = error.message;
  }
  if (location.pathname === "/") {
    destroyMap();
    app.innerHTML = directoryTemplate();
    renderDirectoryResults();
  }
}

function directoryTemplate() {
  const count = state.stores?.length;
  return `
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <div class="eyebrow"><span class="eyebrow-line"></span> YOUR CITY, YOUR STORES</div>
        <h1 id="hero-title">The city is yours.<br /><em>Find it nearby.</em></h1>
        <p>From everyday essentials to the things you love, explore stores across Bengaluru in one place.</p>
        <a class="hero-action" href="#stores">Explore Bengaluru stores <span aria-hidden="true">⌄</span></a>
        <div class="hero-stat"><strong>${count ?? "—"}</strong><span>store listings<br />across Bengaluru</span></div>
      </div>
      <div class="city-visual" aria-label="Bengaluru is the selected city">
        <div class="visual-grid"></div>
        <div class="visual-road road-one"></div><div class="visual-road road-two"></div><div class="visual-road road-three"></div>
        <span class="map-area area-one">WHITEFIELD</span>
        <span class="map-area area-two">INDIRANAGAR</span>
        <span class="map-area area-three">KORAMANGALA</span>
        <span class="map-area area-four">HSR LAYOUT</span>
        <span class="map-area area-five">JAYANAGAR</span>
        <span class="map-orbit orbit-one"></span><span class="map-orbit orbit-two"></span>
        <div class="city-marker"><span class="marker-pulse"></span><span class="marker-core"></span></div>
        <div class="city-label"><span class="city-label-top">CURRENTLY EXPLORING</span><strong>Bengaluru</strong><span>Bangalore, Karnataka</span></div>
        <div class="map-caption"><span class="caption-dot"></span> YOUR LOCAL DISCOVERY STARTS HERE</div>
      </div>
    </section>
    <section class="directory content-width" id="stores" aria-labelledby="stores-title">
      <div class="section-intro"><div><div class="section-kicker">EXPLORE LOCALLY</div><h2 id="stores-title">Stores around Bengaluru<span class="heading-dot">.</span></h2><p>Pick a store to see its products and reported availability.</p></div><span class="directory-count" id="directory-count"></span></div>
      <div class="directory-controls"><label class="search-box"><span class="search-icon" aria-hidden="true"></span><span class="sr-only">Search stores</span><input id="store-search" type="search" placeholder="Search stores, brands, or neighbourhoods" value="${escapeHTML(state.storeQuery)}" autocomplete="off" /></label><div class="view-toggle" role="group" aria-label="Store view"><button type="button" data-view="list" class="${state.view === "list" ? "active" : ""}" aria-pressed="${state.view === "list"}">List</button><button type="button" data-view="map" class="${state.view === "map" ? "active" : ""}" aria-pressed="${state.view === "map"}">Map</button></div></div>
      <div class="nearby-status" id="nearby-status" role="status"></div>
      <div class="area-list" id="area-list" aria-label="Filter by neighbourhood"></div>
      <div id="store-results" aria-live="polite"></div>
    </section>`;
}

function renderDirectoryResults() {
  const list = document.querySelector("#store-results");
  const areas = document.querySelector("#area-list");
  if (!list || !areas) return;
  renderNearbyStatus();
  destroyMap();

  if (state.storesError) {
    areas.innerHTML = "";
    list.innerHTML = `<div class="feedback"><div class="feedback-icon">!</div><h3>Couldn’t load stores</h3><p>${escapeHTML(state.storesError)}</p><button type="button" class="solid-button" data-retry-stores>Try again</button></div>`;
    return;
  }
  if (!state.stores) {
    areas.innerHTML = "";
    list.innerHTML = `<div class="loading-grid">${Array.from({ length: 6 }, () => '<div class="store-skeleton"></div>').join("")}</div>`;
    return;
  }

  const allAreas = [
    ...new Set(state.stores.map((store) => store.location).filter(Boolean)),
  ].sort();
  areas.innerHTML = ["All areas", ...allAreas]
    .map(
      (area) =>
        `<button class="area-chip ${state.area === area ? "active" : ""}" type="button" data-area="${escapeHTML(area)}" aria-pressed="${state.area === area}">${escapeHTML(area)}</button>`,
    )
    .join("");

  const stores = filteredStores();
  const mapStores = state.nearbyPosition && state.nearbyLocations
    ? stores.filter((store) =>
        store.is_physical !== false &&
        state.nearbyLocations[store.id] &&
        distanceKm(state.nearbyPosition, state.nearbyLocations[store.id]) <= 5,
      )
    : [];
  const visibleStores = state.view === "map" ? mapStores : stores;
  document.querySelector("#directory-count").textContent =
    `${visibleStores.length} ${visibleStores.length === 1 ? "STORE" : "STORES"}`;
  list.innerHTML = state.view === "map" && state.nearbyPosition && state.nearbyLocations
    ? `<div class="map-layout"><div class="map-panel"><div id="store-map" role="region" aria-label="Map showing stores and your 5 km area in Bengaluru"><div class="map-loading">Locating stores on the map...</div></div><div class="map-note" id="map-note">Store pins show verified branch locations. Select a logo to see products.</div></div><aside id="map-sidebar" class="map-sidebar" aria-label="Stores on the map"></aside></div>`
    : state.view === "map"
      ? `<div class="feedback"><div class="feedback-icon">⌖</div><h3>Location needed for the map</h3><p>${state.nearbyStatus === "locating" || state.nearbyStatus === "loading" ? "Finding your location and nearby stores…" : "Allow location access to see stores within 5 km of you."}</p>${state.nearbyStatus === "locating" || state.nearbyStatus === "loading" ? "" : '<button type="button" class="solid-button" data-retry-nearby>Use my location</button>'}</div>`
    : stores.length
      ? `<div class="store-grid">${stores.map(storeCard).join("")}</div>`
    : `<div class="feedback"><div class="feedback-icon">⌕</div><h3>No stores found</h3><p>${state.nearbyStatus === "active" ? "No verified stores match within 5 km. Try another search or show all stores." : "Try another store name or neighbourhood."}</p><button type="button" class="solid-button" data-clear-filters>Clear filters</button></div>`;
  if (state.view === "map" && state.nearbyPosition && state.nearbyLocations)
    renderStoreMap(mapStores, { logoURL: storeLogo, initials, navigate, currentLocation: state.nearbyPosition, nearbyActive: true });
}

function filteredStores() {
  const query = state.storeQuery.trim().toLowerCase();
  return (state.stores || []).filter(
    (store) =>
      (state.nearbyStatus !== "active" ||
        (store.is_physical !== false &&
          state.nearbyLocations?.[store.id] &&
          distanceKm(state.nearbyPosition, state.nearbyLocations[store.id]) <= 5)) &&
      (state.area === "All areas" || store.location === state.area) &&
      (!query ||
        [store.store_name, store.brand, store.location, store.address].some(
          (value) =>
            String(value || "")
              .toLowerCase()
              .includes(query),
        )),
  ).sort((a, b) => state.nearbyStatus === "active"
    ? distanceKm(state.nearbyPosition, state.nearbyLocations[a.id]) - distanceKm(state.nearbyPosition, state.nearbyLocations[b.id])
    : 0);
}

function storeCard(store) {
  const label =
    store.is_physical === false
      ? "Delivery listing"
      : store.capability === "branch_inventory"
        ? "Branch inventory"
        : store.capability === "unverified"
          ? "Catalogue unverified"
          : "Explore catalogue";
  return `<a class="store-card" href="/stores/${encodeURIComponent(store.id)}" data-store-id="${escapeHTML(store.id)}">
    <div class="card-top">${logoTile(store)}<span class="card-visit" aria-hidden="true">↗</span></div>
    <div class="card-location"><span class="mini-pin" aria-hidden="true"></span>${escapeHTML(store.location || "Bengaluru")}${state.nearbyStatus === "active" ? ` · ${distanceKm(state.nearbyPosition, state.nearbyLocations[store.id]).toFixed(1)} km away` : ""}</div>
    <h3>${escapeHTML(store.store_name)}</h3>
    <p class="card-address">${escapeHTML(store.address || "Bengaluru, Karnataka")}</p>
    <div class="card-bottom"><span class="catalogue-label">${escapeHTML(label)}</span><span class="view-products">View products</span></div>
  </a>`;
}

async function renderStoreRoute(id, version) {
  state.store = state.stores?.find((item) => item.id === id) || null;
  state.productQuery = "";
  state.productPage = 1;
  state.products = null;
  state.productsError = null;
  state.coordinates = state.nearbyPosition;
  document.title = `${state.store?.store_name || "Store"} — CartAround`;
  renderStorePage();
  if (!state.store) {
    try {
      state.store = await getJSON(`/api/stores/${encodeURIComponent(id)}`);
      if (version !== state.routeVersion) return;
      document.title = `${state.store.store_name} — CartAround`;
      renderStorePage();
    } catch (error) {
      if (version !== state.routeVersion) return;
      app.innerHTML = `<div class="content-width route-error"><div class="feedback"><div class="feedback-icon">!</div><h2>Store unavailable</h2><p>${escapeHTML(error.message)}</p><a class="solid-button" href="/" data-home>Back to stores</a></div></div>`;
      return;
    }
  }
  loadProducts();
}

function renderStorePage() {
  const store = state.store;
  app.innerHTML = `
    <section class="store-page content-width">
      <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/" data-home>All Bengaluru stores</a><span aria-hidden="true">/</span><span>${escapeHTML(store?.store_name || "Store")}</span></nav>
      ${store ? `<div class="store-heading"><div class="store-heading-copy"><span class="store-overline"><span class="mini-pin" aria-hidden="true"></span> ${escapeHTML(store.location || "Bengaluru")} · Bengaluru</span><h1>${escapeHTML(store.store_name)}<span class="heading-dot">.</span></h1><p>${escapeHTML(store.address || "Bengaluru, Karnataka")}</p><a class="store-map-link" href="${escapeHTML(addressMapURL(store))}" target="_blank" rel="noopener noreferrer">View address on map<span class="sr-only"> (opens in a new tab)</span></a></div>${logoTile(store, "store-brand-tile")}</div>` : '<div class="store-heading loading-heading">Loading store...</div>'}
      <div class="store-divider"></div>
      <div class="products-intro"><div><div class="section-kicker">FROM THIS STORE</div><h2>Explore products<span class="heading-dot">.</span></h2><p>Prices and availability come from the retailer’s latest response.</p></div></div>
      <form id="product-search-form" class="product-search"><label class="search-box"><span class="search-icon" aria-hidden="true"></span><span class="sr-only">Search products in this store</span><input id="product-search" type="search" placeholder="Search products in this store" maxlength="100" value="${escapeHTML(state.productQuery)}" /></label><button class="solid-button" type="submit">Search products</button></form>
      <div id="product-results" aria-live="polite"></div>
    </section>`;
  renderProductResults();
}

function renderSavedRoute() {
  document.title = "Saved products — CartAround";
  const items = state.savedProducts;
  app.innerHTML = `<section class="store-page content-width"><nav class="breadcrumb"><a href="/" data-home>All Bengaluru stores</a><span aria-hidden="true">/</span><span>Saved list</span></nav><div class="products-intro"><div><div class="section-kicker">YOUR LIST</div><h1>Saved products<span class="heading-dot">.</span></h1><p>Keep product details handy. Prices and availability are from when you saved each item.</p></div></div><div aria-live="polite">${state.savedError ? `<div class="feedback"><h3>Couldn’t load your list</h3><p>${escapeHTML(state.savedError)}</p><button class="solid-button" data-retry-saved>Try again</button></div>` : !items ? '<div class="results-meta">LOADING YOUR LIST...</div>' : items.length ? `<div class="product-grid">${items.map((item) => productCard(item, true)).join("")}</div>` : '<div class="feedback"><h3>Your list is empty</h3><p>Open a store and save products you want to remember.</p><a class="solid-button" href="/" data-home>Explore stores</a></div>'}</div></section>`;
}

async function loadProducts() {
  if (!state.store) return;
  const id = state.store.id;
  const version = ++state.productVersion;
  state.productsLoading = true;
  state.productsError = null;
  renderProductResults();
  const params = new URLSearchParams({
    q: state.productQuery,
    page: String(state.productPage),
    pageSize: "12",
  });
  if (state.coordinates) {
    params.set("latitude", String(state.coordinates.latitude));
    params.set("longitude", String(state.coordinates.longitude));
  }
  try {
    const result = await getJSON(
      `/api/stores/${encodeURIComponent(id)}/products?${params}`,
    );
    if (version !== state.productVersion || currentStoreId() !== id) return;
    state.products = result;
  } catch (error) {
    if (version !== state.productVersion || currentStoreId() !== id) return;
    state.productsError = error.message;
    state.products = null;
  }
  state.productsLoading = false;
  renderProductResults();
}

function statusMessage(result) {
  const messages = {
    store_product_api_unverified:
      "This store has no verified product catalogue connection yet.",
    temporarily_unavailable:
      "The retailer’s product catalogue is temporarily unavailable. Please try again later.",
    location_required:
      "This retailer needs your delivery location to show available products.",
    location_unserviceable:
      "This retailer does not currently service the selected location.",
  };
  return (
    result.message ||
    messages[result.integration_status] ||
    "No products found for this search."
  );
}

function renderProductResults() {
  const target = document.querySelector("#product-results");
  if (!target) return;
  if (state.productsLoading) {
    target.innerHTML = `<div class="results-meta">LOOKING THROUGH THE CATALOGUE...</div><div class="loading-grid">${Array.from({ length: 6 }, () => '<div class="product-skeleton"></div>').join("")}</div>`;
    return;
  }
  if (state.productsError) {
    target.innerHTML = `<div class="feedback"><div class="feedback-icon">!</div><h3>Couldn’t load products</h3><p>${escapeHTML(state.productsError)}</p><button type="button" class="solid-button" data-retry-products>Try again</button></div>`;
    return;
  }
  const result = state.products;
  if (!result) return;
  if (!result.items?.length) {
    target.innerHTML = `<div class="feedback"><div class="feedback-icon">⌕</div><h3>${result.integration_status === "connected" ? "No products found" : "Products unavailable"}</h3><p>${escapeHTML(statusMessage(result))}</p>${result.integration_status === "location_required" ? '<button type="button" class="solid-button" data-use-location>Use my location</button>' : state.productQuery ? '<button type="button" class="solid-button" data-clear-product-search>Clear search</button>' : ""}</div>`;
    return;
  }
  target.innerHTML = `
    <div class="results-meta"><span>${escapeHTML(result.items.length)} PRODUCTS ON THIS PAGE</span><span>PAGE ${escapeHTML(result.pagination?.current_page || state.productPage)}</span></div>
    <div class="product-grid">${result.items.map((item, index) => productCard(item, false, index)).join("")}</div>
    <div class="pagination"><button type="button" class="page-button" data-page="${state.productPage - 1}" ${state.productPage <= 1 ? "disabled" : ""}>Previous</button><span>Page ${state.productPage}</span><button type="button" class="page-button" data-page="${state.productPage + 1}" ${result.pagination?.has_next ? "" : "disabled"}>Next</button></div>`;
  for (const image of target.querySelectorAll(".product-image img"))
    image.addEventListener("error", () => image.remove(), { once: true });
}

function productCard(item, saved = false, index = 0) {
  const image = safeURL(item.image_url);
  const source = safeURL(item.source_url);
  const price =
    item.price && Number.isFinite(Number(item.price.amount))
      ? new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: item.price.currency || "INR",
          maximumFractionDigits: 2,
        }).format(item.price.amount)
      : "Price unavailable";
  const { label, tone, scope } = availabilityInfo(item.availability);
  return `<article class="product-card">
    <div class="product-image"><span class="product-placeholder" aria-hidden="true">${escapeHTML(initials(item.title))}</span>${image ? `<img src="${escapeHTML(image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ""}</div>
    <div class="product-info">${label ? `<div class="availability ${tone}"><span class="availability-dot"></span>${escapeHTML(label)}</div>` : ""}<h3>${escapeHTML(item.title)}</h3>${saved ? `<a class="saved-store" href="/stores/${encodeURIComponent(item.store_id)}" data-store-id="${escapeHTML(item.store_id)}">${escapeHTML(item.store_name)}</a>` : ""}<p class="stock-scope">${escapeHTML(scope)}</p><div class="product-bottom"><strong>${escapeHTML(price)}</strong>${source ? `<a href="${escapeHTML(source)}" target="_blank" rel="noopener noreferrer">Retailer site<span class="sr-only"> (opens in a new tab)</span></a>` : ""}</div><button class="save-button" type="button" ${saved ? `data-remove-saved="${escapeHTML(item.id)}"` : `data-save-product="${index}"`} ${state.saving ? "disabled" : ""}>${saved ? "Remove from list" : state.savedProducts?.some((entry) => entry.store_id === state.store?.id && entry.product_id === item.product_id && entry.variant_id === item.variant_id) ? "Saved ✓" : "Add to list"}</button></div>
  </article>`;
}

function availabilityInfo(availability = {}) {
  const scope =
    {
      physical_store: "At this branch",
      pincode: "For this PIN code",
      warehouse: "Warehouse stock",
      city_delivery: "City delivery",
      store_pickup: "Store pickup",
      catalog_only: "Catalogue listing",
    }[availability.scope] || "Availability not specified";
  if (availability.status === "reported_in_stock")
    return { label: "Reported in stock", tone: "positive", scope };
  if (availability.status === "pickup_available")
    return { label: "Pickup available", tone: "positive", scope };
  if (availability.status === "reported_out_of_stock")
    return { label: "Reported out of stock", tone: "negative", scope };
  return { label: "", tone: "neutral", scope };
}

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-retry-nearby]")) { useNearbyLocation(); return; }
  if (event.target.closest("[data-show-all-stores]")) {
    state.nearbyStatus = "all";
    state.nearbyMessage = "Showing all Bengaluru stores.";
    renderDirectoryResults();
    return;
  }
  const savedLink = event.target.closest("[data-saved-link]");
  if (savedLink) { event.preventDefault(); navigate("/saved"); return; }
  if (event.target.closest("[data-retry-saved]")) { loadSavedProducts(); return; }
  const saveButton = event.target.closest("[data-save-product]");
  if (saveButton && !state.saving) {
    const item = state.products?.items?.[Number(saveButton.dataset.saveProduct)];
    if (!item || !state.store) return;
    state.saving = true;
    saveButton.disabled = true;
    savedRequest("", "POST", { ...item, store_id: state.store.id }).then(() => loadSavedProducts()).catch((error) => alert(`Couldn’t save product: ${error.message}`)).finally(() => { state.saving = false; renderProductResults(); });
    return;
  }
  const removeButton = event.target.closest("[data-remove-saved]");
  if (removeButton && !state.saving) {
    state.saving = true;
    removeButton.disabled = true;
    savedRequest(`/${encodeURIComponent(removeButton.dataset.removeSaved)}`, "DELETE").then(() => loadSavedProducts()).catch((error) => alert(`Couldn’t remove product: ${error.message}`)).finally(() => { state.saving = false; if (location.pathname === "/saved") renderSavedRoute(); });
    return;
  }
  const view = event.target.closest("[data-view]");
  if (view) {
    state.view = view.dataset.view;
    state.selectedStoreId = null;
    history.replaceState({}, "", state.view === "map" ? "/?view=map" : "/");
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === state.view);
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.view === state.view),
      );
    });
    renderDirectoryResults();
    return;
  }
  const home = event.target.closest("[data-home]");
  if (home) {
    event.preventDefault();
    navigate("/");
    return;
  }
  const card = event.target.closest("[data-store-id]");
  if (card) {
    event.preventDefault();
    navigate(card.getAttribute("href"));
    return;
  }
  const area = event.target.closest("[data-area]");
  if (area) {
    state.area = area.dataset.area;
    renderDirectoryResults();
    return;
  }
  if (event.target.closest("[data-retry-stores]")) {
    state.storesError = null;
    renderDirectoryResults();
    loadStores();
    return;
  }
  if (event.target.closest("[data-clear-filters]")) {
    state.area = "All areas";
    state.storeQuery = "";
    document.querySelector("#store-search").value = "";
    renderDirectoryResults();
    return;
  }
  if (event.target.closest("[data-retry-products]")) {
    loadProducts();
    return;
  }
  if (event.target.closest("[data-use-location]")) {
    if (!navigator.geolocation) {
      state.productsError = "Location is not available in this browser.";
      renderProductResults();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        state.coordinates = {
          latitude: coords.latitude,
          longitude: coords.longitude,
        };
        loadProducts();
      },
      () => {
        state.productsError =
          "Location access was unavailable. Allow location access and try again.";
        renderProductResults();
      },
      { timeout: 10000 },
    );
    return;
  }
  if (event.target.closest("[data-clear-product-search]")) {
    state.productQuery = "";
    state.productPage = 1;
    document.querySelector("#product-search").value = "";
    loadProducts();
    return;
  }
  const page = event.target.closest("[data-page]");
  if (page && !page.disabled) {
    state.productPage = Number(page.dataset.page);
    loadProducts();
    document
      .querySelector(".products-intro")
      ?.scrollIntoView({ behavior: "smooth" });
  }
});

document.addEventListener(
  "error",
  (event) => {
    if (event.target.matches?.("[data-store-logo]")) event.target.remove();
  },
  true,
);

document.addEventListener("input", (event) => {
  if (event.target.id === "store-search") {
    state.storeQuery = event.target.value;
    renderDirectoryResults();
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.id !== "product-search-form") return;
  event.preventDefault();
  state.productQuery = document.querySelector("#product-search").value.trim();
  state.productPage = 1;
  loadProducts();
});

window.addEventListener("popstate", renderRoute);
renderRoute();
loadSavedProducts();
