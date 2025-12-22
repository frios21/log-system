// sólo Dios sabe cómo funciona este código 🥀
import { useEffect, useRef, useState } from "react";

// --- Google Maps API ---
const GOOGLE_MAPS_API_KEY = "AIzaSyCzyopAjQY-wGVrAPTqfVH1S24YiHuoamk";

let googleMapsPromise = null;
function loadGoogleMaps() {
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve(window.google.maps);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`;
    script.async = true;
    script.onload = () => {
      if (window.google && window.google.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error("Google Maps API no disponible"));
      }
    };
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

const estadoColors = {
  draft: "#3498db", 
  assigned: "#f1c40f", 
  delivered: "#2ecc71", 
  cancelled: "#e74c3c", 
};

// colores de rutas por estado
const routeStatusColor = {
  draft: "#d32f2f",
  assigned: "#f9a825",
  done: "#2e7d32",
};

// selector simple de enrutador
// true = Google Directions, false = ORS
const USE_GOOGLE_DIRECTIONS = false;

// Decode encoded polyline (ORS/Google-style) -> array [lat, lon]
function decodePolyline(str, precision = 5) {
  let index = 0;
  const len = str.length;
  let lat = 0;
  let lng = 0;
  const coordinates = [];
  const factor = Math.pow(10, precision);

  while (index < len) {
    let b, shift = 0, result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    coordinates.push([lat / factor, lng / factor]); // [lat, lon]
  }

  return coordinates;
}

// helper global para pedir ruta a OpenRouteService (perfil truck)
function fetchRouteFromORS(waypoints, profile = "driving-hgv") {
  return (async () => {
    const cleaned = waypoints
      .map((p) => {
        const lat = p.lat ?? p.latitude;
        const lon = p.lon ?? p.longitude ?? p.lon;
        if (lat == null || lon == null) return null;
        return { lat: Number(lat), lon: Number(lon) };
      })
      .filter(Boolean);

    if (cleaned.length < 2) {
      return { coords: [], distM: 0 };
    }

    // ORS espera [lon, lat]
    const coordinates = cleaned.map((p) => [p.lon, p.lat]);

    // llamar al backend, que a su vez llama a ORS (evita CORS y expone menos la API key)
    const url = `/api/rutas/ors-directions`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ coordinates, profile }),
    });

    if (!res.ok) {
      console.warn("ORS error", res.status, url);
      return { coords: [], distM: 0 };
    }

    const json = await res.json();
    const route = json.routes && json.routes[0];
    if (!route || !route.geometry) {
      return { coords: [], distM: 0 };
    }

    // geometry viene como string codificada -> decodificar
    const decoded = decodePolyline(route.geometry, 5);
    const coords = Array.isArray(decoded) ? decoded : [];
    const distM = route.summary?.distance ?? 0;

    return { coords, distM };
  })();
}

// helper alternativo: pedir ruta a Google Directions API (vía JS SDK)
async function fetchRouteFromGoogleDirections(waypoints) {
  const maps = await loadGoogleMaps();

  const cleaned = (waypoints || [])
    .map((p) => {
      const lat = p.lat ?? p.latitude;
      const lon = p.lon ?? p.longitude ?? p.lon;
      if (lat == null || lon == null) return null;
      return { lat: Number(lat), lon: Number(lon) };
    })
    .filter(Boolean);

  if (cleaned.length < 2) {
    return { coords: [], distM: 0 };
  }

  const origin = { lat: cleaned[0].lat, lng: cleaned[0].lon };
  const destination = {
    lat: cleaned[cleaned.length - 1].lat,
    lng: cleaned[cleaned.length - 1].lon,
  };

  const waypointsReq = cleaned.slice(1, cleaned.length - 1).map((p) => ({
    location: { lat: p.lat, lng: p.lon },
    stopover: true,
  }));

  const service = new maps.DirectionsService();

  const result = await new Promise((resolve) => {
    service.route(
      {
        origin,
        destination,
        waypoints: waypointsReq,
        travelMode: maps.TravelMode.DRIVING,
      },
      (res, status) => {
        if (status === "OK" && res && res.routes && res.routes[0]) {
          resolve(res);
        } else {
          console.warn("Google Directions error", status, res);
          resolve(null);
        }
      }
    );
  });

  if (!result) {
    return { coords: [], distM: 0 };
  }

  const route = result.routes[0];
  const overviewPath = route.overview_path || [];
  const coords = overviewPath.map((ll) => [ll.lat(), ll.lng()]); // [lat, lon]

  let distM = 0;
  (route.legs || []).forEach((leg) => {
    distM += leg.distance?.value ?? 0;
  });

  return { coords, distM };
}

export default function MapView() {
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const infoWindowsRef = useRef([]);
  const routesLayers = useRef({});
  const [groups, setGroups] = useState([]);
  const [mapReady, setMapReady] = useState(false);
  const traccarMarkersRef = useRef({});

  function createCircleMarkerElement({ color, size = 20, borderColor = "#ffffff", borderWidth = 3 }) {
    const div = document.createElement("div");
    div.style.width = `${size}px`;
    div.style.height = `${size}px`;
    div.style.borderRadius = "50%";
    div.style.background = color;
    div.style.border = `${borderWidth}px solid ${borderColor}`;
    div.style.boxShadow = "0 0 4px rgba(0,0,0,0.3)";
    return div;
  }
  function cargaIconForState(state) {
    const color = estadoColors[state] || "#7f8c8d";
    return color;
  }

  function groupByPartner(data) {
    const grouped = {};
    data.forEach((c) => {
      const p = c.partner;
      if (!p || !p.latitude || !p.longitude) return;
      if (!grouped[p.id]) grouped[p.id] = { partner: p, cargas: [] };
      grouped[p.id].cargas.push(c);
    });
    return Object.values(grouped);
  }

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

  // -------------------------------------------------------------
  // INICIALIZACIÓN DEL MAPA
  // -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (mapRef.current) return;
      const maps = await loadGoogleMaps();
      if (cancelled) return;

      const mapElement = document.getElementById("map");
      if (!mapElement) return;

      const map = new maps.Map(mapElement, {
        center: { lat: -40.34647463463274, lng: -72.98086926441867 },
        zoom: 14,
        mapTypeId: maps.MapTypeId.ROADMAP,
        mapId: "5cdcae24b9280b50c03d91a7",
      });

      mapRef.current = map;
      setMapReady(true);
    }

    initMap();

    return () => {
      cancelled = true;
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // -------------------------------------------------------------
  // LISTENER: actualizar mapa según filtros de sidebar
  // Espera un CustomEvent 'map:update' con detail: { cargas?: [...], rutas?: [...] }
  // -------------------------------------------------------------
  useEffect(() => {
    function onMapUpdate(ev) {
      const map = mapRef.current;
      if (!map || !mapReady) return;

      const detail = ev.detail || {};

      // 1) Cargas: agrupar por partner (usa groupByPartner) y actualizar 'groups'
      if (Array.isArray(detail.cargas)) {
        try {
          const grouped = groupByPartner(detail.cargas || []);
          setGroups(grouped);
        } catch (err) {
          console.warn('Error grouping cargas for map update', err);
        }
      }

      // 2) Rutas: mostrar solo las rutas incluidas en detail.rutas (si se envían)
      if (Array.isArray(detail.rutas)) {
        const visibleIds = new Set(detail.rutas.map(r => Number(r.id)).filter(Boolean));

        // Ocultar capas de rutas que no están en visibleIds
        Object.keys(routesLayers.current).forEach((idStr) => {
          const id = Number(idStr);
          const layer = routesLayers.current[idStr];
          if (!layer || !layer.polyline) return;
          if (!visibleIds.has(id)) {
            layer.polyline.setMap(null);
            layer.visible = false;
          }
        });

        // Para cada ruta visible, dibujar o reactivar su capa
        detail.rutas.forEach(async (r) => {
          const id = Number(r.id);
          if (!id) return;
          const waypoints = parseWaypointsField(r.waypoints || r.waypoints_json || r.waypoints || r.load_ids || []);
          const existing = routesLayers.current[id];
          if (existing && existing.polyline) {
            // si existe pero estaba oculto, reactivar
            if (!existing.visible) {
              existing.polyline.setMap(map);
              existing.visible = true;
            }
          } else {
            try {
              await drawRouteOnMap(id, waypoints, false, r.status || null);
            } catch (err) {
              // dibujo falló, ignorar para no romper el flujo
              console.warn('Error drawing route from map:update', id, err);
            }
          }
        });
      }
    }

    window.addEventListener('map:update', onMapUpdate);
    return () => window.removeEventListener('map:update', onMapUpdate);
  }, [mapReady]);

  /** UBICACIÓN TRACCAR EN TIEMPO REAL */
  // desconectodo -> offline (marcador gris)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    let active = true;

    async function updateDraftVehiclesPositions() {
      if (!active) return;
      try {
        const list = await fetch('/api/rutas/activos-traccar').then(r => r.json());
        if (!Array.isArray(list)) return;

        const seen = new Set();

        list.forEach(item => {
          const pos = item.position || {};
          const lat = pos.latitude;
          const lon = pos.longitude;
          const rawId = item.traccar_device_id ?? pos.deviceId ?? item.traccar_internal_id;
          const deviceId = rawId != null ? String(rawId) : null;
          if (lat == null || lon == null || deviceId == null) return;

          seen.add(deviceId);

          const popup = `
            <strong>${item.driver_name || 'Chofer'}</strong> — ${item.vehicle_name || 'Vehículo'}<br/>
            Ruta: ${item.route_name || item.route_id}<br/>
            Velocidad: ${pos.speed ?? '-'} km/h
          `;

          const existing = traccarMarkersRef.current[deviceId];
          if (existing) {
            existing.setPosition({ lat, lng: lon });
            existing._popupContent = popup;
          } else {
            const marker = new google.maps.Marker({
              position: { lat, lng: lon },
              map,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 6,
                fillColor: "#ff4757",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
              },
            });
            marker._popupContent = popup;
            const info = new google.maps.InfoWindow();
            // track info windows so we can close them on outside clicks
            infoWindowsRef.current.push(info);
            marker.addListener("click", () => {
              info.setContent(marker._popupContent || "");
              info.open(map, marker);
            });
            traccarMarkersRef.current[deviceId] = marker;
          }
        });

        // remover marcadores que no llegaron en esta actualización
        Object.keys(traccarMarkersRef.current).forEach(idStr => {
          if (!seen.has(idStr)) {
            const m = traccarMarkersRef.current[idStr];
            if (m) m.setMap(null);
            delete traccarMarkersRef.current[idStr];
          }
        });

      } catch (err) {
        console.warn('Error consultando activos Traccar', err);
      }
    }

    // primera ejecución y polling cada 5s
    // -> definir tiempo de actualización 3-5s?
    updateDraftVehiclesPositions();
    const interval = setInterval(updateDraftVehiclesPositions, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [mapReady]);

  // -------------------------------------------------------------
  // Lógica de dibujo ORS
  // -------------------------------------------------------------
  async function drawRouteOnMap(routeId, waypoints, isPreview = false, status = null) {
    const map = mapRef.current;
    if (!map) return false;

    // elegir proveedor de ruta (Google Directions o ORS)
    const { coords: combinedCoords, distM: totalDist } = USE_GOOGLE_DIRECTIONS
      ? await fetchRouteFromGoogleDirections(waypoints)
      : await fetchRouteFromORS(waypoints, "driving-hgv");

    if (!combinedCoords || combinedCoords.length < 2) {
      if (routesLayers.current[routeId]) {
        const { polyline } = routesLayers.current[routeId];
        if (polyline) polyline.setMap(null);
      }
      return false;
    }

    const baseColor =
      status && routeStatusColor[status]
        ? routeStatusColor[status]
        : routeColor(routeId);
    const color = isPreview ? "#333333" : baseColor;
    const dashArray = isPreview ? "10, 10" : null;
    const weight = isPreview ? 4 : 5;
    const opacity = isPreview ? 0.7 : 0.9;

    const existing = routesLayers.current[routeId];
    if (existing && existing.polyline) {
      existing.polyline.setOptions({
        path: combinedCoords.map(([lat, lon]) => ({ lat, lng: lon })),
        strokeColor: color,
        strokeOpacity: opacity,
        strokeWeight: weight,
      });
      existing.visible = true;
    } else {
      const polyline = new google.maps.Polyline({
        path: combinedCoords.map(([lat, lon]) => ({ lat, lng: lon })),
        strokeColor: color,
        strokeOpacity: opacity,
        strokeWeight: weight,
        map,
      });
      routesLayers.current[routeId] = { polyline, markers: [], visible: true };
    }

    // Marcadores naranjas para destinos intermedios (carga.destino)
    const layerEntry = routesLayers.current[routeId];
    if (layerEntry) {
      // limpiar marcadores anteriores de esta ruta
      (layerEntry.markers || []).forEach(m => {
        if (m) m.setMap(null);
      });
      layerEntry.markers = [];

      (waypoints || []).forEach((wp) => {
        if (!wp) return;
        if (wp.type !== "intermediate_dest") return;
        const lat = wp.lat ?? wp.latitude;
        const lon = wp.lon ?? wp.longitude;
        if (lat == null || lon == null) return;

        const marker = new google.maps.Marker({
          position: { lat, lng: lon },
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: "#e67e22",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
        const label = wp.label || "Destino intermedio";
        const info = new google.maps.InfoWindow({ content: label });
        infoWindowsRef.current.push(info);
        marker.addListener("click", () => {
          info.open(map, marker);
        });
        layerEntry.markers.push(marker);
      });
    }

    // Ajustamos el zoom automáticamente cuando es un preview
    // (por ejemplo, al probar una ruta desde el sidebar).
    if (isPreview) {
      try {
        const bounds = new google.maps.LatLngBounds();
        combinedCoords.forEach(([lat, lon]) => bounds.extend({ lat, lng: lon }));
        map.fitBounds(bounds, 40);
      } catch (e) {}
    }

    const totalKm = (totalDist || 0) / 1000;
    window.dispatchEvent(
      new CustomEvent("route-distance-updated", {
        detail: { routeId, distanceKm: totalKm },
      })
    );

    return true;

    /* --- versión antigua usando tu propio servidor graphhopper por tramos pairwise ---
    // normalizar puntos
    const cleaned = waypoints
      .map((p) => {
        const lat = p.lat ?? p.latitude;
        const lon = p.lon ?? p.longitude ?? p.lon;
        if (lat == null || lon == null) return null;
        return { lat: Number(lat), lon: Number(lon) };
      })
      .filter(Boolean);

    if (cleaned.length < 2) {
      if (routesLayers.current[routeId]) {
        const { polyline } = routesLayers.current[routeId];
        if (polyline) map.removeLayer(polyline);
      }
      return false;
    }

    async function fetchLeg(a, b) {
      const base = "http://167.114.114.51:8989/route?";
      const params = `point=${a.lat},${a.lon}&point=${b.lat},${b.lon}&profile=truck&points_encoded=false&instructions=false&ch.disable=true`;
      const url = base + params;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn("GH leg failed status", res.status, url);
          return null;
        }
        const gh = await res.json();
        if (!gh || !gh.paths || !gh.paths[0]) {
          console.warn("GH leg returned no path", gh, url);
          return null;
        }
        const geo = gh.paths[0].points;
        if (!geo || !Array.isArray(geo.coordinates)) return null;
        const coords = geo.coordinates.map((c) => [c[1], c[0]]);
        const distM = gh.paths[0].distance ?? 0;
        return { coords, distM, raw: gh };
      } catch (err) {
        console.error("Error fetching GH leg", err);
        return null;
      }
    }

    const legs = [];
    for (let i = 0; i < cleaned.length - 1; i++) {
      legs.push([cleaned[i], cleaned[i + 1]]);
    }
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (first.lat !== last.lat || first.lon !== last.lon) {
      legs.push([last, first]);
    } else {
      const nudgedFirst = { lat: first.lat + 1e-6, lon: first.lon + 1e-6 };
      legs.push([last, nudgedFirst]);
    }

    const combinedCoordsOld = [];
    let totalDistOld = 0;
    for (let i = 0; i < legs.length; i++) {
      const [a, b] = legs[i];
      const leg = await fetchLeg(a, b);
      if (!leg) {
        console.warn("No se pudo obtener leg", i, a, b);
        return false;
      }
      if (combinedCoordsOld.length === 0) {
        combinedCoordsOld.push(...leg.coords);
      } else {
        const lastCombined = combinedCoordsOld[combinedCoordsOld.length - 1];
        const firstLeg = leg.coords[0];
        const isSame =
          Math.abs(lastCombined[0] - firstLeg[0]) < 1e-8 &&
          Math.abs(lastCombined[1] - firstLeg[1]) < 1e-8;
        if (isSame) {
          combinedCoordsOld.push(...leg.coords.slice(1));
        } else {
          combinedCoordsOld.push(...leg.coords);
        }
      }
      totalDistOld += leg.distM || 0;
    }

    // ... resto del código q ya no me acuerdo
    --- fin versión antigua --- */
  }

  // -------------------------------------------------------------
  // LISTENER: Cargar todas las rutas existentes en inicio
  // -------------------------------------------------------------
  useEffect(() => {
    if (!mapReady) return;

    let active = true;
    async function loadAllRoutes() {
      const map = mapRef.current;
      if (!map) return;

      let rutas = [];
      try {
        rutas = await fetch("/api/rutas").then((r) => r.json());
      } catch (e) { return; }

      if (!active) return;

      for (const r of rutas) {
        if (r.status === "done") continue;

        const waypoints = parseWaypointsField(r.waypoints);
        if (!waypoints.length) continue;

        if (routesLayers.current[r.id] && routesLayers.current[r.id].polyline) continue;

        await drawRouteOnMap(r.id, waypoints, false, r.status);
      }
    }

    loadAllRoutes();
    return () => { active = false; };
  }, [mapReady]);

  // -------------------------------------------------------------
  // LISTENER: Preview ruta 
  // -------------------------------------------------------------
  useEffect(() => {
    function onDrawPreview(ev) {
        const { routeId, waypoints } = ev.detail;
        if (!routeId || !waypoints) return;

        drawRouteOnMap(routeId, waypoints, true);
    }

    window.addEventListener("draw-preview-route", onDrawPreview);
    return () => window.removeEventListener("draw-preview-route", onDrawPreview);
  }, []);

  // -------------------------------------------------------------
  // LISTENER: Toggle visibilidad -> falta filtro en sidebar para
  // mostrar/ocultar todas
  // -------------------------------------------------------------
  useEffect(() => {
    function toggleVisibility(ev) {
      const { id, visible } = ev.detail;
      const layer = routesLayers.current[id];
      if (!layer || !layer.polyline) return;

      if (visible) {
        layer.polyline.setMap(mapRef.current);
        layer.visible = true;
      } else {
        layer.polyline.setMap(null);
        layer.visible = false;
      }
    }
    window.addEventListener("toggle-route-visible", toggleVisibility);
    return () => window.removeEventListener("toggle-route-visible", toggleVisibility);
  }, []);

  // -------------------------------------------------------------
  // CARGAR MARKERS DE EMPRESAS
  // -------------------------------------------------------------
  useEffect(() => {
    fetch("/api/cargas")
      .then((r) => r.json())
      .then((data) => setGroups(groupByPartner(data)))
      .catch((e) => console.warn(e));
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !groups.length) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    groups.forEach((group) => {
      const { partner, cargas } = group;
      const state = cargas.length === 1 ? cargas[0].state : "draft"; // Simplificado
      const color = cargaIconForState(state);
      const marker = new google.maps.Marker({
        position: { lat: partner.latitude, lng: partner.longitude },
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });

      // popup contacto
      let popupHtml = `<strong>${partner.name}</strong><br/>`;
      if (cargas.length === 1) {
        popupHtml += `<div>${cargas[0].name}</div>`;
      } else {
        popupHtml += `<div>${cargas.length} cargas</div>`;
      }

      const info = new google.maps.InfoWindow({ content: popupHtml });
      infoWindowsRef.current.push(info);
      marker.addListener("click", () => {
        info.open(map, marker);
      });
      markersRef.current.push(marker);
      marker.partnerId = Number(partner.id);
    });
  }, [groups, mapReady]);

  // Cerrar cualquier InfoWindow abierto al hacer click en el mapa (click fuera)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const listener = map.addListener('click', () => {
      if (!infoWindowsRef.current || infoWindowsRef.current.length === 0) return;
      infoWindowsRef.current.forEach((iw) => {
        try { iw.close(); } catch (e) {}
      });
    });

    return () => {
      if (listener) listener.remove();
    };
  }, [mapReady]);

  // -------------------------------------------------------------
  // FOCUS CONCTACO
  // -------------------------------------------------------------
  useEffect(() => {
    function focusClient(ev) {
      let partnerId = ev.detail;
      if (Array.isArray(partnerId)) partnerId = partnerId[0];
      partnerId = Number(partnerId);

      const marker = markersRef.current.find((m) => Number(m.partnerId) === partnerId);
      const map = mapRef.current;
      if (!marker || !map) return;

      const pos = marker.getPosition();
      if (!pos) return;
      map.panTo(pos);
      map.setZoom(14);
    }

    window.addEventListener("focus-client", focusClient);
    return () => window.removeEventListener("focus-client", focusClient);
  }, []);

  /* === CONTACTOS: MARCADORES === */
  const contactMarkersRef = useRef([]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // mostrar contactos en el mapa
    function onShowContacts(ev) {
      const list = ev.detail || [];
      if (!Array.isArray(list)) return;

      // limpiar anteriores
      contactMarkersRef.current.forEach(m => m.setMap(null));
      contactMarkersRef.current = [];

      list.forEach(ct => {
        if (!ct.latitude || !ct.longitude) return;
        const marker = new google.maps.Marker({
          position: { lat: ct.latitude, lng: ct.longitude },
          map,
          label: "🏭",
        });
        const info = new google.maps.InfoWindow({
          content: `<strong>${ct.name}</strong><br/>${ct.street ?? ""} ${ct.city ?? ""}`,
        });
        infoWindowsRef.current.push(info);
        marker.addListener("click", () => {
          info.open({ map, anchor: marker });
        });

        marker.contactId = ct.id;
        contactMarkersRef.current.push(marker);
      });
    }

    // limpiar contactos
    function onClearContacts() {
      contactMarkersRef.current.forEach(m => { m.setMap(null); });
      contactMarkersRef.current = [];
    }

    // enfocar contacto
    function onFocusContact(ev) {
      const ct = ev.detail;
      if (!ct || !ct.latitude || !ct.longitude) return;

      const marker = contactMarkersRef.current.find(m => m.contactId === ct.id);
      if (!marker) return;

      const pos = marker.getPosition();
      if (!pos) return;
      map.panTo(pos);
      map.setZoom(16);
    }

    window.addEventListener("contacts-markers-show", onShowContacts);
    window.addEventListener("contacts-markers-clear", onClearContacts);
    window.addEventListener("focus-contact", onFocusContact);

    return () => {
      window.removeEventListener("contacts-markers-show", onShowContacts);
      window.removeEventListener("contacts-markers-clear", onClearContacts);
      window.removeEventListener("focus-contact", onFocusContact);
    };
  }, [mapReady]);

  // listener para enfocar una ruta y para recolorear tras cambio de estado
  useEffect(() => {
    function onFocusRoute(ev) {
      const { routeId } = ev.detail || {};
      const map = mapRef.current;
      if (!map || !routeId) return;
      const layer = routesLayers.current[routeId];
      if (layer && layer.polyline) {
        const path = layer.polyline.getPath();
        if (!path || path.getLength() === 0) return;
        const bounds = new google.maps.LatLngBounds();
        path.forEach((latLng) => bounds.extend(latLng));
        map.fitBounds(bounds);
      }
    }

    function onRouteStatusUpdated(ev) {
      const { routeId, status } = ev.detail || {};
      const layer = routesLayers.current[routeId];
      if (!layer || !layer.polyline) return;

      // reaplicar color por estado
      const routeStatusColor = {
        draft: "#d32f2f",
        assigned: "#f9a825",
        done: "#2e7d32",
      };
      const color = routeStatusColor[status] || "#555";
      layer.polyline.setOptions({ strokeColor: color });
    }

    window.addEventListener('focus-route', onFocusRoute);
    window.addEventListener('route-status-updated', onRouteStatusUpdated);
    return () => {
      window.removeEventListener('focus-route', onFocusRoute);
      window.removeEventListener('route-status-updated', onRouteStatusUpdated);
    };
  }, []);

  function routeColor(routeId) {
    const colors = ["#e74c3c", "#3498db", "#9b59b6", "#1abc9c", "#f1c40f", "#e67e22", "#2ecc71", "#34495e"];
    if (routeId == null) return "#555";
    return colors[routeId % colors.length];
  }

  return (
    <div id="map" style={{ width: '100%', height: '100vh', position: 'absolute', top: 0, left: 0 }} />
  );
}