import { useEffect, useState } from "react";
import CargaDetailsModal from "../modals/CargaDetailsModal";

function formatCargaDate(raw) {
    if (!raw) return { date: "", time: "" };

    const [d, t] = raw.split(" ");
    if (!d || !t) return { date: raw, time: "" };

    const [year, month, day] = d.split("-").map(Number);
    const [hour, minute, second] = t.split(":").map(Number);

    const dt = new Date(year, month - 1, day, hour, minute, second || 0);

    const fixed = new Date(dt.getTime() - 3 * 60 * 60 * 1000);

    const date = fixed.toLocaleDateString("es-CL");
    const time = fixed.toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
    });

    return { date, time };
}

// Componente que lista las cargas
// permite ver detalles de cada carga
// incluye filtros de búsqueda, estado y rango de fechas dentro de un desplegable

export default function CargasList() {
    const [cargas, setCargas] = useState([]);
    const [selectedCarga, setSelectedCarga] = useState(null);
    const [editingPalletsFor, setEditingPalletsFor] = useState(null); // id carga
    const [tempPallets, setTempPallets] = useState("");
    const [palletsStatus, setPalletsStatus] = useState({}); // { cargaId: 'success' | 'error' }

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    // filtros de fechas
    const [startDate, setStartDate] = useState(""); // yyyy-mm-dd
    const [endDate, setEndDate] = useState("");     // yyyy-mm-dd

    // desplegable filtros
    const [showFilters, setShowFilters] = useState(false);

    async function loadData() {
        const data = await fetch("/api/cargas")
            .then(r => r.json())
            .catch(() => []);
        setCargas(Array.isArray(data) ? data : []);
    }

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        function handleRefresh() { loadData(); }
        window.addEventListener("cargas-refresh", handleRefresh);
        return () => window.removeEventListener("cargas-refresh", handleRefresh);
    }, []);

    async function savePallets(cargaId) {
        const value = tempPallets.trim();
        const num = value === "" ? null : Number(value);

        if (value !== "" && (isNaN(num) || num < 0)) {
            setEditingPalletsFor(null);
            return;
        }

        try {
            const res = await fetch(`/api/cargas/${cargaId}/pallets`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ total_pallets: num }),
            });
            if (!res.ok) {
                throw new Error("Respuesta no OK");
            }
            await loadData();
            setPalletsStatus(prev => ({ ...prev, [cargaId]: "success" }));
        } catch (e) {
            console.error("No se pudo actualizar los pallets", e);
            setPalletsStatus(prev => ({ ...prev, [cargaId]: "error" }));
        } finally {
            setEditingPalletsFor(null);
            setTimeout(() => {
                setPalletsStatus(prev => {
                    const copy = { ...prev };
                    delete copy[cargaId];
                    return copy;
                });
            }, 2000);
        }
    }

    function normalizeString(s = "") {
        return s.toString()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
    }

    function stateColor(state) {
        switch (state) {
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

    // --- APLICAR FILTROS ---
    const q = normalizeString(search.trim());

    const visibleCargas = cargas.filter(c => {
        // 1) filtro por estado
        if (statusFilter && c.state !== statusFilter) return false;

        // 2) filtro por fechas
        const start = startDate || "";
        const end = endDate || "";
        const cargaDatePart = (c.date || "").split(" ")[0]; // "YYYY-MM-DD"

        if (start || end) {
            // si no tiene fecha y hay filtro de fechas => no mostrar
            if (!cargaDatePart) return false;

            if (start && !end) {
                // solo fecha de inicio -> ese día exacto
                if (cargaDatePart !== start) return false;
            } else if (!start && end) {
                // solo fecha de fin -> ese día exacto
                if (cargaDatePart !== end) return false;
            } else if (start && end) {
                // rango inclusivo
                if (cargaDatePart < start || cargaDatePart > end) return false;
            }
        }

        if (!q) return true;

        const name = normalizeString(c.name || "");
        const idStr = String(c.id || "");

        return name.includes(q) || idStr.includes(q);
    });

    return (
        <>
            {/* ---- FILTROS (DESPLEGABLE) ---- */}
            <div style={{ marginBottom: 10 }}>
                {/* Botón/Chip "Filtros" que abre/cierra */}
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
                        {/* GRID 2 FILAS x 2 COLUMNAS */}
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                columnGap: 8,
                                rowGap: 6,
                                alignItems: "center",
                            }}
                        >
                            {/* FILA 1 - Buscar / Estado */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={{ fontSize: 12, color: "#6b7280" }}>Buscar</span>
                                <input
                                    className="input"
                                    placeholder="Buscar cargas..."
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
                                    <option value="done">Completadas</option>
                                </select>
                            </div>

                            {/* FILA 2 - Inicio / Fin */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={{ fontSize: 12, color: "#6b7280" }}>Inicio</span>
                                <input
                                    type="date"
                                    className="input"
                                    value={startDate}
                                    onChange={e => setStartDate(e.target.value)}
                                    style={{ width: "75%", boxSizing: "border-box" }}
                                />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={{ fontSize: 12, color: "#6b7280" }}>Fin</span>
                                <input
                                    type="date"
                                    className="input"
                                    value={endDate}
                                    onChange={e => setEndDate(e.target.value)}
                                    style={{ width: "75%", boxSizing: "border-box" }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* LISTA */}
            {visibleCargas.map(carga => {
                const { date, time } = formatCargaDate(carga.date);

                return (
                    <div className="card" style={stateColor(carga.state)} key={carga.id}>
                        {/* HEADER */}
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <div className="card-title">{carga.name}</div>

                            <div style={{ textAlign: "right", fontSize: "13px", color: "#6b7280" }}>
                                {date}<br />
                                {time}
                            </div>
                        </div>

                        {/* Cliente */}
                        {(carga.partner || carga.vendor_id) && (
                            <div
                                className="chip"
                                style={{ marginTop: "8px", cursor: "pointer" }}
                                onClick={() => {
                                    const partnerId =
                                        carga.partner?.id ??
                                        (Array.isArray(carga.vendor_id)
                                            ? carga.vendor_id[0]
                                            : carga.vendor_id);

                                    if (
                                        carga.partner &&
                                        carga.partner.latitude &&
                                        carga.partner.longitude
                                    ) {
                                        const ct = {
                                            id: Number(carga.partner.id),
                                            name: carga.partner.name,
                                            latitude: Number(carga.partner.latitude),
                                            longitude: Number(carga.partner.longitude),
                                            street: carga.partner.street,
                                        };
                                        window.dispatchEvent(
                                            new CustomEvent("contacts-markers-show", {
                                                detail: [ct],
                                            })
                                        );
                                        window.dispatchEvent(
                                            new CustomEvent("focus-contact", { detail: ct })
                                        );
                                    } else if (partnerId) {
                                        window.dispatchEvent(
                                            new CustomEvent("focus-client", {
                                                detail: Number(partnerId),
                                            })
                                        );
                                    }
                                }}
                            >
                                {carga.vendor_name || carga.partner?.name}
                            </div>
                        )}

                        {/* Info */}
                        <div className="text-small" style={{ marginTop: "10px" }}>
                            Cantidad: <strong>{carga.total_quantity} kg</strong> — Pallets:{" "}
                            {editingPalletsFor === carga.id ? (
                                <input
                                    autoFocus
                                    value={tempPallets}
                                    onChange={e => setTempPallets(e.target.value)}
                                    onBlur={() => savePallets(carga.id)}
                                    onKeyDown={e => {
                                        if (e.key === "Enter") savePallets(carga.id);
                                        if (e.key === "Escape") setEditingPalletsFor(null);
                                    }}
                                    style={{
                                        width: 60,
                                        fontSize: 12,
                                        padding: "0 4px",
                                        marginLeft: 4,
                                    }}
                                />
                            ) : (
                                <span
                                    onDoubleClick={() => {
                                        setEditingPalletsFor(carga.id);
                                        setTempPallets(
                                            carga.total_pallets != null
                                                ? String(carga.total_pallets)
                                                : ""
                                        );
                                    }}
                                    style={{ cursor: "pointer", marginLeft: 4, display: "inline-flex", alignItems: "center", gap: 6 }}
                                >
                                    <strong>{carga.total_pallets}</strong>
                                    {palletsStatus[carga.id] === "success" && (
                                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
                                    )}
                                    {palletsStatus[carga.id] === "error" && (
                                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
                                    )}
                                </span>
                            )}
                        </div>

                        {/* BOTÓN DETALLES */}
                        <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
                            <button
                                className="btn btn-outlined"
                                style={{ flex: 1 }}
                                onClick={() => setSelectedCarga(carga)}
                            >
                                Detalles
                            </button>
                        </div>
                    </div>
                );
            })}

            {selectedCarga && (
                <CargaDetailsModal
                    carga={selectedCarga}
                    onClose={() => setSelectedCarga(null)}
                />
            )}
        </>
    );
}
