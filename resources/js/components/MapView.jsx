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
  draft: "#3498db",      // azul
  assigned: "#f1c40f",   // amarillo
  delivered: "#2ecc71",  // verde
  cancelled: "#e74c3c",  // rojo
};

export default function MapView() {
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const routesLayers = useRef({});
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


  /** CARGAR CARGAS (bruh) */
  useEffect(() => {
    fetch("/api/cargas")
      .then((r) => r.json())
      .then((data) => setGroups(groupByPartner(data)));
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
          : cargas.some(c => c.state === "cancelled") ? "cancelled"
          : cargas.some(c => c.state === "assigned") ? "assigned"
          : cargas.some(c => c.state === "draft")     ? "draft"
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
      const marker = markersRef.current.find(
        (m) => Number(m.partnerId) === partnerId
      );
      if (!marker) return;

      map.flyTo(marker.getLatLng(), 14, { duration: 0.8 });
      setTimeout(() => marker.openPopup(), 900);
    }

    window.addEventListener("focus-client", focusClient);
    return () => window.removeEventListener("focus-client", focusClient);
  }, []);

  /** TOGGLE / DIBUJAR RUTA — GraphHopper + actualizar distancia */
  useEffect(() => {
    const GH_KEY = "600ab2f1-f867-44a9-9b60-bdabcd6db589";

    async function toggleRoute(ev) {
      const routeId = ev.detail;
      const map = mapRef.current;
      if (!map) return;

      // si ya está dibujada -> remover
      if (routesLayers.current[routeId]) {
        const { polyline, markers } = routesLayers.current[routeId];
        map.removeLayer(polyline);
        markers.forEach((m) => map.removeLayer(m));
        delete routesLayers.current[routeId];
        return;
      }

      // obtener ruta
      const ruta = await fetch(`/api/rutas/${routeId}`).then((r) => r.json());
      let points = ruta.waypoints || [];

      if (!points.length && ruta.loads) {
        points = ruta.loads
          .filter((l) => l.partner?.latitude && l.partner?.longitude)
          .map((l) => ({
            lat: l.partner.latitude,
            lon: l.partner.longitude,
          }));
      }

      if (!points.length) return;

      async function snapLatLon(p) {
        const url =
          `https://graphhopper.com/api/1/route?` +
          `point=${p.lat},${p.lon}&profile=car&points_encoded=false&key=${GH_KEY}`;

        try {
          const r = await fetch(url).then((q) => q.json());
          if (r.paths?.[0]?.snapped_waypoints?.coordinates?.length) {
            const coord = r.paths[0].snapped_waypoints.coordinates[0];
            return { lat: coord[1], lon: coord[0] };
          }
        } catch {}

        return { lat: p.lat, lon: p.lon };
      }

      const snapped = await Promise.all(points.map((p) => snapLatLon(p)));

      /** evitar puntos repetidos */
      const cleaned = snapped.filter((p, i, arr) => {
        if (i === 0) return true;
        const prev = arr[i - 1];
        return !(p.lat === prev.lat && p.lon === prev.lon);
      });

      /** construir url de graphhopper */
      let ghUrl = "https://graphhopper.com/api/1/route?";
      cleaned.forEach((p) => {
        ghUrl += `point=${p.lat},${p.lon}&`;
      });

      ghUrl +=
        "profile=car&locale=es&points_encoded=false&instructions=false&" +
        `key=${GH_KEY}`;

      /** consumir GraphHopper */
      const gh = await fetch(ghUrl).then((r) => r.json());
      if (!gh.paths || !gh.paths[0]) return;

      const distanceKm = (gh.paths[0].distance || 0) / 1000;

      await fetch(`/api/rutas/${routeId}/distance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distance_km: distanceKm }),
      });

      window.dispatchEvent(new CustomEvent("route-distance-updated", {
        detail: { routeId, distanceKm }
      }));

      /** dibujar ruta */
      const geo = gh.paths[0].points;
      const coordsArr = geo.coordinates.map((c) => [c[1], c[0]]);

      const color = routeColor(routeId);
      const polyline = L.polyline(coordsArr, {
        color,
        weight: 5,
        opacity: 0.9,
      }).addTo(map);

      const waypointMarkers = cleaned.map((p) =>
        L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            className: "route-waypoint-marker",
            html: `<div style="
              width:12px;height:12px;border-radius:50%;
              background:${color};border:2px solid white;"></div>`,
          }),
        }).addTo(map)
      );

      routesLayers.current[routeId] = {
        polyline,
        markers: waypointMarkers,
      };

      map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
    }

    window.addEventListener("toggle-route", toggleRoute);
    return () => window.removeEventListener("toggle-route", toggleRoute);
  }, []);
  
  // Mostrar marcadores de contactos
  useEffect(() => {
    function showContacts(ev) {
      const data = ev.detail || [];
      const map = mapRef.current;
      if (!map) return;

      contactsMarkersRef.current.forEach(m => map.removeLayer(m));
      contactsMarkersRef.current = [];

      data.forEach(c => {
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
            iconAnchor: [13, 13]
          });
          const marker = L.marker([c.latitude, c.longitude], { icon: arrowIcon }).addTo(map);
      });
  }
    function clearContacts() {
      const map = mapRef.current;
      if (!map) return;
      contactsMarkersRef.current.forEach(m => map.removeLayer(m));
      contactsMarkersRef.current = [];
    }
    window.addEventListener('contacts-markers-show', showContacts);
    window.addEventListener('contacts-markers-clear', clearContacts);
    return () => {
      window.removeEventListener('contacts-markers-show', showContacts);
      window.removeEventListener('contacts-markers-clear', clearContacts);
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
        m => m._latlng.lat === contact.latitude && m._latlng.lng === contact.longitude
      );

      map.flyTo([contact.latitude, contact.longitude], 15, { duration: 0.7 });

      if (marker) {
        setTimeout(() => marker.openPopup(), 800);
      }
    }

    window.addEventListener("focus-contact", focusContact);
    return () => window.removeEventListener("focus-contact", focusContact);
  }, []);

  useEffect(() => {
      function recalc(ev) {
          const { routeId, newOrder } = ev.detail;
          if (!routeId || !Array.isArray(newOrder)) return;

          // Pedir al backend que actualice el orden de las cargas SIN ORIGEN/DESTINO
          fetch(`/api/rutas/${routeId}/assign`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                  load_ids: newOrder
              }),
          })
          .then(() => {
              // Vuelve a dibujar la ruta usando GraphHopper
              window.dispatchEvent(
                  new CustomEvent("toggle-route", { detail: routeId })
              );

              // Después de quitarla, la volvemos a poner (redibujo)
              setTimeout(() => {
                  window.dispatchEvent(
                      new CustomEvent("toggle-route", { detail: routeId })
                  );
              }, 200);
          });
      }

      window.addEventListener("recalc-route-graphhopper", recalc);
      return () => window.removeEventListener("recalc-route-graphhopper", recalc);
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
  const pastel = `hsl(${Math.random() * 360}, 65%, 75%)`;
  colorCache[id] = pastel;
  return pastel;
}
