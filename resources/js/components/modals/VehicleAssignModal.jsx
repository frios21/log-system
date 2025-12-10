import React, { useEffect, useState } from "react";

// Modal para asignar vehículo a una ruta
// Muestra lista de vehículos, permite buscar y filtrar
// Falta agregar paginación si hay muchos vehículos
// y agregar un botón para desvincular vehículos
// -> separar vehículo de chofer (asignar cada uno por separado)

export default function VehicleAssignModal({ ruta, onClose }) {
    const [vehicles, setVehicles] = useState([]);
    const [query, setQuery] = useState("");
    const [selectedId, setSelectedId] = useState(ruta.vehicle_id || null);
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(false);
    const [ocupados, setOcupados] = useState(new Set());
    const [soloDisponibles, setSoloDisponibles] = useState(false);

    const [drivers, setDrivers] = useState([]);
    const [driverQuery, setDriverQuery] = useState("");
    const [selectedDriverId, setSelectedDriverId] = useState(ruta.driver_id || null);
    const [driverDetail, setDriverDetail] = useState(null);
    const [loadingDrivers, setLoadingDrivers] = useState(false);

    // Cargar datos iniciales
    useEffect(() => {
        fetchOcupados();
        fetchVehicles();
        fetchDrivers();
    }, []);

    // Cerrar modal con tecla ESC
    useEffect(() => {
        function handleKeyDown(e) {
            if (e.key === "Escape") {
                onClose && onClose();
            }
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
                    .filter(r => r.vehicle_id && Array.isArray(r.vehicle_id))
                    .map(r => r.vehicle_id[0])
                    .filter(id => typeof id === "number")
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

            if (ruta.vehicle_id) {
                const d = list.find(v => v.id === ruta.vehicle_id);
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
            // endpoint como antes: /api/contactos/personas, ahora respaldado por Odoo 19
            const res = await fetch(`/api/contactos/personas?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            const list = Array.isArray(data) ? data : [];
            setDrivers(list);

            // intentar setear driverDetail si ruta trae driver_id
            const rawId = ruta?.driver_id;
            let curId = null;
            if (rawId) {
                if (Array.isArray(rawId)) curId = rawId[0];
                else curId = rawId;

                if (curId) {
                    const d = list.find(x => Number(x.id) === Number(curId));
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

    function selectVehicle(v) {
        setSelectedId(v.id);
        setDetail(v);
    }

    function selectDriver(d) {
        setSelectedDriverId(d.id);
        setDriverDetail(d);
    }

    const visible = vehicles.filter(v => {
        const texto = String(v.name || v.model || v.license_plate || "").toLowerCase();
        if (query && !texto.includes(query.toLowerCase())) return false;

        if (soloDisponibles) {
            const isOcupado = ocupados.has(Number(v.id));
            if (isOcupado && Number(selectedId) !== Number(v.id)) return false;
        }
        return true;
    });

    async function assign() {
        try {
            const body = { vehicle_id: selectedId };
            await fetch(`/api/rutas/${ruta.id}/update`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            // notify other components
            window.dispatchEvent(new CustomEvent("rutas:changed"));
            onClose && onClose();
        } catch (e) {
            console.error("Error assigning vehicle", e);
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
            onClose && onClose();
        } catch (e) {
            console.error("Error assigning driver", e);
        }
    }

    // Estilos base del modal (overlay + caja centrada)
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
    };

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", gap: 12 }}>
                    {/* COLUMNA 1: VEHÍCULOS */}
                    <div style={{ flex: 1, minWidth: 0 }}>
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
                                onChange={e => setQuery(e.target.value)}
                                style={{ width: 260 }}
                                className="input"
                            />
                        </div>

                        <label
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                cursor: "pointer",
                                marginBottom: 8,
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={soloDisponibles}
                                onChange={e => setSoloDisponibles(e.target.checked)}
                            />
                            Mostrar solo disponibles
                        </label>

                        <div
                            style={{
                                maxHeight: "62vh",
                                overflow: "auto",
                                border: "1px solid #eee",
                                borderRadius: 6,
                                padding: 8,
                            }}
                        >
                            {loading && <div style={{ padding: 8 }}>Cargando...</div>}
                            {!loading && visible.length === 0 && (
                                <div style={{ padding: 8, color: "#666" }}>
                                    No se encontraron vehículos
                                </div>
                            )}

                            {!loading &&
                                visible.map(v => {
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
                                                background: isSelected
                                                    ? "#f0f8ff"
                                                    : "transparent",
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
                                                        style={{
                                                            width: "100%",
                                                            height: "100%",
                                                            objectFit: "cover",
                                                        }}
                                                    />
                                                ) : (
                                                    <div style={{ fontSize: 12 }}>
                                                        {v.model || "—"}
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 700 }}>
                                                    {v.name}{" "}
                                                    {v.license_plate
                                                        ? `(${v.license_plate})`
                                                        : ""}
                                                </div>
                                            </div>

                                            <div
                                                style={{
                                                    minWidth: 120,
                                                    textAlign: "right",
                                                    fontSize: 12,
                                                }}
                                            >
                                                <div style={{ fontWeight: 700 }}>
                                                    {v.x_capacidad ?? "—"}{" "}
                                                    {v.x_unidad_capacidad ?? ""}
                                                </div>
                                                <div style={{ color: "#666" }}>
                                                    Pallets:{" "}
                                                    {v.x_capacidad_pallets ?? "—"}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>

                        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                            <button
                                className="btn btn-outlined"
                                onClick={() => {
                                    setSelectedId(null);
                                    setDetail(null);
                                }}
                            >
                                Quitar vehículo
                            </button>
                            <button className="btn btn-primary" onClick={assign}>
                                Asignar vehículo
                            </button>
                        </div>
                    </div>

                    {/* COLUMNA 2: CONDUCTORES */}
                    <div style={{ flex: 1, minWidth: 0 }}>
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
                                onChange={e => setDriverQuery(e.target.value)}
                                style={{ width: 200 }}
                                className="input"
                            />
                        </div>

                        <div
                            style={{
                                maxHeight: "62vh",
                                overflow: "auto",
                                border: "1px solid #eee",
                                borderRadius: 6,
                                padding: 8,
                            }}
                        >
                            {loadingDrivers && (
                                <div>Cargando conductores...</div>
                            )}
                            {!loadingDrivers && drivers.length === 0 && (
                                <div style={{ color: "#666" }}>
                                    No se encontraron conductores
                                </div>
                            )}

                            {!loadingDrivers &&
                                drivers
                                    .filter(d => {
                                        if (!driverQuery) return true;
                                        const q = driverQuery.toLowerCase();
                                        return (
                                            (d.name || "")
                                                .toLowerCase()
                                                .includes(q) ||
                                            String(d.id).includes(q)
                                        );
                                    })
                                    .map(d => {
                                        const isSelected =
                                            Number(selectedDriverId) ===
                                            Number(d.id);
                                        return (
                                            <div
                                                key={d.id}
                                                onClick={() =>
                                                    selectDriver(d)
                                                }
                                                style={{
                                                    padding: 8,
                                                    borderRadius: 6,
                                                    cursor: "pointer",
                                                    background: isSelected
                                                        ? "#f0f8ff"
                                                        : "transparent",
                                                    marginBottom: 6,
                                                }}
                                            >
                                                <div
                                                    style={{ fontWeight: 700 }}
                                                >
                                                    {d.name}
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: 12,
                                                        color: "#666",
                                                    }}
                                                >
                                                    {d.phone ||
                                                        d.email ||
                                                        ""}
                                                </div>
                                            </div>
                                        );
                                    })}
                        </div>

                        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                            <button
                                className="btn btn-outlined"
                                onClick={() => {
                                    setSelectedDriverId(null);
                                    setDriverDetail(null);
                                }}
                            >
                                Quitar conductor
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={assignDriver}
                            >
                                Asignar conductor
                            </button>
                        </div>
                    </div>

                    {/* COLUMNA 3: DETALLE + RESUMEN */}
                    <div
                        style={{
                            width: 360,
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                            minWidth: 0,
                        }}
                    >
                        <div
                            style={{
                                border: "1px solid #eee",
                                borderRadius: 6,
                                padding: 10,
                            }}
                        >
                            <h4 style={{ margin: "0 0 8px 0" }}>
                                Resumen asignaciones
                            </h4>
                            <div style={{ marginBottom: 8 }}>
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: "#666",
                                    }}
                                >
                                    Vehículo asignado
                                </div>
                                {detail ? (
                                    <div style={{ fontWeight: 700 }}>
                                        {detail.name}{" "}
                                        {detail.license_plate
                                            ? `(${detail.license_plate})`
                                            : ""}
                                    </div>
                                ) : (
                                    <div style={{ color: "#666" }}>
                                        Ninguno
                                    </div>
                                )}
                            </div>

                            <div>
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: "#666",
                                    }}
                                >
                                    Conductor asignado
                                </div>
                                {driverDetail ? (
                                    <div style={{ fontWeight: 700 }}>
                                        {driverDetail.name}
                                    </div>
                                ) : (
                                    <div style={{ color: "#666" }}>
                                        Ninguno
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <h4 style={{ marginTop: 0 }}>
                                Detalle del vehículo
                            </h4>

                            {detail ? (
                                <div>
                                    <div style={{ marginBottom: 8 }}>
                                        <strong>{detail.name}</strong>
                                        <div
                                            style={{
                                                fontSize: 13,
                                                color: "#666",
                                            }}
                                        >
                                            {detail.model || ""}
                                        </div>

                                        <div style={{ marginTop: 8 }}>
                                            <div>
                                                Patente:{" "}
                                                {detail.license_plate || "—"}
                                            </div>
                                            <div>
                                                Capacidad:{" "}
                                                {detail.x_capacidad ?? "—"}{" "}
                                                {detail.x_unidad_capacidad ||
                                                    ""}
                                            </div>
                                            <div>
                                                Pallets:{" "}
                                                {detail.x_capacidad_pallets ??
                                                    "—"}
                                            </div>
                                        </div>
                                    </div>

                                    {detail.image && (
                                        <img
                                            src={detail.image}
                                            alt="avatar"
                                            style={{
                                                width: "100%",
                                                borderRadius: 6,
                                            }}
                                        />
                                    )}
                                </div>
                            ) : (
                                <div style={{ color: "#666" }}>
                                    Selecciona un vehículo para ver detalles
                                </div>
                            )}
                        </div>

                        <div
                            style={{
                                marginTop: "auto",
                                display: "flex",
                                gap: 8,
                                justifyContent: "flex-end",
                            }}
                        >
                            <button
                                className="btn btn-outlined"
                                onClick={onClose}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={assign}
                            >
                                Asignar vehículo
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
