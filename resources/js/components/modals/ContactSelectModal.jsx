import { useState, useMemo, useEffect } from "react";

export default function ContactSelectModal({
    onClose = () => {},
    onSelect,
    contacts = [],
    loading = false,
    title = "Seleccionar ubicación",
}) {
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
        const s = search.trim().toLowerCase();
        if (!s) return contacts;
        return contacts.filter((c) => {
            const display = (c.display_name || c.name || "").toLowerCase();
            return (
                (display && display.includes(s)) ||
                (c.street && c.street.toLowerCase().includes(s)) ||
                (c.city && c.city.toLowerCase().includes(s)) ||
                (c.id && String(c.id).includes(s))
            );
        });
    }, [contacts, search]);

    // Cerrar con ESC
    useEffect(() => {
        function handleKeyDown(e) {
            if (e.key === "Escape") {
                onClose && onClose();
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    return (
        <div className="modal-backdrop">
            <div className="modal">
                <h2 style={{ marginTop: 0 }}>{title}</h2>

                <input
                    type="text"
                    className="input"
                    placeholder="Buscar contacto..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", marginBottom: 8 }}
                />

                {loading ? (
                    <div style={{ fontSize: 13 }}>Cargando contactos...</div>
                ) : filtered.length === 0 ? (
                    <div style={{ fontSize: 13 }}>Sin resultados</div>
                ) : (
                    <div
                        style={{
                            maxHeight: 320,
                            overflowY: "auto",
                            border: "1px solid #e5e7eb",
                            borderRadius: 8,
                            padding: 6,
                            background: "#f9fafb",
                        }}
                    >
                        {filtered.map((c) => (
                            <div
                                key={c.id}
                                style={{
                                    padding: "4px 6px",
                                    borderRadius: 4,
                                    cursor: "pointer",
                                    marginBottom: 2,
                                    background: "white",
                                }}
                                onClick={() => onSelect && onSelect(c)}
                            >
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.display_name || c.name}</div>
                                {(c.street || c.city) && (
                                    <div style={{ fontSize: 11, color: "#6b7280" }}>
                                        {c.street} {c.city}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ textAlign: "right", marginTop: 16 }}>
                    <button className="btn btn-outlined" onClick={onClose}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
