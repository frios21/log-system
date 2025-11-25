import React, { useState } from "react";

function pastelColor(i) {
    const hue = (i * 47) % 360;
    return `hsl(${hue} 70% 85%)`;
}

export default function RouteCard({ ruta, colorIndex = 0, onAssign, onDelete }) {
    const color = pastelColor(colorIndex);

    const [editing, setEditing] = useState(false);
    const [tempName, setTempName] = useState(ruta.name);

    async function saveName() {
        if (!tempName.trim()) {
            setTempName(ruta.name); 
            setEditing(false);
            return;
        }

        // guardar en backend
        await fetch(`/api/rutas/${ruta.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: tempName }),
        });

        // avisar al parent que refresque
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

    // distancia con formato seguro
    const distance =
        ruta.total_distance_km !== undefined && ruta.total_distance_km !== null
            ? `${ruta.total_distance_km.toFixed(2)} km`
            : "—";

    return (
        <div className="card" style={{ marginBottom: 12, background: color }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>

                {/* --- Nombre editable --- */}
                <div style={{ fontWeight: 700 }}>
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
                        <span
                            onDoubleClick={() => setEditing(true)}
                            style={{ cursor: "pointer" }}
                        >
                            {ruta.name}
                        </span>
                    )}
                </div>

                {/* distancia */}
                <div style={{ fontSize: 12, color: "#444" }}>
                    {distance}
                </div>
            </div>

            <div style={{ marginTop: 8, color: "#333" }}>
                Cargas: {(ruta.load_ids || []).length}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                        type="checkbox"
                        checked={ruta.isVisible ?? true}
                        onChange={(e) => {
                            window.dispatchEvent(
                                new CustomEvent("toggle-route-visible", {
                                    detail: { id: ruta.id, visible: e.target.checked }
                                })
                            );
                        }}
                    />
                    <span>Visible</span>
                </label>
                <button className="btn btn-primary" onClick={onAssign}>
                    Asignar
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
