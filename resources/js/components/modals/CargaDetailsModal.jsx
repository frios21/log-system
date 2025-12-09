import { useState } from "react";

export default function CargaDetailsModal({ carga, onClose }) {
    const [items, setItems] = useState(carga.lines || []);
    const [editingLineId, setEditingLineId] = useState(null);
    const [tempPallets, setTempPallets] = useState("");
    const [lineStatus, setLineStatus] = useState({}); // { lineId: 'success' | 'error' }

    const totalPallets = items.reduce((acc, i) => acc + (Number(i.n_pallets) || 0), 0);
    const subtotal = items.reduce((acc, i) => acc + i.price_subtotal, 0);
    const iva = subtotal * 0.19;
    const total = carga.total_cost;

    async function saveLinePallets(lineId) {
        const value = tempPallets.trim();
        const num = value === "" ? null : Number(value);

        if (value !== "" && (isNaN(num) || num < 0)) {
            setEditingLineId(null);
            return;
        }

        try {
            const res = await fetch(`/api/cargas/lineas/${lineId}/pallets`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ n_pallets: num }),
            });
            if (!res.ok) {
                throw new Error("Respuesta no OK");
            }

            // Actualizar en memoria la línea editada
            setItems(prev => prev.map(it =>
                it.id === lineId ? { ...it, n_pallets: num } : it
            ));

            setLineStatus(prev => ({ ...prev, [lineId]: "success" }));
        } catch (e) {
            console.error("No se pudo actualizar n_pallets de la línea", e);
            setLineStatus(prev => ({ ...prev, [lineId]: "error" }));
        } finally {
            setEditingLineId(null);
            setTimeout(() => {
                setLineStatus(prev => {
                    const copy = { ...prev };
                    delete copy[lineId];
                    return copy;
                });
            }, 2000);
        }
    }

    return (
        <div className="modal-backdrop">
            <div className="modal">

                <h2 style={{ marginTop: 0 }}>Detalles de la compra</h2>

                <table style={{ width: "100%", marginBottom: "20px" }}>
                    <thead>
                        <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                            <th style={{ textAlign: "left" }}>Producto</th>
                            <th>Cant</th>
                            <th>Pallets</th>
                            <th>Subtotal</th>
                        </tr>
                    </thead>

                    <tbody>
                        {items.map(item => (
                            <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                <td><strong>{item.product_name}</strong></td>
                                <td>{item.quantity} kg</td>
                                <td>
                                    {editingLineId === item.id ? (
                                        <input
                                            autoFocus
                                            value={tempPallets}
                                            onChange={e => setTempPallets(e.target.value)}
                                            onBlur={() => saveLinePallets(item.id)}
                                            onKeyDown={e => {
                                                if (e.key === "Enter") saveLinePallets(item.id);
                                                if (e.key === "Escape") setEditingLineId(null);
                                            }}
                                            style={{
                                                width: 60,
                                                fontSize: 12,
                                                padding: "0 4px",
                                            }}
                                        />
                                    ) : (
                                        <span
                                            onDoubleClick={() => {
                                                setEditingLineId(item.id);
                                                setTempPallets(
                                                    item.n_pallets != null
                                                        ? String(item.n_pallets)
                                                        : ""
                                                );
                                            }}
                                            style={{
                                                cursor: "pointer",
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 6,
                                            }}
                                        >
                                            <strong>{item.n_pallets}</strong>
                                            {lineStatus[item.id] === "success" && (
                                                <span
                                                    style={{
                                                        width: 8,
                                                        height: 8,
                                                        borderRadius: "50%",
                                                        background: "#22c55e",
                                                    }}
                                                />
                                            )}
                                            {lineStatus[item.id] === "error" && (
                                                <span
                                                    style={{
                                                        width: 8,
                                                        height: 8,
                                                        borderRadius: "50%",
                                                        background: "#ef4444",
                                                    }}
                                                />
                                            )}
                                        </span>
                                    )}
                                </td>
                                <td>${item.price_subtotal.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div>
                    <strong>Total pallets:</strong> {totalPallets} <br />
                    <strong>Subtotal:</strong> ${subtotal.toLocaleString()} <br />
                    <strong>IVA (19%):</strong> ${iva.toLocaleString()} <br /><br />
                    <strong style={{ fontSize: "18px" }}>
                        Total compra: ${total.toLocaleString()}
                    </strong>
                </div>

                <div style={{ textAlign: "right", marginTop: "20px" }}>
                    <button className="btn btn-outlined" onClick={onClose}>
                        Cerrar
                    </button>
                </div>

            </div>
        </div>
    );
}
