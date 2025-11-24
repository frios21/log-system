import { useEffect, useState } from "react";
import CargaDetailsModal from "../modals/CargaDetailsModal";

export default function CargasList() {
    const [cargas, setCargas] = useState([]);
    const [selectedCarga, setSelectedCarga] = useState(null);

    useEffect(() => {
        fetch("/api/cargas")
            .then(r => r.json())
            .then(setCargas);
    }, []);

    function stateColor(state) {
        switch (state) {
            case "draft":
                return { 
                    background: "#ffebee",   // rojo pastel
                    borderLeft: "5px solid #d32f2f"
                };
            case "assigned":
                return { 
                    background: "#fff8e1",   // amarillo pastel
                    borderLeft: "5px solid #f9a825"
                };
            case "done":
                return { 
                    background: "#e8f5e9",   // verde pastel
                    borderLeft: "5px solid #2e7d32"
                };
            default:
                return {};
        }
    }

    return (
        <>
            {cargas.map(carga => (
                <div className="card" style={stateColor(carga.state)} key={carga.id}>

                    {/* HEADER */}
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div className="card-title">{carga.name}</div>

                        <div style={{ textAlign: "right", fontSize: "13px", color: "#6b7280" }}>
                            {carga.date?.split(" ")[0]}<br />
                            {carga.date?.split(" ")[1]}
                        </div>
                    </div>

                    {/* Cliente */}
                    {(carga.partner || carga.vendor_id) && (
                        <div
                            className="chip"
                            style={{ marginTop: "8px" }}
                            onClick={() => {
                                // obtener siempre el id numérico del partner
                                const partnerId = carga.partner?.id
                                    ?? (Array.isArray(carga.vendor_id) ? carga.vendor_id[0] : carga.vendor_id);
                                window.dispatchEvent(new CustomEvent("focus-client", { detail: partnerId }));
                            }}
                        >
                            {carga.vendor_name || carga.partner?.name}
                        </div>
                    )}


                    {/* Info */}
                    <div className="text-small" style={{ marginTop: "10px" }}>
                        Cantidad: <strong>{carga.total_quantity} kg</strong> — 
                        Pallets: <strong>{carga.total_pallets}</strong>
                    </div>

                    {/* BOTONES */}
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
            ))}

            {/* MODAL */}
            {selectedCarga && (
                <CargaDetailsModal carga={selectedCarga} onClose={() => setSelectedCarga(null)} />
            )}
        </>
    );
}
