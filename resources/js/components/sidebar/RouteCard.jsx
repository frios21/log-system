import React, { useState } from "react";

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
    const color = stateColor(ruta.status);

    const [editing, setEditing] = useState(false);
    const [tempName, setTempName] = useState(ruta.name);

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

    return (
        <div
            className="card"
            style={{
                marginBottom: 12,
                ...stateColor(ruta.status)
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

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn btn-primary" onClick={onAssign}>📦</button>

                <button className="btn btn-primary" onClick={() => onAssignVehicle(ruta)}>
                    🚛
                </button>

                <button className="btn btn-primary" onClick={openInGoogleMaps}>
                    📍
                </button>

                <button
                    className="btn btn-danger"
                    style={{ background: "#e74c3c", color: "white" }}
                    onClick={onDelete}
                >
                    🗑
                </button>
            </div>
        </div>
    );
}
