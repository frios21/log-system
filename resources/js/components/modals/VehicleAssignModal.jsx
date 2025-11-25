import React, { useEffect, useState } from "react";

export default function VehicleAssignModal({ ruta, onClose }) {
    const [vehicles, setVehicles] = useState([]);
    const [query, setQuery] = useState("");
    const [selectedId, setSelectedId] = useState(ruta.vehicle_id || null);
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(false);
    const [ocupados, setOcupados] = useState(new Set());
    const [soloDisponibles, setSoloDisponibles] = useState(false);

    useEffect(() => {
        fetchOcupados();
        fetchVehicles();
    }, []);

        async function fetchOcupados() {
        try {
            const res = await fetch("/api/rutas");
            const data = await res.json();

            const usados = new Set(
                data
                    .filter(r => r.vehicle_id && Array.isArray(r.vehicle_id))
                    .map(r => r.vehicle_id[0])
                    .filter(id => typeof id === "number")
            );

            console.log("DEBUG OCUPADOS SET:", usados);
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
            setVehicles(Array.isArray(data) ? data : []);

            if (ruta.vehicle_id) {
                const d = (data || []).find(v => v.id === ruta.vehicle_id);
                setSelectedId(ruta.vehicle_id);
                setDetail(d || null);
            } else setDetail(null);
        } catch (e) {
            console.error("Error fetching vehicles", e);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const t = setTimeout(() => fetchVehicles(query), 250);
        return () => clearTimeout(t);
    }, [query]);

    function normalize(s = "") {
        return s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    /**
     * FILTRO + ORDENAMIENTO
     */
    let visible = vehicles.filter(v => {
        if (soloDisponibles && ocupados.has(v.id)) return false;

        if (!query) return true;

        const q = normalize(query);
        return (
            normalize(v.name || "").includes(q) ||
            normalize(v.license_plate || "").includes(q) ||
            String(v.id).includes(q)
        );
    });

    // ordenar: libres primero
    visible.sort((a, b) => {
        const occA = ocupados.has(a.id);
        const occB = ocupados.has(b.id);

        if (occA !== occB) return occA ? 1 : -1;

        return (a.name || "").localeCompare(b.name || "");
    });

    function selectVehicle(v) {
        if (ocupados.has(v.id)) return;
        setSelectedId(v.id);
        setDetail(v);
    }

    async function assign() {
        if (!selectedId) return alert("Selecciona un vehículo antes de asignar.");

        try {
            const res = await fetch(`/api/rutas/${ruta.id}/update-vehicle`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vehicle_id: selectedId }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || "Error al asignar vehículo");
            }

            onClose();
        } catch (e) {
            console.error(e);
            alert("Error al asignar vehículo. Revisa la consola.");
        }
    }

    return (
        <div className="modal-backdrop" style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200
        }}>
            <div style={{
                width: "92%", maxWidth: 980, background: "#fff", borderRadius: 8,
                padding: 14, display: "flex", gap: 12,
                boxShadow: "0 8px 30px rgba(0,0,0,0.15)"
            }}>
                {/* LISTADO */}
                <div style={{ flex: 1 }}>
                    <div style={{
                        display: "flex", justifyContent: "space-between",
                        alignItems: "center", marginBottom: 8
                    }}>
                        <h3 style={{ margin: 0 }}>Asignar vehículo — {ruta.name}</h3>
                        <input
                            placeholder="Buscar vehículo..."
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            style={{ width: 260 }}
                            className="input"
                        />
                    </div>

                    {/* Toggle solo disponibles */}
                    <label style={{
                        display: "flex", alignItems: "center",
                        gap: 6, cursor: "pointer", marginBottom: 8
                    }}>
                        <input
                            type="checkbox"
                            checked={soloDisponibles}
                            onChange={e => setSoloDisponibles(e.target.checked)}
                        />
                        Mostrar solo disponibles
                    </label>

                    <div style={{
                        maxHeight: "62vh", overflow: "auto",
                        border: "1px solid #eee", borderRadius: 6,
                        padding: 8
                    }}>
                        {loading && <div style={{ padding: 8 }}>Cargando...</div>}

                        {!loading && visible.length === 0 && (
                            <div style={{ padding: 8, color: "#666" }}>
                                No se encontraron vehículos
                            </div>
                        )}

                        {!loading && visible.map(v => {
                            const isOcupado = ocupados.has(Number(v.id));
                            const isSelected = selectedId === v.id;

                            return (
                                <div
                                    key={v.id}
                                    onClick={() => !isOcupado && selectVehicle(v)}
                                    style={{
                                        padding: 10, borderRadius: 6,
                                        cursor: isOcupado ? "not-allowed" : "pointer",
                                        display: "flex", gap: 10, alignItems: "center",
                                        marginBottom: 6,
                                        background: isSelected ? "#f0f8ff" : "transparent",
                                        opacity: isOcupado ? 0.45 : 1,
                                        pointerEvents: isOcupado ? "none" : "auto",
                                        position: "relative"
                                    }}
                                >
                                    {/* Badge "Ocupado" */}
                                    {isOcupado && (
                                        <div style={{
                                            position: "absolute",
                                            top: 6, right: 6,
                                            background: "#d9534f",
                                            color: "white",
                                            padding: "2px 6px",
                                            fontSize: 10,
                                            borderRadius: 4,
                                            fontWeight: 700
                                        }}>
                                            Ocupado
                                        </div>
                                    )}

                                    <div style={{
                                        width: 56, height: 44, borderRadius: 6,
                                        overflow: "hidden", background: "#fafafa",
                                        display: "flex", alignItems: "center",
                                        justifyContent: "center"
                                    }}>
                                        {v.image ? (
                                            <img src={v.image} alt=""
                                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                            />
                                        ) : (
                                            <div style={{ fontSize: 12 }}>{v.model || "—"}</div>
                                        )}
                                    </div>

                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700 }}>
                                            {v.name} {v.license_plate ? `(${v.license_plate})` : ""}
                                        </div>
                                        <div style={{ fontSize: 12, color: "#666" }}>
                                            {v.driver_name ? `Chofer: ${v.driver_name}` : "Sin chofer"}
                                        </div>
                                    </div>

                                    <div style={{ minWidth: 120, textAlign: "right" }}>
                                        <div style={{ fontWeight: 700 }}>
                                            {v.x_capacidad ?? "—"} {v.x_unidad_capacidad ?? ""}
                                        </div>
                                        <div style={{ fontSize: 12, color: "#666" }}>
                                            Pallets: {v.x_capacidad_pallets ?? "—"}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* DETALLE */}
                <div style={{ width: 320 }}>
                    <h4 style={{ marginTop: 0 }}>Detalle</h4>

                    {detail ? (
                        <div>
                            <div style={{ marginBottom: 8 }}>
                                <strong>{detail.name}</strong>
                                <div style={{ fontSize: 13, color: "#666" }}>{detail.model || ""}</div>

                                <div style={{ marginTop: 8 }}>
                                    <div>Patente: {detail.license_plate || "—"}</div>
                                    <div>Chofer: {detail.driver_name || "—"}</div>
                                    <div>
                                        Capacidad: {detail.x_capacidad ?? "—"} {detail.x_unidad_capacidad || ""}
                                    </div>
                                    <div>Pallets: {detail.x_capacidad_pallets ?? "—"}</div>
                                </div>
                            </div>

                            {detail.image && (
                                <img src={detail.image} alt="avatar" style={{
                                    width: "100%", borderRadius: 6
                                }} />
                            )}
                        </div>
                    ) : (
                        <div style={{ color: "#666" }}>
                            Selecciona un vehículo para ver detalles
                        </div>
                    )}

                    <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                        <button className="btn btn-outlined" onClick={onClose}>
                            Cancelar
                        </button>
                        <button className="btn btn-primary" onClick={assign}>
                            Asignar vehículo
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
