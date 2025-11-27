import React, { useState } from "react";
import RouteConfirmModal from "../modals/RouteConfirmModal";

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
    // Estado local para reflejar cambios inmediatos en el card
    const [localStatus, setLocalStatus] = useState(ruta.status);
    const color = stateColor(localStatus);

    const [editing, setEditing] = useState(false);
    const [tempName, setTempName] = useState(ruta.name);

    // Modal de confirmación de cambio de estado
    const [modalOpen, setModalOpen] = useState(false);
    const [targetStatus, setTargetStatus] = useState(null);

    function toggleVisible(e) {
        window.dispatchEvent(
            new CustomEvent("toggle-route-visible", {
                detail: { id: ruta.id, visible: e.target.checked }
            })
        );
    }

    async function saveName() {
        if (!tempName.trim()) {
            setTempName(ruta.name);
            setEditing(false);
            return;
        }

        await fetch(`/api/rutas/${ruta.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: tempName }),
        });

        window.dispatchEvent(
            new CustomEvent("route-distance-updated", {
                detail: { routeId: ruta.id },
            })
        );

        setEditing(false);
    }

    function handleKey(e) {
        if (e.key === "Enter") saveName();
        if (e.key === "Escape") {
            setTempName(ruta.name);
            setEditing(false);
        }
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

    const distance =
        ruta.total_distance_km !== undefined && ruta.total_distance_km !== null
            ? `${ruta.total_distance_km.toFixed(2)} km`
            : "—";

    // Botón dinámico según estado
    const canStart = localStatus === 'draft';
    const canFinish = localStatus === 'assigned';
    const isDone = localStatus === 'done';

    function openConfirm(status) {
        // Enfocar la ruta en el mapa
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
            // Notificar al mapa para recolorear la ruta
            window.dispatchEvent(new CustomEvent('route-status-updated', { detail: { routeId: ruta.id, status: targetStatus } }));
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
                    <input type="checkbox"
                        defaultChecked={true}
                        onChange={toggleVisible}
                    />
                    {editing ? (
                        <input
                            autoFocus
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            onBlur={saveName}
                            onKeyDown={handleKey}
                            style={{
                                padding: "2px 4px",
                                fontSize: "14px",
                                width: "160px",
                                borderRadius: 4,
                                border: "1px solid #bbb",
                            }}
                        />
                    ) : (
                        <span onDoubleClick={() => setEditing(true)} style={{ cursor: "pointer" }}>
                            {ruta.name}
                        </span>
                    )}
                </label>

                <div style={{ fontSize: 12, color: "#444" }}>
                    {distance}
                </div>
            </div>

            <div style={{ marginTop: 8, color: "#333" }}>
                Cargas: {(ruta.load_ids || []).length}
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

                {!isDone && (
                    <button title="Eliminar ruta" className="btn btn-danger" style={{ background: "#e74c3c", color: "white" }} onClick={onDelete}>🗑</button>
                )}
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
