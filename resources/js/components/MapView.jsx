import { useEffect, useRef, useState } from "react";
import L from "leaflet";

// Ícono para cargas
const cargaIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -28],
});

const estadoColors = {
  draft: "#3498db", // azul
  assigned: "#f1c40f", // amarillo
  delivered: "#2ecc71", // verde
  cancelled: "#e74c3c", // rojo
};

export default function MapView() {
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const routesLayers = useRef({}); // { [routeId]: { polyline, markers, visible } }
  const traccarMarkerRef = useRef(null);
  const [groups, setGroups] = useState([]);
  const contactsMarkersRef = useRef([]);

  const traccarIcon = L.divIcon({
    className: "traccar-icon",
    html: `
      <div class="pulse-wrapper">
        <div class="pulse"></div>
        <div class="dot"></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  function cargaIconForState(state) {
    const color = estadoColors[state] || "#7f8c8d";

    return L.divIcon({
      className: "carga-icon",
      html: `
        <div style="
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: ${color};
          border: 3px solid white;
          box-shadow: 0 0 4px rgba(0,0,0,0.3);
        "></div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }

  /** AGRUPAR CARGAS POR EMPRESA */
  function groupByPartner(data) {
    const grouped = {};
    data.forEach((c) => {
      const p = c.partner;
      if (!p || !p.latitude || !p.longitude) return;

      if (!grouped[p.id]) {
        grouped[p.id] = { partner: p, cargas: [] };
      }

      grouped[p.id].cargas.push(c);
    });
    return Object.values(grouped);
  }

  /** CREAR MAPA */
  useEffect(() => {
    const mapElement = document.getElementById("map");

    // si ya existe -> no volver a crearlo
    if (mapRef.current) return;

    // crear mapa una sola vez
    const map = L.map(mapElement, {
      center: [-40.34647463463274, -72.98086926441867],
      zoom: 14,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

   /** UBICACIÓN TRACCAR EN TIEMPO REAL
  useEffect(() => {
    if (!mapRef.current) return; // esperar a que el mapa exista

    let active = true;
    const map = mapRef.current;

    async function updateTraccarPosition() {
      if (!active) return;

      try {
        const pos = await fetch("/api/traccar/2").then(r => r.json());
        if (!pos.latitude || !pos.longitude) return;

        const lat = pos.latitude;
        const lon = pos.longitude;

        // si el marcador existe -> moverlo
        if (traccarMarkerRef.current) {
          traccarMarkerRef.current.setLatLng([lat, lon]);
        } else {
          // crear nuevo marcador
          traccarMarkerRef.current = L.marker([lat, lon], {
            icon: traccarIcon,
          }).addTo(map);

          traccarMarkerRef.current.bindPopup(`
            <strong>Ubicación en tiempo real</strong><br/>
            Velocidad: ${pos.speed} km/h<br/>
            Batería: ${pos.attributes?.batteryLevel ?? "?"}%
          `);
        }

      } catch (err) {
        console.error("Error consultando Traccar:", err);
      }
    }

    // Ejecutar ahora
    updateTraccarPosition();

    // Ejecutar cada 1 segundos
    const interval = setInterval(updateTraccarPosition, 1000);

    return () => {
      active = false;
      clearInterval(interval);
    };

  }, [mapRef.current]);*/

  // Helper: parse waypoints field safely
  function parseWaypointsField(w) {
    if (!w) return [];
    if (Array.isArray(w)) return w;
    if (typeof w === "string") {
      try {
        const parsed = JSON.parse(w);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  // Draw or update a route using GraphHopper and store in cache
  async function drawRouteUsingGraphhopper(route, options = { fitBounds: true }) {
    const map = mapRef.current;
    if (!map) return;
    if (!route) return;

    // Use only waypoints (per requirement). If none -> skip.
    const waypoints = parseWaypointsField(route.waypoints).filter(Boolean);
    if (!waypoints.length) return;

    // build cleaned points (lat,lon) from waypoints
    const cleaned = waypoints
      .map((p) => {
        // waypoint objects can have lat/lon or latitude/longitude
        const lat = p.lat ?? p.latitude;
        const lon = p.lon ?? p.longitude ?? p.lon;
        if (lat == null || lon == null) return null;
        return { lat: Number(lat), lon: Number(lon) };
      })
      .filter(Boolean);

    if (!cleaned.length) return;

    // Build GraphHopper URL
    let ghUrl = "http://167.114.114.51:8989/graphhopper/route?";
    cleaned.forEach((p) => (ghUrl += `point=${p.lat},${p.lon}&`));
    ghUrl += "profile=truck&points_encoded=false&instructions=false";

    let gh;
    try {
      const res = await fetch(ghUrl);
      gh = await res.json();
    } catch (e) {
      console.error("GraphHopper request failed", e);
      return;
    }

    if (!gh || !gh.paths || !gh.paths[0]) return;

    // compute distance and persist it
    const distanceKm = (gh.paths[0].distance || 0) / 1000;
    try {
      await fetch(`/api/rutas/${route.id}/distance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distance_km: distanceKm }),
      });
      window.dispatchEvent(
        new CustomEvent("route-distance-updated", { detail: { routeId: route.id, distanceKm } })
      );
    } catch (e) {
      console.warn("Failed updating distance", e);
    }

    // get coordinates from GH and convert to [lat,lon]
    const geo = gh.paths[0].points;
    if (!geo || !Array.isArray(geo.coordinates)) return;

    const coordsArr = geo.coordinates.map((c) => [c[1], c[0]]);

    // If an existing layer exists -> update latlngs for smooth update
    const existing = routesLayers.current[route.id];
    const color = routeColor(route.id);

    if (existing && existing.polyline) {
      try {
        existing.polyline.setLatLngs(coordsArr);
        existing.polyline.setStyle({ color });
        existing.visible = true;
      } catch (e) {
        // fallback: remove & recreate
        try {
          existing.polyline.remove();
        } catch (e) {}
        const polyline = L.polyline(coordsArr, { color, weight: 5, opacity: 0.9 }).addTo(map);
        existing.polyline = polyline;
      }
    } else {
      const polyline = L.polyline(coordsArr, { color, weight: 5, opacity: 0.9 }).addTo(map);
      routesLayers.current[route.id] = { polyline, markers: [], visible: true };
    }

    // optionally fit bounds
    if (options.fitBounds) {
      try {
        map.fitBounds(routesLayers.current[route.id].polyline.getBounds(), { padding: [40, 40] });
      } catch (e) {}
    }
  }

  // Load and draw all routes once (A-1 requirement)
  useEffect(() => {
    let active = true;
    async function loadAllRoutes() {
      const map = mapRef.current;
      if (!map) return;

      let rutas = [];
      try {
        rutas = await fetch("/api/rutas").then((r) => r.json());
      } catch (e) {
        console.error("Failed fetching rutas", e);
        return;
      }

      if (!active) return;

      // Draw only routes that have valid waypoints (per requirement)
      for (const r of rutas) {
        const waypoints = parseWaypointsField(r.waypoints);
        if (!waypoints.length) continue; // ignore routes without waypoints

        // Avoid redrawing if exists
        if (routesLayers.current[r.id] && routesLayers.current[r.id].polyline) continue;

        // draw via graphhopper for realistic paths
        await drawRouteUsingGraphhopper(r, { fitBounds: false });
      }
    }

    loadAllRoutes();

    return () => {
      active = false;
    };
  }, []);

  /** CARGAR CARGAS (bruh) */
  useEffect(() => {
    fetch("/api/cargas")
      .then((r) => r.json())
      .then((data) => setGroups(groupByPartner(data)))
      .catch((e) => console.warn(e));
  }, []);

  /** CREAR MARCADORES */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !groups.length) return;

    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    groups.forEach((group) => {
      const { partner, cargas } = group;

      const state =
        cargas.length === 1
          ? cargas[0].state
          : cargas.some((c) => c.state === "cancelled")
          ? "cancelled"
          : cargas.some((c) => c.state === "assigned")
          ? "assigned"
          : cargas.some((c) => c.state === "draft")
          ? "draft"
          : "draft";

      // marcador con color según estado
      const marker = L.marker([partner.latitude, partner.longitude], {
        icon: cargaIconForState(state),
      }).addTo(map);

      let popupHtml = `<strong>${partner.name}</strong><br/>`;

      if (cargas.length === 1) {
        const c = cargas[0];
        popupHtml += `
            <div style="margin-top:6px;">
              <strong>${c.name}</strong><br/>
              Cantidad: ${c.total_quantity} kg<br/>
              Pallets: ${c.total_pallets}
            </div>`;
      } else {
        popupHtml += `<div style="margin-top:8px;">${cargas.length} cargas:</div><ul>`;
        cargas.forEach((c) => (popupHtml += `<li>${c.name}</li>`));
        popupHtml += `</ul>`;
      }

      marker.bindPopup(popupHtml);
      markersRef.current.push(marker);
      marker.partnerId = Number(partner.id);
    });
  }, [groups]);

  /** ENFOCAR CLIENTE DESDE SIDEBAR */
  useEffect(() => {
    function focusClient(ev) {
      let partnerId = ev.detail;
      if (Array.isArray(partnerId)) partnerId = partnerId[0];
      partnerId = Number(partnerId);

      const map = mapRef.current;
      const marker = markersRef.current.find((m) => Number(m.partnerId) === partnerId);
      if (!marker) return;

      map.flyTo(marker.getLatLng(), 14, { duration: 0.8 });
      setTimeout(() => marker.openPopup(), 900);
    }

    window.addEventListener("focus-client", focusClient);
    return () => window.removeEventListener("focus-client", focusClient);
  }, []);

  // Toggle visibilidad de rutas (checkboxes deberían emitir toggle-route-visible)
  useEffect(() => {
    function toggleVisibility(ev) {
      const { id, visible } = ev.detail;
      const map = mapRef.current;
      if (!map) return;

      const layer = routesLayers.current[id];
      if (!layer) return;

      if (visible) {
        if (layer.polyline && !map.hasLayer(layer.polyline)) map.addLayer(layer.polyline);
        layer.markers.forEach((m) => { if (!map.hasLayer(m)) map.addLayer(m); });
        layer.visible = true;
      } else {
        if (layer.polyline && map.hasLayer(layer.polyline)) map.removeLayer(layer.polyline);
        layer.markers.forEach((m) => { if (map.hasLayer(m)) map.removeLayer(m); });
        layer.visible = false;
      }
    }

    window.addEventListener("toggle-route-visible", toggleVisibility);
    return () => window.removeEventListener("toggle-route-visible", toggleVisibility);
  }, []);

  // Legacy toggle-route: keep it but make it only toggle visibility or draw if missing
  useEffect(() => {
    async function toggleRouteLegacy(ev) {
      const routeId = ev.detail;
      const map = mapRef.current;
      if (!map) return;

      const existing = routesLayers.current[routeId];
      if (existing) {
        // just toggle visible
        const visible = !!existing.visible;
        if (visible) {
          if (map.hasLayer(existing.polyline)) map.removeLayer(existing.polyline);
          existing.markers.forEach((m) => { if (map.hasLayer(m)) map.removeLayer(m); });
          existing.visible = false;
        } else {
          if (!map.hasLayer(existing.polyline)) map.addLayer(existing.polyline);
          existing.markers.forEach((m) => { if (!map.hasLayer(m)) map.addLayer(m); });
          existing.visible = true;
        }
        return;
      }

      // if missing, fetch route and draw (draw via GH to get real path)
      try {
        const ruta = await fetch(`/api/rutas/${routeId}`).then((r) => r.json());
        await drawRouteUsingGraphhopper(ruta, { fitBounds: true });
      } catch (e) {
        console.warn("Failed fetching/drawing route", e);
      }
    }

    window.addEventListener("toggle-route", toggleRouteLegacy);
    return () => window.removeEventListener("toggle-route", toggleRouteLegacy);
  }, []);

  // Recalc handler: when modal changes order in real-time it emits 'recalc-route-graphhopper'
  useEffect(() => {
    let pending = {};

    async function recalcHandler(ev) {
      const { routeId, newOrder } = ev.detail || {};
      if (!routeId || !Array.isArray(newOrder)) return;

      // To avoid rapid-fire requests, debounce per route
      if (pending[routeId]) clearTimeout(pending[routeId]);
      pending[routeId] = setTimeout(async () => {
        delete pending[routeId];

        // Call assign endpoint (modal expects this to happen often)
        try {
          await fetch(`/api/rutas/${routeId}/assign`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ load_ids: newOrder }),
          });
        } catch (e) {
          console.warn("Failed to POST assign during recalc", e);
        }

        // Fetch fresh route
        let updated;
        try {
          updated = await fetch(`/api/rutas/${routeId}`).then((r) => r.json());
        } catch (e) {
          console.warn("Failed to fetch updated route after assign", e);
          return;
        }

        // Redraw/Update route using GH (no flicker)
        try {
          await drawRouteUsingGraphhopper(updated, { fitBounds: false });
        } catch (e) {
          console.warn("Failed to redraw route after recalc", e);
        }
      }, 250);
    }

    window.addEventListener("recalc-route-graphhopper", recalcHandler);
    return () => {
      window.removeEventListener("recalc-route-graphhopper", recalcHandler);
    };
  }, []);

  // Mostrar marcadores de contactos
  useEffect(() => {
    function showContacts(ev) {
      const data = ev.detail || [];
      const map = mapRef.current;
      if (!map) return;

      contactsMarkersRef.current.forEach((m) => map.removeLayer(m));
      contactsMarkersRef.current = [];

      data.forEach((c) => {
        if (!c.latitude || !c.longitude) return;

        const arrowIcon = L.divIcon({
          className: "contact-arrow-icon",
          html: `
                <svg width="26" height="26" viewBox="0 0 24 24"
                    fill="#2563eb" stroke="white" stroke-width="2"
                    style="filter: drop-shadow(0 0 3px rgba(0,0,0,0.4));">
                    <path transform="rotate(180 12 12)"
                          d="M12 2 L19 21 L12 17 L5 21 Z"></path>
                </svg>
            `,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        const marker = L.marker([c.latitude, c.longitude], { icon: arrowIcon }).addTo(map);

        marker.bindPopup(`<strong>${c.name}</strong>`);

        contactsMarkersRef.current.push(marker);
      });
    }
    function clearContacts() {
      const map = mapRef.current;
      if (!map) return;
      contactsMarkersRef.current.forEach((m) => map.removeLayer(m));
      contactsMarkersRef.current = [];
    }
    window.addEventListener("contacts-markers-show", showContacts);
    window.addEventListener("contacts-markers-clear", clearContacts);
    return () => {
      window.removeEventListener("contacts-markers-show", showContacts);
      window.removeEventListener("contacts-markers-clear", clearContacts);
    };
  }, []);

  /** ENFOCAR CONTACTO */
  useEffect(() => {
    function focusContact(ev) {
      const contact = ev.detail;
      if (!contact || !contact.latitude || !contact.longitude) return;

      const map = mapRef.current;
      if (!map) return;

      const marker = contactsMarkersRef.current.find(
        (m) => m._latlng.lat === contact.latitude && m._latlng.lng === contact.longitude
      );

      map.flyTo([contact.latitude, contact.longitude], 15, { duration: 0.7 });

      if (marker) {
        setTimeout(() => marker.openPopup(), 800);
      }
    }

    window.addEventListener("focus-contact", focusContact);
    return () => window.removeEventListener("focus-contact", focusContact);
  }, []);

  return (
    <div
      id="map"
      style={{
        width: "100%",
        height: "100vh",
        position: "absolute",
        top: 0,
        left: 0,
      }}
    />
  );
}

/** COLORES PERSISTENTES DE RUTAS */
const colorCache = {};
function routeColor(id) {
  if (colorCache[id]) return colorCache[id];
  const pastel = `hsl(${Math.floor(Math.random() * 360)}, 65%, 75%)`;
  colorCache[id] = pastel;
  return pastel;
}
