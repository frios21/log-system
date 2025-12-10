import React, { useState } from "react";
import RouteConfirmModal from "../modals/RouteConfirmModal";

// Componente que muestra la información de una ruta
// permite editar nombre, cambiar estado, -> quitar editar nombre (ya tiene correlativo)
// asignar cargas y vehículo, eliminar ruta
// incluye función para abrir ruta en Google Maps

function stateColor(status) {
    switch (status) {
        case "draft":
            return { background: "#ffebee", borderLeft: "5px solid #d32f2f" };
        case "assigned":
            return { background: "#fff8e1", borderLeft: "5px solid #f9a825" };
        case "done":
            return { background: "#e8f5e9", borderLeft: "5px solid #2e7d32" };
        default:
            return {};
    }
}

export default function RouteCard({ ruta, colorIndex = 0, onAssign, onAssignVehicle, onDelete }) {
    // estado local para reflejar cambios inmediatos en el card
    const [localStatus, setLocalStatus] = useState(ruta.status);
    const color = stateColor(localStatus);

    // modal de confirmación de cambio de estado
    const [modalOpen, setModalOpen] = useState(false);
    const [targetStatus, setTargetStatus] = useState(null);

    // helpers calculados para el card
    const distance = (ruta.total_distance_km !== undefined && ruta.total_distance_km !== null)
        ? `${Number(ruta.total_distance_km).toFixed(2)} km`
        : "—";

    // cantidad total: esperada si no está done, real (total_qnt) si está done
    const expectedKg = ruta.expected_qnt != null ? Number(ruta.expected_qnt) : null;
    const realKg = ruta.total_qnt != null ? Number(ruta.total_qnt) : null;

    const isDone = localStatus === 'done';

    const totalKg = isDone
        ? (realKg != null ? realKg : expectedKg)
        : expectedKg;
    const totalKgLabel = totalKg != null ? `${totalKg.toLocaleString()} kg` : '—';

    // costo por kg: estimado si no está done, real si está done (usa total_qnt y total_cost si existe)
    const estimatedCostPerKg = ruta.cost_per_kg != null ? Number(ruta.cost_per_kg) : null;
    const realCostPerKg = (isDone && ruta.total_cost != null && realKg)
        ? Number(ruta.total_cost) / realKg
        : null;

    const costPerKg = isDone ? (realCostPerKg ?? estimatedCostPerKg) : estimatedCostPerKg;
    const costPerKgLabel = costPerKg != null ? `$ ${costPerKg.toFixed(2)}/kg` : '—';

    // fecha viene de backend posiblemente con hora; normalizamos a YYYY-MM-DD
    const rawInitialDate = ruta.estimated_date || ruta.date || "";
    const initialYmd = rawInitialDate
        ? (rawInitialDate.split(" ")[0] || rawInitialDate.split("T")[0])
        : "";
    const [routeDate, setRouteDate] = useState(initialYmd);
    const [editingDate, setEditingDate] = useState(false);

    function toggleVisible(e) {
        window.dispatchEvent(
            new CustomEvent("toggle-route-visible", {
                detail: { id: ruta.id, visible: e.target.checked }
            })
        );
    }

    function openInGoogleMaps() {
        let waypoints;

        try {
            waypoints = Array.isArray(ruta.waypoints)
                ? ruta.waypoints
                : JSON.parse(ruta.waypoints || "[]");
        } catch (e) {
            console.error("Error parseando waypoints:", e);
            return;
        }

        if (!waypoints.length) return;

        const origin = `${waypoints[0].lat},${waypoints[0].lon}`;
        const destination = `${waypoints[waypoints.length - 1].lat},${waypoints[waypoints.length - 1].lon}`;

        const wpList = waypoints
            .slice(1, -1)
            .map(wp => `${wp.lat},${wp.lon}`)
            .join("|");

        const url =
            `https://www.google.com/maps/dir/?api=1` +
            `&origin=${origin}` +
            `&destination=${destination}` +
            `&waypoints=${wpList}` +
            `&travelmode=driving`;

        window.open(url, "_blank");
    }

    // botón dinámico según estado
    const canStart = localStatus === 'draft';
    const canFinish = localStatus === 'assigned';

    function openConfirm(status) {
        // enfocar la ruta en el mapa
        window.dispatchEvent(new CustomEvent('focus-route', { detail: { routeId: ruta.id } }));
        setTargetStatus(status);
        setModalOpen(true);
    }

    async function confirmChange() {
        if (!targetStatus) return;
        try {
            await fetch(`/api/rutas/${ruta.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: targetStatus })
            });
            setModalOpen(false);
            setLocalStatus(targetStatus);
            // notificar al mapa para recolorear la ruta
            window.dispatchEvent(new CustomEvent('route-status-updated', { detail: { routeId: ruta.id, status: targetStatus } }));
            // notificar que las cargas pueden haber cambiado de estado
            if (targetStatus === 'done') {
                window.dispatchEvent(new Event('cargas-refresh'));
            }
        } catch (e) {
            console.error('No se pudo actualizar el estado de la ruta', e);
        }
    }

    return (
        <div
            className="card"
            style={{
                marginBottom: 12,
                ...stateColor(localStatus)
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                        type="checkbox"
                        defaultChecked={localStatus !== 'done'}
                        onChange={toggleVisible}
                    />
                    <span>{ruta.name}</span>
                </label>

                <div style={{ fontSize: 12, color: "#444" }}>
                    {distance}
                </div>
            </div>

            <div style={{ marginTop: 8, color: "#333", display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                    <div style={{ fontSize: 11, color: '#666' }}>Fecha</div>
                    {editingDate ? (
                        <input
                            autoFocus
                            type="date"
                            value={routeDate || ""}
                            onChange={(e) => setRouteDate(e.target.value)}
                            onBlur={async () => {
                                setEditingDate(false);
                                if (!routeDate) return;
                                try {
                                    await fetch(`/api/rutas/${ruta.id}`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ date: routeDate }),
                                    });
                                } catch (err) {
                                    console.error("No se pudo actualizar la fecha de la ruta", err);
                                }
                            }}
                            onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                    e.currentTarget.blur();
                                }
                                if (e.key === "Escape") {
                                    setEditingDate(false);
                                    setRouteDate(initialYmd);
                                }
                            }}
                            style={{
                                fontSize: 12,
                                padding: "2px 4px",
                                borderRadius: 4,
                                border: "1px solid #ccc",
                                width: "100%",
                            }}
                        />
                    ) : (
                        <div
                            onDoubleClick={() => setEditingDate(true)}
                            style={{ cursor: "pointer", minHeight: 18 }}
                        >
                            {routeDate
                                ? (() => {
                                      const [y, m, d] = routeDate.split("-");
                                      if (!y || !m || !d) return routeDate;
                                      return `${d}-${m}-${y}`;
                                  })()
                                : "—"}
                        </div>
                    )}
                </div>
                <div>
                    <div style={{ fontSize: 11, color: '#666' }}>
                        {isDone ? 'Cantidad total' : 'Cantidad total esperada'}
                    </div>
                    <div>{totalKgLabel}</div>
                </div>
                <div>
                    <div style={{ fontSize: 11, color: '#666' }}>
                        {isDone ? 'Costo por kg real' : 'Costo por kg estimado'}
                    </div>
                    <div>{costPerKgLabel}</div>
                </div>
                <div>
                    <div style={{ fontSize: 11, color: '#666' }}>Cargas</div>
                    <div>{(ruta.load_ids || []).length}</div>
                </div>
            </div>

            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                {!isDone && (
                    <>
                        <button title="Asignar cargas" className="btn btn-primary" onClick={onAssign}>📦</button>
                        <button title="Asignar vehículo" className="btn btn-primary" onClick={() => onAssignVehicle(ruta)}>🚛</button>
                    </>
                )}
                <button title="Ver en Google Maps" className="btn btn-primary" onClick={openInGoogleMaps}>📍</button>

                {canStart && (
                    <button title="Comenzar ruta" className="btn btn-success" onClick={() => openConfirm('assigned')}>
                        ▶
                    </button>
                )}

                {canFinish && (
                    <button title="Finalizar ruta" className="btn btn-success" onClick={() => openConfirm('done')}>
                        ⏹
                    </button>
                )}

                <button title="Eliminar ruta" className="btn btn-danger" style={{ background: "#e74c3c", color: "white" }} onClick={onDelete}>🗑</button>
            </div>

            {/* Modal de confirmación */}
            <RouteConfirmModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onConfirm={confirmChange}
                ruta={ruta}
                targetStatus={targetStatus}
            />
        </div>
    );
}
