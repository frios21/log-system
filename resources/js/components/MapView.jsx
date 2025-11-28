import { useEffect, useRef, useState } from "react";
import L from "leaflet";

// Íconos y configuración
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

// Colores de rutas por estado (alineado con RouteCard borderLeft)
const routeStatusColor = {
  draft: "#d32f2f",      // rojo
  assigned: "#f9a825",   // amarillo
  done: "#2e7d32",       // verde
};

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

  // -------------------------------------------------------------
  // INICIALIZACIÓN DEL MAPA
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
    updateDraftVehiclesPositions();
    const interval = setInterval(updateDraftVehiclesPositions, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [mapRef.current]);

  // -------------------------------------------------------------
  // LÓGICA DE DIBUJO CENTRALIZADA (GraphHopper)
  // -------------------------------------------------------------
  async function drawRouteOnMap(routeId, waypoints, isPreview = false, status = null) {
    const map = mapRef.current;
    if (!map) return false;

    // Normalizar puntos
    const cleaned = waypoints
      .map((p) => {
        const lat = p.lat ?? p.latitude;
        const lon = p.lon ?? p.longitude ?? p.lon;
        if (lat == null || lon == null) return null;
        return { lat: Number(lat), lon: Number(lon) };
      })
      .filter(Boolean);

    if (cleaned.length < 2) {
      // limpiar ruta previa si existe
      if (routesLayers.current[routeId]) {
        const { polyline } = routesLayers.current[routeId];
        if (polyline) map.removeLayer(polyline);
      }
      return false;
    }

    // helper: peticion GH pairwise (dos puntos)
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
        // coords as [lat, lon]
        const coords = geo.coordinates.map((c) => [c[1], c[0]]);
        const distM = gh.paths[0].distance ?? 0;
        return { coords, distM, raw: gh };
      } catch (err) {
        console.error("Error fetching GH leg", err);
        return null;
      }
    }

    // Recorremos pares: 0->1, 1->2, ..., n-1 -> n
    // Para cerrar el ciclo añadimos la última vuelta: last -> first
    const legs = [];
    for (let i = 0; i < cleaned.length - 1; i++) {
      legs.push([cleaned[i], cleaned[i + 1]]);
    }
    // Añadir vuelta al inicio si es distinto
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (first.lat !== last.lat || first.lon !== last.lon) {
      legs.push([last, first]);
    } else {
      // si el primero y el último son idénticos queríamos la vuelta, pero GH puede comportarse raro:
      // en este caso hacemos last->first con un pequeño nudging (offset minúsculo) para evitar colapso
      const nudgedFirst = { lat: first.lat + 1e-6, lon: first.lon + 1e-6 };
      legs.push([last, nudgedFirst]);
    }

    // Ejecutar legs secuencialmente (podrías paralelizar pero así controlarás mejor errores)
    const combinedCoords = [];
    let totalDist = 0;
    for (let i = 0; i < legs.length; i++) {
      const [a, b] = legs[i];
      const leg = await fetchLeg(a, b);
      if (!leg) {
        console.warn("No se pudo obtener leg", i, a, b);
        // fallback: si falla un leg, intentamos con OSRM público (opcional) o abortamos.
        // Por ahora abortamos el dibujo para que no muestre una ruta incompleta.
        return false;
      }
      // Concatenar sin duplicar el punto intermedio:
      if (combinedCoords.length === 0) {
        combinedCoords.push(...leg.coords);
      } else {
        // evitar duplicar el primer punto del leg (es el último punto del combined)
        const lastCombined = combinedCoords[combinedCoords.length - 1];
        const firstLeg = leg.coords[0];
        const isSame = Math.abs(lastCombined[0] - firstLeg[0]) < 1e-8 && Math.abs(lastCombined[1] - firstLeg[1]) < 1e-8;
        if (isSame) {
          combinedCoords.push(...leg.coords.slice(1));
        } else {
          combinedCoords.push(...leg.coords);
        }
      }
      totalDist += (leg.distM || 0);
      // opcional: pequeña pausa para no saturar GH si muchos tramos
      // await new Promise(res => setTimeout(res, 50));
    }

    // Dibujar/actualizar polyline
    const baseColor = status && routeStatusColor[status] ? routeStatusColor[status] : routeColor(routeId);
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
      const polyline = L.polyline(combinedCoords, { color, weight, opacity, dashArray }).addTo(map);
      routesLayers.current[routeId] = { polyline, markers: [], visible: true };
    }

    // opcional: ajustar bounds
    try {
      map.fitBounds(routesLayers.current[routeId].polyline.getBounds(), { padding: [40, 40] });
    } catch (e) {}

    // si quieres, conviertes totalDist a km y despachas evento
    const totalKm = (totalDist || 0) / 1000;
    window.dispatchEvent(new CustomEvent("route-distance-updated", { detail: { routeId, distanceKm: totalKm } }));

    return true;
  }

  // -------------------------------------------------------------
  // LISTENER: Cargar todas las rutas existentes al inicio
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
        
        // Evitar redibujar si ya existe
        if (routesLayers.current[r.id] && routesLayers.current[r.id].polyline) continue;

        // Dibujar ruta normal (isPreview = false) usando color por estado
        await drawRouteOnMap(r.id, waypoints, false, r.status);
      }
    }

    loadAllRoutes();
    return () => { active = false; };
  }, []);

  // -------------------------------------------------------------
  // LISTENER: Preview Route (Lo que envía el Modal)
  // -------------------------------------------------------------
  useEffect(() => {
    function onDrawPreview(ev) {
        const { routeId, waypoints } = ev.detail;
        if (!routeId || !waypoints) return;
        // Dibujamos con isPreview = true
        drawRouteOnMap(routeId, waypoints, true);
    }

    window.addEventListener("draw-preview-route", onDrawPreview);
    return () => window.removeEventListener("draw-preview-route", onDrawPreview);
  }, []);

  // -------------------------------------------------------------
  // LISTENER: Toggle Visibilidad
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
  // CARGAR MARKERS DE EMPRESAS (Grupos)
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

      // Popup content
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
  // FOCUS CLIENT
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

  // Listener para enfocar una ruta y para recolorear tras cambio de estado
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

      // Reaplicar color por estado
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