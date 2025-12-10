import React, { useEffect, useState } from "react";
import RouteCard from "./RouteCard";
import RouteAssignModal from "../modals/RouteAssignModal";
import VehicleAssignModal from "../modals/VehicleAssignModal";
import { useRutas } from "../../api/rutas";

// Componente que lista las rutas
// permite crear, eliminar, asignar rutas junto a
// filtros de búsqueda y estado -> falta filtro de fecha

export default function RoutesList() {
    const { data: rutasData = [], refetch } = useRutas();
    const [openAssignFor, setOpenAssignFor] = useState(null);
    const [openVehicleAssignFor, setOpenVehicleAssignFor] = useState(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [selectedRoutes, setSelectedRoutes] = useState(new Set());
    const [filterDate, setFilterDate] = useState(""); // YYYY-MM-DD
    const [showFilters, setShowFilters] = useState(false);

    // datos base desde React Query
    const rutas = Array.isArray(rutasData) ? rutasData : [];

    async function createRoute() {
        try {
            const res = await fetch("/api/rutas", {
                method: "POST",
                headers: { "Content-Type": "application/json" }
            });
            await res.json();
            refetch();
        } catch (e) {
            console.error(e);
        }
    }

    async function deleteRoute(id) {
        if (!confirm("¿Eliminar ruta?")) return;
        try {
            await fetch(`/api/rutas/${id}`, { method: "DELETE" });
            refetch();
        } catch (e) {
            console.error(e);
        }
    }

    function normalizeString(s = "") {
        return s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    const q = normalizeString(search.trim());

    const visibleRutas = rutas.filter((r) => {
        if (statusFilter && r.status !== statusFilter) return false;

        // Filtro por fecha (frontend): comparamos YYYY-MM-DD
        if (filterDate) {
            const rawDate = r.estimated_date || r.date || "";
            if (!rawDate) return false;
            // normalizamos a YYYY-MM-DD, ignorando hora
            const ymd = (rawDate.split(" ")[0] || rawDate.split("T")[0]);
            if (ymd !== filterDate) return false;
        }

        if (!q) return true;
        const name = normalizeString(r.name || "");
        const idStr = String(r.id || "");
        return name.includes(q) || idStr.includes(q);
    });

    return (
        <div>
            {/* Botón nueva ruta + filtros */}
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: 8 }}>
                <button className="btn btn-primary" onClick={createRoute}>+</button>
            </div>
            {/* Filtros similares a CargasList */}
            <div style={{ marginBottom: 10 }}>
                <button
                    type="button"
                    className="btn btn-outlined"
                    onClick={() => setShowFilters(v => !v)}
                    style={{
                        padding: "2px 8px",
                        fontSize: 12,
                        borderRadius: 999,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                    }}
                >
                    Filtros
                    <span style={{ fontSize: 10 }}>
                        {showFilters ? "▲" : "▼"}
                    </span>
                </button>

                {showFilters && (
                    <div
                        style={{
                            marginTop: 6,
                            border: "1px solid #e5e7eb",
                            borderRadius: 8,
                            padding: 8,
                            background: "#f9fafb",
                            boxSizing: "border-box",
                            overflowX: "hidden",
                        }}
                    >
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                columnGap: 8,
                                rowGap: 6,
                                alignItems: "center",
                            }}
                        >
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={{ fontSize: 12, color: "#6b7280" }}>Buscar</span>
                                <input
                                    className="input"
                                    placeholder="Buscar rutas..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    style={{ width: "100%", boxSizing: "border-box" }}
                                />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={{ fontSize: 12, color: "#6b7280" }}>Estado</span>
                                <select
                                    className="input"
                                    value={statusFilter}
                                    onChange={e => setStatusFilter(e.target.value)}
                                    style={{ width: "75%", boxSizing: "border-box" }}
                                >
                                    <option value="">Todas</option>
                                    <option value="draft">Pendientes</option>
                                    <option value="assigned">Asignadas</option>
                                    <option value="delivered">Entregadas</option>
                                </select>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={{ fontSize: 12, color: "#6b7280" }}>Fecha</span>
                                <input
                                    type="date"
                                    className="input"
                                    value={filterDate}
                                    onChange={e => setFilterDate(e.target.value)}
                                    style={{ width: "75%", boxSizing: "border-box" }}
                                />
                            </div>

                            <div />
                        </div>
                    </div>
                )}
            </div>

            {visibleRutas.map((r, i) => (
                <RouteCard
                    key={r.id}
                    ruta={r}
                    colorIndex={i}
                    onAssign={() => setOpenAssignFor(r)}
                    onAssignVehicle={(route) => setOpenVehicleAssignFor(route)}
                    onDelete={() => deleteRoute(r.id)}
                />
            ))}

            {openAssignFor && (
                <RouteAssignModal
                    ruta={openAssignFor}
                    onClose={() => {
                        setOpenAssignFor(null);
                        refetch();
                    }}
                />
            )}

            {openVehicleAssignFor && (
                <VehicleAssignModal
                    ruta={openVehicleAssignFor}
                    onClose={() => {
                        setOpenVehicleAssignFor(null);
                        refetch();
                    }}
                />
            )}
        </div>
    );
}
