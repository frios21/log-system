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
    const [showDatePicker, setShowDatePicker] = useState(false);

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
            const ymd = rawDate.split("T")[0];
            if (ymd !== filterDate) return false;
        }

        if (!q) return true;
        const name = normalizeString(r.name || "");
        const idStr = String(r.id || "");
        return name.includes(q) || idStr.includes(q);
    });

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3>Rutas</h3>
                <div>
                    <button className="btn btn-primary" onClick={createRoute}>+</button>
                </div>
            </div>

            <div style={{ marginBottom: 10, display: "flex", gap: 8, alignItems: "center" }}>
                <input placeholder="Buscar rutas..." value={search} onChange={e => setSearch(e.target.value)} className="input" />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input" style={{ width: 160 }}>
                    <option value="">Todas</option>
                    <option value="draft">Pendientes</option>
                    <option value="assigned">Asignadas</option>
                    <option value="delivered">Entregadas</option>
                </select>
                <div style={{ position: "relative" }}>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        title={filterDate ? `Filtrando: ${filterDate}` : "Filtrar por fecha"}
                        onClick={() => setShowDatePicker((v) => !v)}
                        style={{ padding: "4px 8px" }}
                    >
                        📅
                    </button>
                    {showDatePicker && (
                        <input
                            autoFocus
                            type="date"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            onBlur={() => setShowDatePicker(false)}
                            style={{
                                position: "absolute",
                                top: "100%",
                                left: 0,
                                marginTop: 4,
                                fontSize: 12,
                                padding: "2px 4px",
                                borderRadius: 4,
                                border: "1px solid #ccc",
                                background: "white",
                                zIndex: 10,
                            }}
                        />
                    )}
                </div>
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
