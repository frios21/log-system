import { useEffect, useState } from "react";
import CargaDetailsModal from "../modals/CargaDetailsModal";
import ContactSelectModal from "../modals/ContactSelectModal";
import { useCargas } from "../../api/cargas";
import { useContactos } from "../../api/contactos";
import CircleLoader from "../common/CircleLoader";

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

export default function CargasList({ onBlockingChange }) {
    const { data: cargasData = [], isLoading, isFetching, refetch } = useCargas();
    const { data: contactosData = [], isLoading: loadingContactos } = useContactos();
    const [selectedCarga, setSelectedCarga] = useState(null);
    const [editingPalletsFor, setEditingPalletsFor] = useState(null); // id carga (no usado ahora, pero dejamos por si se reusa)
    const [tempPallets, setTempPallets] = useState("");
    const [palletsStatus, setPalletsStatus] = useState({}); // { cargaId: 'success' | 'error' }

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");

    // filtros de fechas
    const [startDate, setStartDate] = useState(""); // yyyy-mm-dd
    const [endDate, setEndDate] = useState("");     // yyyy-mm-dd

    // desplegable filtros
    const [showFilters, setShowFilters] = useState(false);

    // datos base
    const cargas = Array.isArray(cargasData) ? cargasData : [];
    const contactos = Array.isArray(contactosData) ? contactosData : [];

    const [lastCreatedId, setLastCreatedId] = useState(null);
    const [editingManualFields, setEditingManualFields] = useState({}); // { [id]: { name, qty, pallets, date } }
    const [contactModalTarget, setContactModalTarget] = useState(null); // { id, title } | null
    const [inlineStatus, setInlineStatus] = useState({}); // { [id]: 'saving' | 'success' | 'error' }

    async function createCarga() {
        try {
            onBlockingChange && onBlockingChange(true);
            const res = await fetch("/api/cargas", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            const created = await res.json();
            if (created && created.id != null) {
                setLastCreatedId(created.id);
            }
            await refetch();
        } catch (e) {
            console.error(e);
        } finally {
            onBlockingChange && onBlockingChange(false);
        }
    }

    function isManualCarga(carga) {
        const raw = (carga?.name || "").toString().trim();
        if (!raw) return true;

        const upper = raw.toUpperCase().replace(/\s+/g, "");
        return !/^OC\d+/.test(upper);
    }

    async function updateManualCarga(id, patch) {
        try {
            setInlineStatus(prev => ({ ...prev, [id]: 'saving' }));
            await fetch(`/api/cargas/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            });
            await refetch();

            setInlineStatus(prev => ({ ...prev, [id]: 'success' }));

            setTimeout(() => {
                setInlineStatus(prev => {
                    if (prev[id] !== 'success') return prev;
                    const next = { ...prev };
                    delete next[id];
                    return next;
                });
            }, 800);
        } catch (e) {
            console.error(e);
            setInlineStatus(prev => ({ ...prev, [id]: 'error' }));
        }
    }

    useEffect(() => {
        function handleRefresh() { loadData(); }
        window.addEventListener("cargas-refresh", handleRefresh);
        return () => window.removeEventListener("cargas-refresh", handleRefresh);
    }, []);

    // Mantengo palletsStatus por si en el futuro queremos marcar visualmente
    // que la carga fue recalculada en base a líneas. Por ahora no hay edición
    // directa de total_pallets aquí.

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

    let visibleCargas = cargas.filter(c => {
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
        const vendorName = normalizeString(c.vendor_name || c.partner?.name || "");

        const qtyStr = String(c.total_quantity ?? "");
        const palletsStr = String(c.total_pallets ?? "");

        const combined = `${name} ${vendorName} ${qtyStr} ${palletsStr}`;

        return (
            name.includes(q) ||
            idStr.includes(q) ||
            vendorName.includes(q) ||
            combined.includes(q)
        );
    });

    // Si acabamos de crear una carga manual en esta sesión,
    // la forzamos a aparecer arriba de la lista, sin alterar
    // el orden original del resto. Tras recargar el componente,
    // lastCreatedId vuelve a null y se usa el orden normal.
    if (lastCreatedId != null) {
        visibleCargas = [...visibleCargas].sort((a, b) => {
            if (a.id === lastCreatedId) return -1;
            if (b.id === lastCreatedId) return 1;
            return 0;
        });
    }

    return (
        <>
            {/* ---- FILTROS (DESPLEGABLE) ---- */}
            <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
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

                    <button className="btn btn-primary" onClick={createCarga}>+</button>
                </div>

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
            {isLoading ? (
                <CircleLoader size={32} />
            ) : visibleCargas.map(carga => {
                const manual = isManualCarga(carga);
                const { date, time } = formatCargaDate(carga.date);
                const editing = editingManualFields[carga.id] || {};

                return (
                    <div className="card" style={stateColor(carga.state)} key={carga.id}>
                        {/* HEADER */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div className="card-title" style={{ flex: 1, minWidth: 0 }}>
                                {manual && editing.name ? (
                                    <input
                                        autoFocus
                                        type="text"
                                        defaultValue={carga.name || ""}
                                        onFocus={e => e.target.select()}
                                        onBlur={async (e) => {
                                            const newName = e.target.value.trim();
                                            setEditingManualFields(prev => ({
                                                ...prev,
                                                [carga.id]: { ...(prev[carga.id] || {}), name: false },
                                            }));
                                            if (!newName || newName === (carga.name || "")) return;
                                            await updateManualCarga(carga.id, { name: newName });
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.currentTarget.blur();
                                            }
                                            if (e.key === "Escape") {
                                                e.preventDefault();
                                                setEditingManualFields(prev => ({
                                                    ...prev,
                                                    [carga.id]: { ...(prev[carga.id] || {}), name: false },
                                                }));
                                            }
                                        }}
                                        style={{
                                            width: "100%",
                                            fontSize: 14,
                                            padding: "2px 4px",
                                            borderRadius: 4,
                                            border: "1px solid #ccc",
                                        }}
                                    />
                                ) : (
                                    <span
                                        title={manual ? "Doble click para renombrar" : undefined}
                                        onDoubleClick={() => {
                                            if (!manual) return;
                                            setEditingManualFields(prev => ({
                                                ...prev,
                                                [carga.id]: { ...(prev[carga.id] || {}), name: true },
                                            }));
                                        }}
                                        style={{
                                            cursor: manual ? "pointer" : "default",
                                            display: "inline-block",
                                            maxWidth: "100%",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                        }}
                                    >
                                        {carga.name}
                                    </span>
                                )}
                            </div>

                            {manual ? (
                                editing.date ? (
                                    <input
                                        autoFocus
                                        type="date"
                                        defaultValue={(carga.date || "").split(" ")[0] || ""}
                                        onFocus={e => e.target.select()}
                                        onBlur={async (e) => {
                                            const value = e.target.value;
                                            setEditingManualFields(prev => ({
                                                ...prev,
                                                [carga.id]: { ...(prev[carga.id] || {}), date: false },
                                            }));
                                            if (!value) return;
                                            await updateManualCarga(carga.id, { date: `${value} 00:00:00` });
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.currentTarget.blur();
                                            }
                                            if (e.key === "Escape") {
                                                e.preventDefault();
                                                setEditingManualFields(prev => ({
                                                    ...prev,
                                                    [carga.id]: { ...(prev[carga.id] || {}), date: false },
                                                }));
                                            }
                                        }}
                                        style={{ fontSize: 12, width: 130 }}
                                    />
                                ) : (
                                    <div
                                        style={{ textAlign: "right", fontSize: "13px", color: "#6b7280", cursor: "pointer" }}
                                        onDoubleClick={() => {
                                            setEditingManualFields(prev => ({
                                                ...prev,
                                                [carga.id]: { ...(prev[carga.id] || {}), date: true },
                                            }));
                                        }}
                                    >
                                        {date}<br />
                                        {time}
                                    </div>
                                )
                            ) : (
                                <div style={{ textAlign: "right", fontSize: "13px", color: "#6b7280" }}>
                                    {date}<br />
                                    {time}
                                </div>
                            )}
                        </div>

                        {/* Cliente / contacto */}
                        {(manual || carga.partner || carga.vendor_id || carga.vendor_name) && (
                            <div
                                className="chip"
                                style={{ marginTop: "8px", cursor: "pointer" }}
                                onClick={() => {
                                    const hasLocation = !!(carga.partner || carga.vendor_id || carga.vendor_name);

                                    // Para cargas manuales sin ubicación aún, abrimos el modal
                                    // de selección de contacto.
                                    if (manual && !hasLocation) {
                                        setContactModalTarget({ id: carga.id, title: carga.name });
                                        return;
                                    }

                                    // En todos los demás casos, sólo enfocamos el marcador
                                    // de la carga (agrupado por partner) usando focus-client.
                                    const partnerId =
                                        carga.partner?.id ??
                                        (Array.isArray(carga.vendor_id)
                                            ? carga.vendor_id[0]
                                            : carga.vendor_id);

                                    if (partnerId) {
                                        window.dispatchEvent(
                                            new CustomEvent("focus-client", {
                                                detail: Number(partnerId),
                                            })
                                        );
                                    }
                                }}
                            >
                                {manual
                                    ? (carga.vendor_name || carga.partner?.name || "Seleccione ubicación")
                                    : (carga.vendor_name || carga.partner?.name)
                                }
                            </div>
                        )}

                        {/* Info */}
                        <div className="text-small" style={{ marginTop: "10px" }}>
                            Cantidad: {" "}
                            {manual && editing.qty ? (
                                <input
                                    autoFocus
                                    type="number"
                                    min={0}
                                    defaultValue={carga.total_quantity ?? 0}
                                    onFocus={e => e.target.select()}
                                    onBlur={async (e) => {
                                        const value = e.target.value;
                                        setEditingManualFields(prev => ({
                                            ...prev,
                                            [carga.id]: { ...(prev[carga.id] || {}), qty: false },
                                        }));
                                        if (value === "") return;
                                        const num = Number(value);
                                        if (Number.isNaN(num) || num < 0) return;
                                        await updateManualCarga(carga.id, { total_quantity: num });
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.currentTarget.blur();
                                        }
                                        if (e.key === "Escape") {
                                            e.preventDefault();
                                            setEditingManualFields(prev => ({
                                                ...prev,
                                                [carga.id]: { ...(prev[carga.id] || {}), qty: false },
                                            }));
                                        }
                                    }}
                                    style={{ width: 80, padding: 2 }}
                                />
                            ) : (
                                <span
                                    style={{ fontWeight: 600, cursor: manual ? "pointer" : "default" }}
                                    onDoubleClick={() => {
                                        if (!manual) return;
                                        setEditingManualFields(prev => ({
                                            ...prev,
                                            [carga.id]: { ...(prev[carga.id] || {}), qty: true },
                                        }));
                                    }}
                                >
                                    {carga.total_quantity} kg
                                </span>
                            )}
                            {" "}— Pallets:{" "}
                            {manual && editing.pallets ? (
                                <input
                                    autoFocus
                                    type="number"
                                    min={0}
                                    defaultValue={carga.total_pallets ?? 0}
                                    onFocus={e => e.target.select()}
                                    onBlur={async (e) => {
                                        const value = e.target.value;
                                        setEditingManualFields(prev => ({
                                            ...prev,
                                            [carga.id]: { ...(prev[carga.id] || {}), pallets: false },
                                        }));
                                        if (value === "") return;
                                        const num = Number(value);
                                        if (Number.isNaN(num) || num < 0) return;
                                        await updateManualCarga(carga.id, { total_pallets: num });
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.currentTarget.blur();
                                        }
                                        if (e.key === "Escape") {
                                            e.preventDefault();
                                            setEditingManualFields(prev => ({
                                                ...prev,
                                                [carga.id]: { ...(prev[carga.id] || {}), pallets: false },
                                            }));
                                        }
                                    }}
                                    style={{ width: 70, padding: 2, marginLeft: 4 }}
                                />
                            ) : (
                                <span
                                    style={{ marginLeft: 4, fontWeight: 600, cursor: manual ? "pointer" : "default" }}
                                    onDoubleClick={() => {
                                        if (!manual) return;
                                        setEditingManualFields(prev => ({
                                            ...prev,
                                            [carga.id]: { ...(prev[carga.id] || {}), pallets: true },
                                        }));
                                    }}
                                >
                                    {carga.total_pallets}
                                </span>
                            )}
                            {inlineStatus[carga.id] && (
                                <span
                                    style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: "50%",
                                        marginLeft: 6,
                                        display: "inline-block",
                                        background:
                                            inlineStatus[carga.id] === 'success'
                                                ? "#22c55e"
                                                : inlineStatus[carga.id] === 'error'
                                                    ? "#ef4444"
                                                    : "#9ca3af",
                                    }}
                                />
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

            {contactModalTarget && (
                <ContactSelectModal
                    title={"Seleccionar ubicación"}
                    contacts={contactos}
                    loading={loadingContactos}
                    onClose={() => setContactModalTarget(null)}
                    onSelect={async (contact) => {
                        await updateManualCarga(contactModalTarget.id, {
                            vendor_id: contact.id,
                            vendor_name: contact.display_name || contact.name,
                        });
                        setContactModalTarget(null);
                    }}
                />
            )}
        </>
    );
}
