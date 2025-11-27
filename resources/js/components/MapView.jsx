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
  // Esta función SOLO dibuja. No calcula distancias para guardar en BD ni llama al backend de Laravel.
  async function drawRouteOnMap(routeId, waypoints, isPreview = false, status = null) {
    const map = mapRef.current;
    if (!map) return;

    const cleaned = waypoints
      .map((p) => {
        const lat = p.lat ?? p.latitude;
        const lon = p.lon ?? p.longitude ?? p.lon;
        if (lat == null || lon == null) return null;
        return { lat: Number(lat), lon: Number(lon) };
      })
      .filter(Boolean);

    // Si hay menos de 2 puntos, no se puede trazar ruta.
    // Si es preview, limpiamos lo que hubiera dibujado antes para esa ruta
    if (cleaned.length < 2) {
        if (routesLayers.current[routeId]) {
            const { polyline } = routesLayers.current[routeId];
            if (polyline) map.removeLayer(polyline);
        }
        return;
    }

    // GraphHopper URL
    let ghUrl = "http://167.114.114.51:8989/graphhopper/route?";
    cleaned.forEach((p) => (ghUrl += `point=${p.lat},${p.lon}&`));
    ghUrl += "profile=truck&points_encoded=false&instructions=false";

    try {
      const res = await fetch(ghUrl);
      const gh = await res.json();

      if (!gh || !gh.paths || !gh.paths[0]) return;
      
      const geo = gh.paths[0].points;
      if (!geo || !Array.isArray(geo.coordinates)) return;

      const coordsArr = geo.coordinates.map((c) => [c[1], c[0]]); // [lon, lat] -> [lat, lon]

      // Configuración de estilo
      const baseColor = status && routeStatusColor[status] ? routeStatusColor[status] : routeColor(routeId);
      const color = isPreview ? "#333333" : baseColor;
      const dashArray = isPreview ? "10, 10" : null; // Punteado para preview
      const weight = isPreview ? 4 : 5;
      const opacity = isPreview ? 0.7 : 0.9;

      const existing = routesLayers.current[routeId];

      if (existing && existing.polyline) {
        existing.polyline.setLatLngs(coordsArr);
        existing.polyline.setStyle({ color, dashArray, weight, opacity });
      } else {
        const polyline = L.polyline(coordsArr, { color, weight, opacity, dashArray }).addTo(map);
        routesLayers.current[routeId] = { polyline, markers: [], visible: true };
      }

      // Si es preview, ajustamos vista para ver el cambio
      if (isPreview) {
         // Opcional: map.fitBounds(routesLayers.current[routeId].polyline.getBounds(), { padding: [50, 50] });
      }

    } catch (e) {
      console.error("Error drawing route via GraphHopper", e);
    }
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