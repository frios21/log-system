// CargasList.jsx
import { useEffect, useState } from "react";

// normalizar busqueda
function normalize(str) {
    if (!str) return "";
    return str
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

export default function CargasList() {
    const [cargas, setCargas] = useState([]);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    useEffect(() => {
        fetch("/api/cargas")
            .then(r => r.json())
            .then(setCargas)
            .catch(console.error);
    }, []);

    const q = normalize(search);

    const visibles = cargas.filter(c => {
        // filtro por estado
        if (statusFilter && c.state !== statusFilter) return false;

        // filtro por búsqueda flexible
        if (q) {
            const match =
                normalize(c.name).includes(q) ||
                normalize(c.vendor_name).includes(q) ||
                normalize(c.partner?.name).includes(q) ||
                normalize(c.id).includes(q);

            if (!match) return false;
        }

        return true;
    });

    return (
        <div>
            <h3 style={{ marginBottom: 12 }}>Cargas</h3>

            {/* Barra de búsqueda + filtro */}
            <div style={{ marginBottom: 10, display: "flex", gap: 8 }}>
                <input
                    className="input"
                    placeholder="Buscar cargas..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />

                <select
                    className="input"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    style={{ width: 140 }}
                >
                    <option value="">Todos</option>
                    <option value="draft">Draft</option>
                    <option value="assigned">Asignado</option>
                    <option value="delivered">Entregado</option>
                    <option value="cancelled">Cancelado</option>
                </select>
            </div>

            {/* Lista filtrada */}
            {visibles.map(c => (
                <div
                    key={c.id}
                    className="card"
                    style={{ padding: 12, marginBottom: 10 }}
                >
                    <strong>{c.name}</strong>

                    <div style={{ fontSize: 13, marginTop: 4 }}>
                        <div>Cliente: {c.partner?.name || "—"}</div>
                        <div>Proveedor: {c.vendor_name}</div>
                        <div>Estado: {c.state}</div>
                        <div>Cantidad: {c.total_quantity} kg</div>
                    </div>
                </div>
            ))}

            {visibles.length === 0 && (
                <p style={{ marginTop: 20 }}>No se encontraron cargas.</p>
            )}
        </div>
    );
}
