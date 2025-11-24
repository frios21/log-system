import { useEffect, useState, useRef } from "react";
import Sortable from "sortablejs";
import "../../../css/RouteAssignModal.css";

export default function RouteAssignModal({ ruta, onClose }) {
    const [cargasDraft, setCargasDraft] = useState([]);
    const [partners, setPartners] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [ordered, setOrdered] = useState([]);
    const sortableRef = useRef(null);

    const [routeDetails, setRouteDetails] = useState(ruta);
    const routeId = ruta.id;

    const [vehicleId, setVehicleId] = useState(
        ruta.vehicle_id ? (Array.isArray(ruta.vehicle_id) ? ruta.vehicle_id[0] : ruta.vehicle_id) : null
    );
    const [originId, setOriginId] = useState(null);
    const [destinationId, setDestinationId] = useState(null);
    const [sameAsOrigin, setSameAsOrigin] = useState(true);

    const COSTO_POR_KM = 1000;

    const [distanceKm, setDistanceKm] = useState(ruta.total_distance_km ?? 0);
    const [totalKg, setTotalKg] = useState(0);
    const [costoTotal, setCostoTotal] = useState(0);
    const [costoPorKg, setCostoPorKg] = useState(0);

    function safeArray(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        try { return JSON.parse(value); } catch {}
        return [];
    }

    // -------------------------------------------------------------
    // recalc cuando cambiar orden
    // -------------------------------------------------------------
    useEffect(() => {
        let kg = 0;

        ordered.forEach((c) => {
            kg += Number(c.total_quantity || 0);
        });

        setTotalKg(kg);

        const costo = distanceKm * COSTO_POR_KM;
        setCostoTotal(costo);

        setCostoPorKg(kg > 0 ? costo / kg : 0);
    }, [ordered, distanceKm]);

    // -------------------------------------------------------------
    // listener de mapview
    // -------------------------------------------------------------
    useEffect(() => {
        function onUpdate(ev) {
            if (ev.detail.routeId !== routeId) return;
            setDistanceKm(ev.detail.distanceKm);
        }

        window.addEventListener("route-distance-updated", onUpdate);
        return () => window.removeEventListener("route-distance-updated", onUpdate);
    }, [routeId]);

    // -------------------------------------------------------------
    // cargar cargas draft y partners
    // -------------------------------------------------------------
    useEffect(() => {
        fetch(`/api/cargas?state=draft`).then(r => r.json()).then(setCargasDraft);
        fetch(`/api/contactos`).then(r => r.json()).then(setPartners);
    }, []);

    // -------------------------------------------------------------
    // obtener detalles completos de la ruta
    // -------------------------------------------------------------
    useEffect(() => {
        if (!routeId) return;
        fetch(`/api/rutas/${routeId}`)
            .then(r => r.json())
            .then(data => {
                let w = data.waypoints;
                if (typeof w === "string") {
                    try { w = JSON.parse(w); } catch { w = []; }
                }
                data.waypoints = Array.isArray(w) ? w : [];
                setRouteDetails(data);
            });
    }, [routeId]);

    // -------------------------------------------------------------
    // inicializar selección y orden
    // -------------------------------------------------------------
    useEffect(() => {
        if (!routeDetails) return;

        let w = routeDetails.waypoints;

        if (typeof w === "string") {
            try { 
                w = JSON.parse(w); 
            } catch { 
                w = []; 
            }
        } else if (w && typeof w === "object" && !Array.isArray(w)) {
            w = Object.values(w);
        }

        if (!Array.isArray(w)) w = [];

        const ids = w
            .map(wp => wp && (wp.load_id ?? wp.loadId))
            .filter(v => v != null);

        setSelected(new Set(ids));

        const loads = Array.isArray(routeDetails.loads) ? routeDetails.loads : [];

        const orderedLoads = ids.length
            ? ids.map(id => loads.find(l => l.id === id)).filter(Boolean)
            : loads;

        setOrdered(orderedLoads);
    }, [routeDetails]);

    // -------------------------------------------------------------
    // lista total: cargas existentes + draft
    // -------------------------------------------------------------
    const allLoads = [
        ...(Array.isArray(routeDetails?.loads) ? routeDetails.loads : []),
        ...cargasDraft.filter(d => !(routeDetails?.load_ids || []).includes(d.id))
    ];

    // -------------------------------------------------------------
    // seleccionar / deseleccionar cargas
    // -------------------------------------------------------------
    function toggle(id) {
        const newSelected = new Set(selected);
        newSelected.has(id) ? newSelected.delete(id) : newSelected.add(id);
        setSelected(newSelected);

        const filtered = allLoads.filter(c => newSelected.has(c.id));
        setOrdered(filtered);
    }

    // -------------------------------------------------------------
    // drag & drop
    // -------------------------------------------------------------
    useEffect(() => {
        if (!sortableRef.current) return;
        const instance = Sortable.create(sortableRef.current, {
            animation: 150,
            handle: ".drag-handle",
            onEnd(evt) {
                setOrdered(prev => {
                    const newOrder = [...prev];
                    const [moved] = newOrder.splice(evt.oldIndex, 1);
                    newOrder.splice(evt.newIndex, 0, moved);
                    return newOrder;
                });
            },
        });
        return () => instance.destroy();
    }, [ordered]);

    // ------------------------------------
    // disparar recalc al cambiar orden
    // ------------------------------------

    useEffect(() => {
        if (!ordered.length) return;

        // enviar sólo los IDs
        const newOrder = ordered.map(c => c.id);

        window.dispatchEvent(
            new CustomEvent("recalc-route-graphhopper", {
                detail: { routeId, newOrder }
            })
        );
    }, [ordered]);

    // -------------------------------------------------------------
    // guardar datos
    // -------------------------------------------------------------
    async function save() {
        const loadIds = ordered.map(c => c.id);
        let dest = destinationId;
        if (sameAsOrigin) dest = originId;
        const payload = {
            load_ids: loadIds,
            vehicle_id: vehicleId,
            origin_id: originId,
            destination_id: dest
        };

        await fetch(`/api/rutas/${routeId}/assign`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        onClose();
    }

    return (
        <div className="modal-backdrop">
            <div className="route-modal">

                {/* -------------------- IZQUIERDA -------------------- */}
                <div className="left-panel">
                    <h3 className="modal-title">
                        Asignar cargas a <strong>{routeDetails?.name}</strong>
                    </h3>

                    {/* ORIGEN */}
                    <div className="section">
                        <label className="section-label">Origen de la ruta</label>
                        <select className="input" value={originId || ""} onChange={e => setOriginId(Number(e.target.value))}>
                            <option value="">-- Seleccione Origen --</option>
                            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>

                    {/* CARGAS */}
                    <div className="section">
                        <label className="section-label">Cargas disponibles</label>
                        <div className="cargas-list">
                            {allLoads.map(c => (
                                <div key={c.id} className={`carga-item ${selected.has(c.id) ? 'selected' : ''}`} onClick={() => toggle(c.id)}>
                                    <div>
                                        <div className="carga-title">{c.name}</div>
                                        <div className="carga-sub">{c.vendor_name}</div>
                                    </div>
                                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* DESTINO */}
                    <div className="section">
                        <label className="section-label">Destino de la ruta</label>
                        <div className="same-origin">
                            <input type="checkbox" checked={sameAsOrigin} onChange={e => setSameAsOrigin(e.target.checked)} />
                            <span>Mismo que origen</span>
                        </div>
                        <select
                            className="input"
                            value={sameAsOrigin ? originId || "" : destinationId || ""}
                            disabled={sameAsOrigin}
                            onChange={e => setDestinationId(Number(e.target.value))}
                        >
                            <option value="">-- Seleccione Destino --</option>
                            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>

                    <div className="buttons">
                        <button className="btn btn-outlined" onClick={onClose}>Cancelar</button>
                        <button className="btn btn-primary" onClick={save}>Guardar</button>
                    </div>
                </div>

                {/* -------------------- CENTRO: ORDEN -------------------- */}
                <div className="order-panel">
                    <label className="section-label">Orden de las cargas</label>
                    <div ref={sortableRef} className="order-list">
                        {ordered.map(c => (
                            <div key={c.id} className="order-item">
                                <span className="drag-handle">☰</span>
                                <div>
                                    <div className="carga-title">{c.name}</div>
                                    <div className="carga-sub">{c.vendor_name}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* -------------------- DERECHA: CÁLCULOS EN TIEMPO REAL -------------------- */}
                <div className="calc-panel">
                    <h4 className="calc-title">Cálculo estimado</h4>

                    <div className="calc-row">
                        <span>Distancia total:</span>
                        <strong>{distanceKm.toFixed(2)} km</strong>
                    </div>

                    <div className="calc-row">
                        <span>Total kg:</span>
                        <strong>{totalKg} kg</strong>
                    </div>

                    <div className="calc-row">
                        <span>Costo por km:</span>
                        <strong>${COSTO_POR_KM.toLocaleString()}</strong>
                    </div>

                    <div className="calc-divider"></div>

                    <div className="calc-row total">
                        <span>Costo total:</span>
                        <strong>${costoTotal.toLocaleString()}</strong>
                    </div>

                    <div className="calc-row">
                        <span>Costo por kg:</span>
                        <strong>
                            ${Math.round(costoPorKg).toLocaleString()}
                        </strong>
                    </div>
                </div>
            </div>
        </div>
    );
}
