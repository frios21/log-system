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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=marker`;
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

const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjBiYWUyYWNlZjc0OTQxMGE5ZmMwODY1N2M2MTk0YzlmIiwiaCI6Im11cm11cjY0In0=";

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
    
  // Aumentamos el radio de "snap" a la red vial para cada punto
  // (por defecto ORS usa 350m y aquí damos más margen para ubicaciones
  // industriales o puntos algo alejados del camino).
  const radiuses = cleaned.map(() => 1000); // 500 m por punto

    const url = `https://api.openrouteservice.org/v2/directions/${profile}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: ORS_API_KEY,
      },
      body: JSON.stringify({ coordinates, radiuses }),
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

export default function MapView() {
  const mapRef = useRef(null);
  const markersRef = useRef([]);
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
    return createCircleMarkerElement({ color, size: 20, borderColor: "#ffffff", borderWidth: 3 });
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
            existing.position = { lat, lng: lon };
            existing._popupContent = popup;
          } else {
            const { AdvancedMarkerElement } = google.maps.marker;
            const content = createCircleMarkerElement({
              color: "#ff4757",
              size: 18,
              borderColor: "#ffffff",
              borderWidth: 3,
            });
            const marker = new AdvancedMarkerElement({
              position: { lat, lng: lon },
              map,
              content,
            });
            marker._popupContent = popup;
            const info = new google.maps.InfoWindow();
            marker.addListener("click", () => {
              info.setContent(marker._popupContent || "");
              info.open({ map, anchor: marker });
            });
            traccarMarkersRef.current[deviceId] = marker;
          }
        });

        // remover marcadores que no llegaron en esta actualización
        Object.keys(traccarMarkersRef.current).forEach(idStr => {
          if (!seen.has(idStr)) {
            const m = traccarMarkersRef.current[idStr];
            if (m) m.map = null;
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

    // usar OpenRouteService (perfil truck) sólo en frontend
    const { coords: combinedCoords, distM: totalDist } =
      await fetchRouteFromORS(waypoints, "driving-hgv");

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

      const orangeIcon = {
        content: createCircleMarkerElement({
          color: "#e67e22",
          size: 18,
          borderColor: "#ffffff",
          borderWidth: 3,
        }),
      };

      (waypoints || []).forEach((wp) => {
        if (!wp) return;
        if (wp.type !== "intermediate_dest") return;
        const lat = wp.lat ?? wp.latitude;
        const lon = wp.lon ?? wp.longitude;
        if (lat == null || lon == null) return;

        const { AdvancedMarkerElement } = google.maps.marker;
        const marker = new AdvancedMarkerElement({
          position: { lat, lng: lon },
          map,
          content: orangeIcon.content,
        });
        const label = wp.label || "Destino intermedio";
        const info = new google.maps.InfoWindow({ content: label });
        marker.addListener("click", () => {
          info.open({ map, anchor: marker });
        });
        layerEntry.markers.push(marker);
      });
    }

    try {
      const bounds = new google.maps.LatLngBounds();
      combinedCoords.forEach(([lat, lon]) => bounds.extend({ lat, lng: lon }));
      map.fitBounds(bounds, 40);
    } catch (e) {}

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
      const { AdvancedMarkerElement } = google.maps.marker;
      const content = cargaIconForState(state);
      const marker = new AdvancedMarkerElement({
        position: { lat: partner.latitude, lng: partner.longitude },
        map,
        content,
      });

      // popup contacto
      let popupHtml = `<strong>${partner.name}</strong><br/>`;
      if (cargas.length === 1) {
        popupHtml += `<div>${cargas[0].name}</div>`;
      } else {
        popupHtml += `<div>${cargas.length} cargas</div>`;
      }

      const info = new google.maps.InfoWindow({ content: popupHtml });
      marker.addListener("click", () => {
        info.open({ map, anchor: marker });
      });
      markersRef.current.push(marker);
      marker.partnerId = Number(partner.id);
    });
  }, [groups, mapReady]);

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

      map.panTo(marker.position);
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
        const { AdvancedMarkerElement } = google.maps.marker;
        const div = document.createElement("div");
        div.style.fontSize = "24px";
        div.style.lineHeight = "32px";
        div.style.textAlign = "center";
        div.textContent = "🏭";

        const marker = new AdvancedMarkerElement({
          position: { lat: ct.latitude, lng: ct.longitude },
          map,
          content: div,
        });
        const info = new google.maps.InfoWindow({
          content: `<strong>${ct.name}</strong><br/>${ct.street ?? ""} ${ct.city ?? ""}`,
        });
        marker.addListener("click", () => {
          info.open({ map, anchor: marker });
        });

        marker.contactId = ct.id;
        contactMarkersRef.current.push(marker);
      });
    }

    // limpiar contactos
    function onClearContacts() {
      contactMarkersRef.current.forEach(m => { m.map = null; });
      contactMarkersRef.current = [];
    }

    // enfocar contacto
    function onFocusContact(ev) {
      const ct = ev.detail;
      if (!ct || !ct.latitude || !ct.longitude) return;

      const marker = contactMarkersRef.current.find(m => m.contactId === ct.id);
      if (!marker) return;

      map.panTo(marker.position);
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