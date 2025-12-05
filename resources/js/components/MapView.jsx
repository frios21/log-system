import { useEffect, useRef, useState } from "react";
import L from "leaflet";

// iconos y configuracion
const cargaIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -28],
});

const estadoColors = {
  draft: "#3498db", 
  assigned: "#f1c40f", 
  delivered: "#2ecc71", 
  cancelled: "#e74c3c", 
};

// colores de rutas por estado
const routeStatusColor = {
  draft: "#d32f2f",      // rojo
  assigned: "#f9a825",   // amarillo
  done: "#2e7d32",       // verde
};

const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjBiYWUyYWNlZjc0OTQxMGE5ZmMwODY1N2M2MTk0YzlmIiwiaCI6Im11cm11cjY0In0=";

// helper global para pedir ruta a OpenRouteService (perfil truck)
function fetchRouteFromORS(waypoints, profile = "driving-hgv") {
  // lo dejamos como function normal para que esté hoisted
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

    const url = `https://api.openrouteservice.org/v2/directions/${profile}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: ORS_API_KEY,
      },
      body: JSON.stringify({ coordinates }),
    });

    if (!res.ok) {
      console.warn("ORS error", res.status, url);
      return { coords: [], distM: 0 };
    }

    const json = await res.json();
    const route = json.routes && json.routes[0];
    if (!route || !route.geometry || !Array.isArray(route.geometry.coordinates)) {
      return { coords: [], distM: 0 };
    }

    // ORS geometry: [lon, lat] -> Leaflet: [lat, lon]
    const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
    const distM = route.summary?.distance ?? 0;

    return { coords, distM };
  })();
}

export default function MapView() {
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const routesLayers = useRef({});
  const [groups, setGroups] = useState([]);
  const traccarMarkersRef = useRef({});
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
  // INICIALIZACIÓN DEL MAPA -> cambiar mapa??
  // -------------------------------------------------------------
  useEffect(() => {
    const mapElement = document.getElementById("map");
    if (mapRef.current) return;

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

  /** UBICACIÓN TRACCAR EN TIEMPO REAL */
  // falta optimizar: solo actualizar si está en linea
  // desconectodo -> offline (marcador gris)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

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
          const deviceId = item.traccar_device_id;
          if (lat == null || lon == null || deviceId == null) return;

          seen.add(deviceId);

          const popup = `
            <strong>${item.driver_name || 'Chofer'}</strong> — ${item.vehicle_name || 'Vehículo'}<br/>
            Ruta: ${item.route_name || item.route_id}<br/>
            Velocidad: ${pos.speed ?? '-'} km/h
          `;

          const existing = traccarMarkersRef.current[deviceId];
          if (existing) {
            existing.setLatLng([lat, lon]);
            existing.setPopupContent(popup);
          } else {
            const marker = L.marker([lat, lon], { icon: L.divIcon({
              className: 'traccar-marker',
              html: '<div style="width:14px;height:14px;border-radius:50%;background:#ff4757;border:3px solid #fff;box-shadow:0 0 8px rgba(0,0,0,.25)"></div>',
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            }) });
            marker.addTo(map);
            marker.bindPopup(popup);
            traccarMarkersRef.current[deviceId] = marker;
          }
        });

        // remover marcadores que no llegaron en esta actualización
        Object.keys(traccarMarkersRef.current).forEach(idStr => {
          const id = Number(idStr);
          if (!seen.has(id)) {
            const m = traccarMarkersRef.current[id];
            if (m && map.hasLayer(m)) map.removeLayer(m);
            delete traccarMarkersRef.current[id];
          }
        });

      } catch (err) {
        console.warn('Error consultando activos Traccar', err);
      }
    }

    // primera ejecución y polling cada 5s
    // -> definir tiempo de actualización 3-5s?s
    updateDraftVehiclesPositions();
    const interval = setInterval(updateDraftVehiclesPositions, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [mapRef.current]);

  // -------------------------------------------------------------
  // Lógica de dibujo GH -> falta corregir linea en carriles con
  // sentidos separados (carretera, autopista, avenida grande)
  // -------------------------------------------------------------
  async function drawRouteOnMap(routeId, waypoints, isPreview = false, status = null) {
    const map = mapRef.current;
    if (!map) return false;

    // usar OpenRouteService (perfil truck) sólo en frontend
    const { coords: combinedCoords, distM: totalDist } =
      await fetchRouteFromORS(waypoints, "truck");

    if (!combinedCoords || combinedCoords.length < 2) {
      if (routesLayers.current[routeId]) {
        const { polyline } = routesLayers.current[routeId];
        if (polyline) map.removeLayer(polyline);
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
      existing.polyline.setLatLngs(combinedCoords);
      existing.polyline.setStyle({ color, dashArray, weight, opacity });
      existing.visible = true;
    } else {
      const polyline = L.polyline(combinedCoords, {
        color,
        weight,
        opacity,
        dashArray,
      }).addTo(map);
      routesLayers.current[routeId] = { polyline, markers: [], visible: true };
    }

    try {
      map.fitBounds(routesLayers.current[routeId].polyline.getBounds(), {
        padding: [40, 40],
      });
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

    // ... resto del código que pintaba la polyline ...
    --- fin versión antigua --- */
  }

  // -------------------------------------------------------------
  // LISTENER: Cargar todas las rutas existentes en inicio
  // -------------------------------------------------------------
  useEffect(() => {
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
        const waypoints = parseWaypointsField(r.waypoints);
        if (!waypoints.length) continue; 
        
        if (routesLayers.current[r.id] && routesLayers.current[r.id].polyline) continue;

        await drawRouteOnMap(r.id, waypoints, false, r.status);
      }
    }

    loadAllRoutes();
    return () => { active = false; };
  }, []);

  // -------------------------------------------------------------
  // LISTENER: Preview ruta 
  // modal de edición de ruta? -> similar a RouteConfirmModal
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
  // mostrar/ocultar todas -> marcar sólo las in_progress??
  // -------------------------------------------------------------
  useEffect(() => {
    function toggleVisibility(ev) {
      const { id, visible } = ev.detail;
      const map = mapRef.current;
      if (!map) return;
      const layer = routesLayers.current[id];
      if (!layer) return;

      if (visible) {
        if (layer.polyline && !map.hasLayer(layer.polyline)) map.addLayer(layer.polyline);
        layer.visible = true;
      } else {
        if (layer.polyline && map.hasLayer(layer.polyline)) map.removeLayer(layer.polyline);
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
    if (!map || !groups.length) return;

    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];

    groups.forEach((group) => {
      const { partner, cargas } = group;
      const state = cargas.length === 1 ? cargas[0].state : "draft"; // Simplificado

      const marker = L.marker([partner.latitude, partner.longitude], {
        icon: cargaIconForState(state),
      }).addTo(map);

      // popup contacto
      let popupHtml = `<strong>${partner.name}</strong><br/>`;
      if (cargas.length === 1) {
        popupHtml += `<div>${cargas[0].name}</div>`;
      } else {
        popupHtml += `<div>${cargas.length} cargas</div>`;
      }

      marker.bindPopup(popupHtml);
      markersRef.current.push(marker);
      marker.partnerId = Number(partner.id);
    });
  }, [groups]);

  // -------------------------------------------------------------
  // FOCUS CONCTACO
  // -------------------------------------------------------------
  useEffect(() => {
    function focusClient(ev) {
      let partnerId = ev.detail;
      if (Array.isArray(partnerId)) partnerId = partnerId[0];
      partnerId = Number(partnerId);

      const marker = markersRef.current.find((m) => Number(m.partnerId) === partnerId);
      if (!marker || !mapRef.current) return;

      mapRef.current.flyTo(marker.getLatLng(), 14, { duration: 0.8 });
      setTimeout(() => marker.openPopup(), 900);
    }

    window.addEventListener("focus-client", focusClient);
    return () => window.removeEventListener("focus-client", focusClient);
  }, []);

  /* === CONTACTOS: MARCADORES === */
  const contactMarkersRef = useRef([]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // mostrar contactos en el mapa
    function onShowContacts(ev) {
      const list = ev.detail || [];
      if (!Array.isArray(list)) return;

      // limpiar anteriores
      contactMarkersRef.current.forEach(m => map.removeLayer(m));
      contactMarkersRef.current = [];

      list.forEach(ct => {
        if (!ct.latitude || !ct.longitude) return;

        const empresaIcon = (emoji = "🏭") => L.divIcon({
          className: "empresa-icon",
          html: `
            <div style="
              font-size: 24px;
              line-height: 32px;
              text-align: center;
            ">${emoji}</div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker(
          [ct.latitude, ct.longitude],
          { icon: empresaIcon("🏭") }
        ).addTo(map);

        marker.bindPopup(`<strong>${ct.name}</strong><br/>${ct.street ?? ""} ${ct.city ?? ""}`);
        marker.contactId = ct.id;
        contactMarkersRef.current.push(marker);
      });
    }

    // limpiar contactos
    function onClearContacts() {
      contactMarkersRef.current.forEach(m => map.removeLayer(m));
      contactMarkersRef.current = [];
    }

    // enfocar contacto
    function onFocusContact(ev) {
      const ct = ev.detail;
      if (!ct || !ct.latitude || !ct.longitude) return;

      const marker = contactMarkersRef.current.find(m => m.contactId === ct.id);
      if (!marker) return;

      map.flyTo(marker.getLatLng(), 16, { duration: 0.8 });
      setTimeout(() => marker.openPopup(), 900);
    }

    window.addEventListener("contacts-markers-show", onShowContacts);
    window.addEventListener("contacts-markers-clear", onClearContacts);
    window.addEventListener("focus-contact", onFocusContact);

    return () => {
      window.removeEventListener("contacts-markers-show", onShowContacts);
      window.removeEventListener("contacts-markers-clear", onClearContacts);
      window.removeEventListener("focus-contact", onFocusContact);
    };
  }, []);

  // listener para enfocar una ruta y para recolorear tras cambio de estado
  useEffect(() => {
    function onFocusRoute(ev) {
      const { routeId } = ev.detail || {};
      const map = mapRef.current;
      if (!map || !routeId) return;
      const layer = routesLayers.current[routeId];
      if (layer && layer.polyline) {
        const bounds = layer.polyline.getBounds();
        map.fitBounds(bounds, { padding: [50, 50] });
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
      layer.polyline.setStyle({ color });
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