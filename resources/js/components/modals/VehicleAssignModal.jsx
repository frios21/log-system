import React, { useEffect, useMemo, useState } from "react";
import CircleLoader from "../common/CircleLoader";

function m2oId(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function m2oName(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value[1] ?? "";
  if (typeof value === "string") return value;
  return "";
}

export default function VehicleAssignModal({ ruta, onClose }) {
  // ids/nombres desde ruta (Odoo)
  const rutaVehicleId = m2oId(ruta?.vehicle_id);
  const rutaVehicleName = m2oName(ruta?.vehicle_id);

  const rutaDriverId = m2oId(ruta?.driver_id);
  const rutaDriverName = m2oName(ruta?.driver_id);

  // carrier_id ahora es integer (ID de transportista en Odoo 16)
  const rutaCarrierId = ruta?.carrier_id ?? null;
  const rutaCarrierName = "";

  const [vehicles, setVehicles] = useState([]);
  const [query, setQuery] = useState("");

  const [selectedId, setSelectedId] = useState(rutaVehicleId);
  const [detail, setDetail] = useState(
    rutaVehicleId
      ? { id: rutaVehicleId, name: rutaVehicleName } // fallback
      : null
  );

  const [loading, setLoading] = useState(false);
  const [ocupados, setOcupados] = useState(new Set());
  const [soloDisponibles, setSoloDisponibles] = useState(false);

  const [drivers, setDrivers] = useState([]);
  const [driverQuery, setDriverQuery] = useState("");

  const [selectedDriverId, setSelectedDriverId] = useState(rutaDriverId);
  const [driverDetail, setDriverDetail] = useState(
    rutaDriverId ? { id: rutaDriverId, name: rutaDriverName } : null
  );
  const [loadingDrivers, setLoadingDrivers] = useState(false);

  const [carriers, setCarriers] = useState([]);
  const [carrierQuery, setCarrierQuery] = useState("");

  const [selectedCarrierId, setSelectedCarrierId] = useState(rutaCarrierId);
  const [carrierDetail, setCarrierDetail] = useState(
    rutaCarrierId ? { id: rutaCarrierId, display_name: rutaCarrierName } : null
  );
  const [loadingCarriers, setLoadingCarriers] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchOcupados();
    fetchVehicles();
    fetchDrivers();
    fetchCarriers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose && onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function fetchOcupados() {
    try {
      const res = await fetch("/api/rutas");
      const data = await res.json();

      const usados = new Set(
        (data || [])
          .filter((r) => r && r.status !== "done")
          .map((r) => m2oId(r?.vehicle_id))
          .filter((id) => typeof id === "number" || typeof id === "string")
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id))
      );

      setOcupados(usados);
    } catch (error) {
      console.error("Error obteniendo rutas:", error);
    }
  }

  async function fetchVehicles(q = "") {
    try {
      setLoading(true);
      const res = await fetch(`/api/vehiculos?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setVehicles(list);

      // refrescar detail desde lista si existe
      if (rutaVehicleId) {
        const d = list.find((v) => Number(v.id) === Number(rutaVehicleId));
        setSelectedId(rutaVehicleId);
        setDetail(
          d || (rutaVehicleName ? { id: rutaVehicleId, name: rutaVehicleName } : null)
        );
      } else {
        setDetail(null);
      }
    } catch (e) {
      console.error("Error fetching vehicles", e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchDrivers(q = "") {
    try {
      setLoadingDrivers(true);
      const res = await fetch(`/api/conductores?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setDrivers(list);

      if (rutaDriverId) {
        const d = list.find((x) => Number(x.id) === Number(rutaDriverId));
        setSelectedDriverId(rutaDriverId);
        setDriverDetail(d || (rutaDriverName ? { id: rutaDriverId, name: rutaDriverName } : null));
      }
    } catch (e) {
      console.error("Error fetching drivers", e);
    } finally {
      setLoadingDrivers(false);
    }
  }

  async function fetchCarriers(q = "") {
    try {
      setLoadingCarriers(true);
      const res = await fetch(`/api/contactos/transportistas`);
      const data = await res.json();
      let list = Array.isArray(data) ? data : [];

      if (q) {
        const qLower = q.toLowerCase();
        list = list.filter((c) => String(c.display_name || c.name || "").toLowerCase().includes(qLower));
      }

      setCarriers(list);

      // preselección si carrier_id viene definido en la ruta
      if (rutaCarrierId && !q) {
        const matchById = list.find((c) => Number(c.id) === Number(rutaCarrierId));
        if (matchById) {
          setSelectedCarrierId(matchById.id);
          setCarrierDetail(matchById);
        } else if (rutaCarrierName) {
          setSelectedCarrierId(rutaCarrierId);
          setCarrierDetail({ id: rutaCarrierId, display_name: rutaCarrierName });
        }
      } else if (!rutaCarrierId && !q) {
        // si viene solo nombre (caso raro), intenta match por nombre
        if (rutaCarrierName) {
          const matchByName = list.find((c) => {
            const texto = String(c.display_name || c.name || "").toLowerCase();
            return texto === rutaCarrierName.toLowerCase();
          });
          if (matchByName) {
            setSelectedCarrierId(matchByName.id);
            setCarrierDetail(matchByName);
          }
        }
      }
    } catch (e) {
      console.error("Error fetching carriers", e);
    } finally {
      setLoadingCarriers(false);
    }
  }

  function selectVehicle(v) {
    setSelectedId(v.id);
    setDetail(v);
  }

  function selectDriver(d) {
    setSelectedDriverId(d.id);
    setDriverDetail(d);
  }

  function selectCarrier(c) {
    setSelectedCarrierId(c.id);
    setCarrierDetail(c);
  }

  async function assign() {
    try {
      if (busy) return;
      setBusy(true);
      const body = { vehicle_id: selectedId ? Number(selectedId) : null };
      const res = await fetch(`/api/rutas/${ruta.id}/update-vehicle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.message) alert(data.message);
        return;
      }
      window.dispatchEvent(new CustomEvent("rutas:changed"));
      fetchOcupados();
    } catch (e) {
      console.error("Error assigning vehicle", e);
    } finally {
      setBusy(false);
    }
  }

  async function unassignVehicle() {
    try {
      if (busy) return;
      setBusy(true);
      const res = await fetch(`/api/rutas/${ruta.id}/update-vehicle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_id: null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.message) alert(data.message);
        return;
      }
      setSelectedId(null);
      setDetail(null);
      fetchOcupados();
      window.dispatchEvent(new CustomEvent("rutas:changed"));
    } catch (e) {
      console.error("Error unassigning vehicle", e);
    } finally {
      setBusy(false);
    }
  }

  async function assignDriver() {
    try {
      if (busy) return;
      setBusy(true);
      const body = { driver_id: selectedDriverId ? Number(selectedDriverId) : null };
      await fetch(`/api/rutas/${ruta.id}/update-driver`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      window.dispatchEvent(new CustomEvent("rutas:changed"));
    } catch (e) {
      console.error("Error assigning driver", e);
    } finally {
      setBusy(false);
    }
  }

  async function unassignDriver() {
    try {
      if (busy) return;
      setBusy(true);
      const res = await fetch(`/api/rutas/${ruta.id}/update-driver`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver_id: null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.message) alert(data.message);
        return;
      }
      setSelectedDriverId(null);
      setDriverDetail(null);
      window.dispatchEvent(new CustomEvent("rutas:changed"));
    } catch (e) {
      console.error("Error unassigning driver", e);
    } finally {
      setBusy(false);
    }
  }

  async function assignCarrier() {
    try {
      if (busy) return;
      setBusy(true);
      const body = { carrier_id: selectedCarrierId ? Number(selectedCarrierId) : null };
      const res = await fetch(`/api/rutas/${ruta.id}/update-company`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.message) alert(data.message);
        return;
      }
      window.dispatchEvent(new CustomEvent("rutas:changed"));
    } catch (e) {
      console.error("Error assigning carrier", e);
    } finally {
      setBusy(false);
    }
  }

  async function unassignCarrier() {
    try {
      if (busy) return;
      setBusy(true);
      const res = await fetch(`/api/rutas/${ruta.id}/update-company`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrier_id: null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.message) alert(data.message);
        return;
      }
      setSelectedCarrierId(null);
      setCarrierDetail(null);
      window.dispatchEvent(new CustomEvent("rutas:changed"));
    } catch (e) {
      console.error("Error unassigning carrier", e);
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => {
    return vehicles.filter((v) => {
      const texto = String(v.name || v.model || v.license_plate || "").toLowerCase();
      if (query && !texto.includes(query.toLowerCase())) return false;

      if (soloDisponibles) {
        const isOcupado = ocupados.has(Number(v.id));
        // permite el que ya está asignado a esta ruta
        if (isOcupado && Number(selectedId) !== Number(v.id)) return false;
      }
      return true;
    });
  }, [vehicles, query, soloDisponibles, ocupados, selectedId]);

  const overlayStyle = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 16,
  };

  const modalStyle = {
    width: "100%",
    maxWidth: 1100,
    maxHeight: "90vh",
    background: "white",
    borderRadius: 8,
    boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
    padding: 16,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };

  const summaryCard = {
    border: "1px solid #eee",
    borderRadius: 6,
    padding: 10,
    minWidth: 0,
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {busy && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 8px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.9)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
              zIndex: 30,
            }}
          >
            <CircleLoader size={18} />
            <span style={{ fontSize: 12, color: "#374151" }}>Guardando...</span>
          </div>
        )}
        {/* FILA SUPERIOR: 3 COLUMNAS */}
        <div style={{ display: "flex", gap: 12, minHeight: 0 }}>
          {/* Vehículos */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
              <h3 style={{ margin: 0 }}>Vehículos — {ruta?.name}</h3>
              <input
                placeholder="Buscar vehículo..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ width: 260 }}
                className="input"
              />
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginBottom: 8 }}>
              <input type="checkbox" checked={soloDisponibles} onChange={(e) => setSoloDisponibles(e.target.checked)} />
              Mostrar solo disponibles
            </label>

            <div style={{ flex: 1, minHeight: 0, overflow: "auto", border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
              {loading && <div style={{ padding: 8 }}>Cargando...</div>}
              {!loading && visible.length === 0 && <div style={{ padding: 8, color: "#666" }}>No se encontraron vehículos</div>}

              {!loading &&
                visible.map((v) => {
                  const isOcupado = ocupados.has(Number(v.id));
                  const isSelected = Number(selectedId) === Number(v.id);
                  const bloqueado = isOcupado && !isSelected;

                  return (
                    <div
                      key={v.id}
                      onClick={() => !bloqueado && selectVehicle(v)}
                      style={{
                        padding: 10,
                        borderRadius: 6,
                        cursor: bloqueado ? "not-allowed" : "pointer",
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        marginBottom: 6,
                        background: isSelected ? "#f0f8ff" : "transparent",
                        opacity: bloqueado ? 0.45 : 1,
                        position: "relative",
                      }}
                    >
                      {bloqueado && (
                        <div style={{ position: "absolute", top: 6, right: 6, background: "#d9534f", color: "white", padding: "2px 6px", fontSize: 10, borderRadius: 4, fontWeight: 700 }}>
                          Ocupado
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>
                          {v.name} {v.license_plate ? `(${v.license_plate})` : ""}
                        </div>
                        <div style={{ fontSize: 12, color: "#666" }}>{v.model || ""}</div>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button className="btn btn-outlined" onClick={unassignVehicle} disabled={busy}>Quitar vehículo</button>
              <button className="btn btn-primary" onClick={assign} disabled={busy}>Asignar vehículo</button>
            </div>
          </div>

          {/* Conductores */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
              <h3 style={{ margin: 0 }}>Conductores</h3>
              <input
                placeholder="Buscar conductor..."
                value={driverQuery}
                onChange={(e) => setDriverQuery(e.target.value)}
                style={{ width: 200 }}
                className="input"
              />
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: "auto", border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
              {loadingDrivers && <div>Cargando conductores...</div>}
              {!loadingDrivers && drivers.length === 0 && <div style={{ color: "#666" }}>No se encontraron conductores</div>}

              {!loadingDrivers &&
                drivers
                  .filter((d) => {
                    if (!driverQuery) return true;
                    const q = driverQuery.toLowerCase();
                    return (d.name || "").toLowerCase().includes(q) || String(d.id).includes(q);
                  })
                  .map((d) => {
                    const isSelected = Number(selectedDriverId) === Number(d.id);
                    return (
                      <div
                        key={d.id}
                        onClick={() => selectDriver(d)}
                        style={{ padding: 8, borderRadius: 6, cursor: "pointer", background: isSelected ? "#f0f8ff" : "transparent", marginBottom: 6 }}
                      >
                        <div style={{ fontWeight: 700 }}>{d.name}</div>
                        <div style={{ fontSize: 12, color: "#666" }}>{d.phone || d.email || ""}</div>
                      </div>
                    );
                  })}
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button className="btn btn-outlined" onClick={unassignDriver} disabled={busy}>Quitar conductor</button>
              <button className="btn btn-primary" onClick={assignDriver} disabled={busy}>Asignar conductor</button>
            </div>
          </div>

          {/* Transportistas */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Transportistas</h3>
            </div>

            <input
              placeholder="Buscar transportista..."
              value={carrierQuery}
              onChange={(e) => {
                const q = e.target.value;
                setCarrierQuery(q);
                fetchCarriers(q);
              }}
              style={{ width: "100%", marginBottom: 8 }}
              className="input"
            />

            <div style={{ flex: 1, minHeight: 0, overflow: "auto", border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
              {loadingCarriers && <div>Cargando transportistas...</div>}
              {!loadingCarriers && carriers.length === 0 && <div style={{ color: "#666" }}>No se encontraron transportistas</div>}

              {!loadingCarriers &&
                carriers.map((c) => {
                  const isSelected = Number(selectedCarrierId) === Number(c.id);
                  return (
                    <div
                      key={c.id}
                      onClick={() => selectCarrier(c)}
                      style={{ padding: 8, borderRadius: 6, cursor: "pointer", background: isSelected ? "#f0f8ff" : "transparent", marginBottom: 6 }}
                    >
                      <div style={{ fontWeight: 700 }}>{c.display_name || c.name}</div>
                      <div style={{ fontSize: 12, color: "#666" }}>{c.phone || c.email || ""}</div>
                    </div>
                  );
                })}
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button className="btn btn-outlined" onClick={unassignCarrier} disabled={busy}>Quitar transportista</button>
              <button className="btn btn-primary" onClick={assignCarrier} disabled={busy}>Asignar transportista</button>
            </div>
          </div>
        </div>

        {/* FILA INFERIOR: RESUMEN HORIZONTAL */}
        <div style={{ ...summaryCard, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Vehículo</div>
            <div style={{ fontWeight: 700 }}>
              {rutaVehicleName || "Ninguno"}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Conductor</div>
            <div style={{ fontWeight: 700 }}>
              {rutaDriverName || "Ninguno"}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Transportista</div>
            <div style={{ fontWeight: 700 }}>
              {rutaCarrierName || (rutaCarrierId ? `ID ${rutaCarrierId}` : "Ninguno")}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-outlined" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
