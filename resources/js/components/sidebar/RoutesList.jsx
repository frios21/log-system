// /mnt/data/RoutesList.jsx
import { useEffect, useState } from "react";
import RouteCard from "./RouteCard";
import RouteAssignModal from "../modals/RouteAssignModal";

export default function RoutesView() {
    const [rutas, setRutas] = useState([]);
    const [openAssignFor, setOpenAssignFor] = useState(null);

    // UI: filtros y búsqueda
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState(""); // "" = todos
    const [selectedRoutes, setSelectedRoutes] = useState(new Set());

    useEffect(() => {
        refetch();
    }, []);

    // cuando cambian rutas -> inicializar selección (seleccionar todas)
    useEffect(() => {
        const ids = rutas.map(r => r.id);
        setSelectedRoutes(new Set(ids));
        // notificar mapa que todas están seleccionadas
        window.dispatchEvent(new CustomEvent("routes-selection-changed", { detail: { ids } }));
    }, [rutas]);

    // recibir updates de distancia
    useEffect(() => {
        function refreshOnDistanceUpdate(ev) {
            const { routeId, distanceKm } = ev.detail;

            setRutas(prev =>
                prev.map(r =>
                    r.id === routeId
                        ? { ...r, total_distance_km: distanceKm }
                        : r
                )
            );
        }

        window.addEventListener("route-distance-updated", refreshOnDistanceUpdate);
        return () =>
            window.removeEventListener("route-distance-updated", refreshOnDistanceUpdate);
    }, []);

    function refetch() {
        fetch("/api/rutas")
            .then(r => r.json())
            .then(setRutas)
            .catch(console.error);
    }

    async function deleteRoute(id) {
        if (!confirm("¿Eliminar ruta?")) return;

        await fetch(`/api/rutas/${id}`, { method: "DELETE" });

        refetch();
    }

    function toggleSelect(id, v) {
        setSelectedRoutes(prev => {
            const next = new Set(prev);
            if (v === undefined) {
                // toggle
                next.has(id) ? next.delete(id) : next.add(id);
            } else {
                if (v) next.add(id); else next.delete(id);
            }
            // notificar al mapa
            window.dispatchEvent(new CustomEvent("routes-selection-changed", { detail: { ids: Array.from(next) } }));
            return next;
        });
    }

    function toggleSelectAll(v) {
        if (v) {
            const all = rutas.map(r => r.id);
            setSelectedRoutes(new Set(all));
            window.dispatchEvent(new CustomEvent("routes-selection-changed", { detail: { ids: all } }));
        } else {
            setSelectedRoutes(new Set());
            window.dispatchEvent(new CustomEvent("routes-selection-changed", { detail: { ids: [] } }));
        }
    }

    // filtros + búsqueda
    function normalize(str) {
        if (!str) return "";
        return str
            .toString()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    const visibleRutas = rutas.filter(r => {
        // filtro por estado
        if (statusFilter && r.status !== statusFilter) return false;

        // búsqueda flexible
        const q = normalize(search);
        if (!q) return true;

        const name = normalize(r.name);
        const id = normalize(r.id);
        const distance = normalize(r.total_distance_km);

        return (
            name.includes(q) ||
            id.includes(q) ||
            distance.includes(q)
        );
    });

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3>Rutas</h3>
                <button className="btn btn-primary" onClick={async () => {
                    const res = await fetch("/api/rutas", {
                        method: "POST",
                        headers: {"Content-Type":"application/json"},
                        body: JSON.stringify({ name: "Ruta nueva" })
                    });
                    const created = await res.json();
                    refetch();
                }}>+</button>
            </div>

            {/* filtros */}
            <div style={{ fontSize: 14, marginBottom: 10, display: "flex", gap: 8 }}>
                <input placeholder="Buscar rutas..." value={search} onChange={e => setSearch(e.target.value)} className="input" />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input" style={{ width: 140 }}>
                    <option value="">Todas</option>
                    <option value="draft">Pendientes</option>
                    <option value="assigned">Asignadas</option>
                    <option value="delivered">Entregadas</option>
                </select>

                <label style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                        type="checkbox"
                        checked={selectedRoutes.size === rutas.length && rutas.length > 0}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                    /> Seleccionar todas
                </label>
            </div>

            {/* lista */}
            {visibleRutas.map((r, i) => (
                <RouteCard
                    key={r.id}
                    ruta={r}
                    colorIndex={i}
                    visible={selectedRoutes.has(r.id)}
                    onToggleVisible={(id, v) => toggleSelect(id, v)}
                    onAssign={() => setOpenAssignFor(r)}
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
        </div>
    );
}
