import { useEffect, useState } from "react";
import RouteCard from "./RouteCard";
import RouteAssignModal from "../modals/RouteAssignModal";

export default function RoutesView() {
    const [rutas, setRutas] = useState([]);
    const [openAssignFor, setOpenAssignFor] = useState(null);

    useEffect(() => {
        refetch();
    }, []);

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
            .then(rutas => {
                setRutas(rutas);

                // Al cargar rutas, dibujarlas automáticamente
                rutas.forEach(r =>
                    window.dispatchEvent(
                        new CustomEvent("draw-route", { detail: r.id })
                    )
                );
            })
            .catch(console.error);
    }

    async function deleteRoute(id) {
        if (!confirm("¿Eliminar ruta?")) return;

        await fetch(`/api/rutas/${id}`, { method: "DELETE" });

        refetch();
    }

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
                    await res.json();
                    refetch();
                }}>+</button>
            </div>

            {rutas.map((r, i) => (
                <RouteCard
                    key={r.id}
                    ruta={r}
                    colorIndex={i}
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
