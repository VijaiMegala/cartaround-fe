let activeMap = null;
let activePins = new Map();
let googleLoader = null;

export function destroyStoreMap() {
  for (const pin of activePins.values()) pin.setMap(null);
  activePins = new Map();
  activeMap = null;
}

async function loadGoogleMaps() {
  if (window.google?.maps) return window.google.maps;
  if (!googleLoader) {
    googleLoader = (async () => {
      const response = await fetch("/api/map/config");
      const config = await response.json();
      if (!response.ok || !config.key)
        throw new Error(config.message || "Google Maps is not configured.");
      await new Promise((resolve, reject) => {
        const callback = `cartAroundMapsReady_${Date.now()}`;
        window[callback] = () => {
          delete window[callback];
          resolve();
        };
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.key)}&v=weekly&loading=async&callback=${callback}`;
        script.async = true;
        script.onerror = () => reject(new Error("Google Maps could not load."));
        document.head.appendChild(script);
      });
      return window.google.maps;
    })();
  }
  return googleLoader;
}

function makePin(store, position, options, onSelect) {
  const { logoURL, initials } = options;
  class StorePin extends google.maps.OverlayView {
    constructor() {
      super();
      this.position = new google.maps.LatLng(
        position.latitude,
        position.longitude,
      );
    }
    onAdd() {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "store-logo-pin";
      button.title = store.store_name;
      button.setAttribute("aria-label", `View ${store.store_name}`);
      button.textContent = initials(store.brand);
      const logo = logoURL(store);
      if (logo) {
        const img = document.createElement("img");
        img.src = logo;
        img.alt = "";
        img.onerror = () => img.remove();
        button.appendChild(img);
      }
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelect(store);
      });
      this.element = button;
      this.getPanes().overlayMouseTarget.appendChild(button);
    }
    draw() {
      const point = this.getProjection().fromLatLngToDivPixel(this.position);
      if (point && this.element) {
        this.element.style.left = `${point.x - 22}px`;
        this.element.style.top = `${point.y - 52}px`;
      }
    }
    onRemove() {
      this.element?.remove();
    }
  }
  const pin = new StorePin();
  pin.setMap(activeMap);
  return pin;
}

export async function renderStoreMap(stores, options) {
  const element = document.querySelector("#store-map");
  const sidebar = document.querySelector("#map-sidebar");
  const note = document.querySelector("#map-note");
  if (!element || !sidebar) return;
  sidebar.innerHTML =
    '<div class="map-side-heading"><h3>Finding store locations</h3><p>Loading individual branches...</p></div>';
  try {
    const [maps, response] = await Promise.all([
      loadGoogleMaps(),
      fetch("/api/map/stores"),
    ]);
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.message || "Store locations could not load.");
    if (!element.isConnected) return;
    element.innerHTML = "";
    activeMap = new maps.Map(element, {
      center: { lat: 12.95, lng: 77.66 },
      zoom: 11,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: "cooperative",
    });
    const mapped = stores.filter(
      (store) => store.is_physical !== false && data.locations?.[store.id],
    );
    const bounds = new maps.LatLngBounds();
    for (const store of mapped) {
      const position = data.locations[store.id];
      bounds.extend({ lat: position.latitude, lng: position.longitude });
      activePins.set(store.id, makePin(store, position, options, selectStore));
    }
    if (mapped.length) {
      activeMap.fitBounds(bounds, 55);
      const maxFitZoom = mapped.length > 30 ? 12 : 15;
      maps.event.addListenerOnce(activeMap, "idle", () => {
        if (activeMap?.getZoom() > maxFitZoom) activeMap.setZoom(maxFitZoom);
      });
    }
    const missing = stores.filter(
      (store) => store.is_physical !== false && !data.locations?.[store.id],
    );
    if (note)
      note.textContent = `${mapped.length} verified branch pins${missing.length ? ` · ${missing.length} address${missing.length === 1 ? "" : "es"} still need verification` : ""}. Select a logo to see products.`;

    function showList() {
      for (const pin of activePins.values())
        pin.element?.classList.remove("active");
      sidebar.innerHTML =
        '<div class="map-side-heading"><span class="section-kicker">STORES ON THE MAP</span><h3>Explore branches</h3><p>Select a logo or store to see its products.</p></div><div class="map-store-list"></div>';
      const list = sidebar.querySelector(".map-store-list");
      for (const store of mapped) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "map-store-row-button";
        const logo = options.logoURL(store);
        const tile = document.createElement("span");
        tile.className = "map-store-brand";
        tile.textContent = options.initials(store.brand);
        if (logo) {
          const image = document.createElement("img");
          image.src = logo;
          image.alt = "";
          image.onerror = () => image.remove();
          tile.appendChild(image);
        }
        const copy = document.createElement("span");
        copy.className = "map-store-copy";
        const name = document.createElement("strong");
        name.textContent = store.store_name;
        const address = document.createElement("small");
        address.textContent = store.address || store.location;
        copy.append(name, address);
        row.append(tile, copy);
        row.addEventListener("click", () => selectStore(store));
        list.appendChild(row);
      }
      for (const store of missing) {
        const row = document.createElement("div");
        row.className = "map-unmapped-row";
        row.textContent = `${store.store_name} · location not verified`;
        list.appendChild(row);
      }
    }

    function selectStore(store) {
      const position = data.locations[store.id];
      if (!position || !activeMap) return;
      activeMap.panTo({ lat: position.latitude, lng: position.longitude });
      activeMap.setZoom(Math.max(activeMap.getZoom() || 12, 15));
      for (const [id, pin] of activePins)
        pin.element?.classList.toggle("active", id === store.id);
      sidebar.innerHTML =
        '<div class="map-side-heading"><button type="button" class="map-back">All stores</button><h3></h3><p></p></div><div class="map-selected-actions"><a class="solid-button" href="#">View products</a></div>';
      sidebar.querySelector("h3").textContent = store.store_name;
      sidebar.querySelector("p").textContent = store.address || store.location;
      sidebar.querySelector(".map-back").addEventListener("click", showList);
      sidebar
        .querySelector(".solid-button")
        .addEventListener("click", (event) => {
          event.preventDefault();
          options.navigate(`/stores/${encodeURIComponent(store.id)}`);
        });
    }
    showList();
  } catch (error) {
    if (!element.isConnected) return;
    element.innerHTML = `<div class="map-unavailable"><h3>Map unavailable</h3><p></p></div>`;
    element.querySelector("p").textContent = error.message;
    sidebar.innerHTML =
      '<div class="map-side-heading"><h3>Store list</h3><p>Locations are unavailable right now.</p></div>';
  }
}
