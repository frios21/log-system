import React, { useEffect, useState } from "react";

export default function VehicleAssignModal({ ruta, onClose }) {
  const [vehicles, setVehicles] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(ruta?.vehicle_id || null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ocupados, setOcupados] = useState(new Set());
  const [soloDisponibles, setSoloDisponibles] = useState(false);

  const [drivers, setDrivers] = useState([]);
  const [driverQuery, setDriverQuery] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState(ruta?.driver_id || null);
  const [driverDetail, setDriverDetail] = useState(null);
  const [loadingDrivers, setLoadingDrivers] = useState(false);

  const [carriers, setCarriers] = useState([]);
  const [carrierQuery, setCarrierQuery] = useState("");
  const [selectedCarrierId, setSelectedCarrierId] = useState(null);
  const [carrierDetail, setCarrierDetail] = useState(null);
  const [loadingCarriers, setLoadingCarriers] = useState(false);

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
          .filter((r) => r.vehicle_id && Array.isArray(r.vehicle_id))
          .map((r) => r.vehicle_id[0])
          .filter((id) => typeof id === "number")
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

      if (ruta?.vehicle_id) {
        const d = list.find((v) => Number(v.id) === Number(ruta.vehicle_id));
        setSelectedId(ruta.vehicle_id);
        setDetail(d || null);
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

      const rawId = ruta?.driver_id;
      let curId = null;
      if (rawId) {
        curId = Array.isArray(rawId) ? rawId[0] : rawId;
        if (curId) {
          const d = list.find((x) => Number(x.id) === Number(curId));
          setSelectedDriverId(curId);
          setDriverDetail(d || null);
        }
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
        list = list.filter((c) => {
          const texto = String(c.display_name || c.name || "").toLowerCase();
          return texto.includes(qLower);
        });
      }

      setCarriers(list);

      // preselección por nombre desde ruta.company_id
      if (!selectedCarrierId && !q && ruta) {
        const rawCompany = ruta.company_id;
        let companyName = null;

        if (Array.isArray(rawCompany)) companyName = rawCompany[1] || null;
        else if (typeof rawCompany === "string") companyName = rawCompany;

        if (companyName) {
          const match = list.find((c) => {
            const texto = String(c.display_name || c.name || "").toLowerCase();
            return texto === companyName.toLowerCase();
          });
          if (match) {
            setSelectedCarrierId(match.id);
            setCarrierDetail(match);
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
      const body = { vehicle_id: selectedId };
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
    }
  }

  async function unassignVehicle() {
    try {
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
    }
  }

  async function assignDriver() {
    try {
      const body = { driver_id: selectedDriverId };
      await fetch(`/api/rutas/${ruta.id}/update-driver`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      window.dispatchEvent(new CustomEvent("rutas:changed"));
    } catch (e) {
      console.error("Error assigning driver", e);
    }
  }

  async function unassignDriver() {
    try {
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
    }
  }

  async function assignCarrier() {
    try {
      const body = { company_id: selectedCarrierId };
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
    }
  }

  async function unassignCarrier() {
    try {
      const res = await fetch(`/api/rutas/${ruta.id}/update-company`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: null }),
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
    }
  }

  const visible = vehicles.filter((v) => {
    const texto = String(v.name || v.model || v.license_plate || "").toLowerCase();
    if (query && !texto.includes(query.toLowerCase())) return false;

    if (soloDisponibles) {
      const isOcupado = ocupados.has(Number(v.id));
      if (isOcupado && Number(selectedId) !== Number(v.id)) return false;
    }
    return true;
  });

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

  const cardStyle = {
    border: "1px solid #eee",
    borderRadius: 6,
    padding: 10,
    minWidth: 0,
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* FILA SUPERIOR: 3 COLUMNAS */}
        <div style={{ display: "flex", gap: 12, minHeight: 0 }}>
          {/* COLUMNA 1: VEHÍCULOS */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
                gap: 8,
              }}
            >
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
              <input
                type="checkbox"
                checked={soloDisponibles}
                onChange={(e) => setSoloDisponibles(e.target.checked)}
              />
              Mostrar solo disponibles
            </label>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "auto",
                border: "1px solid #eee",
                borderRadius: 6,
                padding: 8,
              }}
            >
              {loading && <div style={{ padding: 8 }}>Cargando...</div>}
              {!loading && visible.length === 0 && (
                <div style={{ padding: 8, color: "#666" }}>No se encontraron vehículos</div>
              )}

              {!loading &&
                visible.map((v) => {
                  const isOcupado = ocupados.has(Number(v.id));
                  const isSelected = Number(selectedId) === Number(v.id);

                  return (
                    <div
                      key={v.id}
                      onClick={() => !isOcupado && selectVehicle(v)}
                      style={{
                        padding: 10,
                        borderRadius: 6,
                        cursor: isOcupado ? "not-allowed" : "pointer",
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        marginBottom: 6,
                        background: isSelected ? "#f0f8ff" : "transparent",
                        opacity: isOcupado ? 0.45 : 1,
                        pointerEvents: isOcupado ? "none" : "auto",
                        position: "relative",
                      }}
                    >
                      {isOcupado && (
                        <div
                          style={{
                            position: "absolute",
                            top: 6,
                            right: 6,
                            background: "#d9534f",
                            color: "white",
                            padding: "2px 6px",
                            fontSize: 10,
                            borderRadius: 4,
                            fontWeight: 700,
                          }}
                        >
                          Ocupado
                        </div>
                      )}

                      <div
                        style={{
                          width: 56,
                          height: 44,
                          borderRadius: 6,
                          overflow: "hidden",
                          background: "#fafafa",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {v.image ? (
                          <img
                            src={v.image}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <div style={{ fontSize: 12 }}>{v.model || "—"}</div>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>
                          {v.name} {v.license_plate ? `(${v.license_plate})` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button className="btn btn-outlined" onClick={unassignVehicle}>
                Quitar vehículo
              </button>
              <button className="btn btn-primary" onClick={assign}>
                Asignar vehículo
              </button>
            </div>
          </div>

          {/* COLUMNA 2: CONDUCTORES */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
                gap: 8,
              }}
            >
              <h3 style={{ margin: 0 }}>Conductores</h3>
              <input
                placeholder="Buscar conductor..."
                value={driverQuery}
                onChange={(e) => setDriverQuery(e.target.value)}
                style={{ width: 200 }}
                className="input"
              />
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "auto",
                border: "1px solid #eee",
                borderRadius: 6,
                padding: 8,
              }}
            >
              {loadingDrivers && <div>Cargando conductores...</div>}
              {!loadingDrivers && drivers.length === 0 && (
                <div style={{ color: "#666" }}>No se encontraron conductores</div>
              )}

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
                        style={{
                          padding: 8,
                          borderRadius: 6,
                          cursor: "pointer",
                          background: isSelected ? "#f0f8ff" : "transparent",
                          marginBottom: 6,
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{d.name}</div>
                        <div style={{ fontSize: 12, color: "#666" }}>{d.phone || d.email || ""}</div>
                      </div>
                    );
                  })}
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button className="btn btn-outlined" onClick={unassignDriver}>
                Quitar conductor
              </button>
              <button className="btn btn-primary" onClick={assignDriver}>
                Asignar conductor
              </button>
            </div>
          </div>

          {/* COLUMNA 3: TRANSPORTISTAS */}
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

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "auto",
                border: "1px solid #eee",
                borderRadius: 6,
                padding: 8,
              }}
            >
              {loadingCarriers && <div>Cargando transportistas...</div>}
              {!loadingCarriers && carriers.length === 0 && (
                <div style={{ color: "#666" }}>No se encontraron transportistas</div>
              )}

              {!loadingCarriers &&
                carriers.map((c) => {
                  const isSelected = Number(selectedCarrierId) === Number(c.id);
                  return (
                    <div
                      key={c.id}
                      onClick={() => selectCarrier(c)}
                      style={{
                        padding: 8,
                        borderRadius: 6,
                        cursor: "pointer",
                        background: isSelected ? "#f0f8ff" : "transparent",
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{c.display_name || c.name}</div>
                      <div style={{ fontSize: 12, color: "#666" }}>{c.phone || c.email || ""}</div>
                    </div>
                  );
                })}
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button className="btn btn-outlined" onClick={unassignCarrier}>
                Quitar transportista
              </button>
              <button className="btn btn-primary" onClick={assignCarrier}>
                Asignar transportista
              </button>
            </div>
          </div>
        </div>

        {/* FILA INFERIOR: RESUMEN HORIZONTAL */}
        <div style={{ ...cardStyle, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Vehículo</div>
            <div style={{ fontWeight: 700 }}>
              {detail ? `${detail.id[1] || ""}${detail.license_plate ? ` (${detail.license_plate})` : ""}` : "Ninguno"}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Conductor</div>
            <div style={{ fontWeight: 700 }}>{driverDetail?.id[1] || "Ninguno"}</div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#666" }}>Transportista</div>
            <div style={{ fontWeight: 700 }}>
              {carrierDetail?.id[1] || "Ninguno"}
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
