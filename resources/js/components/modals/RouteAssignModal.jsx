import { useEffect, useState, useRef } from "react";
import Sortable from "sortablejs";
import "../../../css/RouteAssignModal.css";

function normalize(s = "") {
    return s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function issetLoadId(wp) {
    return wp && (wp.load_id !== undefined && wp.load_id !== null);
}

function intVal(v) {
    return typeof v === "string" ? parseInt(v, 10) : v;
}

export default function RouteAssignModal({ ruta, onClose }) {
    const routeId = ruta?.id;
    const [routeDetails, setRouteDetails] = useState(ruta);

    const [cargasDraft, setCargasDraft] = useState([]);
    const [partners, setPartners] = useState([]);

    const [selected, setSelected] = useState(new Set());
    const [ordered, setOrdered] = useState([]);
    const [fakeSet, setFakeSet] = useState(new Set()); // cargas marcadas como "falso"

    const sortableRef = useRef(null);
    const recalcTimeoutRef = useRef(null);

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

    const [originQuery, setOriginQuery] = useState("");
    const [destQuery, setDestQuery] = useState("");
    const [isOriginOpen, setIsOriginOpen] = useState(false);
    const [isDestOpen, setIsDestOpen] = useState(false);

    // para no volver a pisar origen/destino después de inicializarlos
    const initializedFromRouteRef = useRef(false);

    const filteredOrigins = Array.isArray(partners)
        ? partners.filter(p => !originQuery || normalize(p.name).includes(normalize(originQuery)))
        : [];

    const filteredDestinations = Array.isArray(partners)
        ? partners.filter(p => !destQuery || normalize(p.name).includes(normalize(destQuery)))
        : [];

    useEffect(() => {
        if (originId && Array.isArray(partners)) {
            const p = partners.find(pt => pt.id === originId);
            if (p) setOriginQuery(p.name);
        }
    }, [originId, partners]);

    useEffect(() => {
        if (destinationId && Array.isArray(partners)) {
            const p = partners.find(pt => pt.id === destinationId);
            if (p) setDestQuery(p.name);
        }
    }, [destinationId, partners]);

    useEffect(() => { if (originId) setIsOriginOpen(false); }, [originId]);
    useEffect(() => { if (destinationId) setIsDestOpen(false); }, [destinationId]);
    useEffect(() => { if (sameAsOrigin) setIsDestOpen(false); }, [sameAsOrigin]);

    // -------------------------------------------------------------
    // CARGA INICIAL Y ORDENAMIENTO POR WAYPOINTS
    // -------------------------------------------------------------
    useEffect(() => {
        fetch(`/api/cargas?state=draft`).then(r => r.json()).then(setCargasDraft);
        fetch(`/api/contactos`).then(r => r.json()).then(setPartners);

        if (!routeId) return;

        (async () => {
            try {
                const fullRoute = await fetch(`/api/rutas/${routeId}`).then(r => r.json());
                setRouteDetails(fullRoute);

                if (fullRoute.vehicle_id) {
                    const vId = Array.isArray(fullRoute.vehicle_id)
                        ? fullRoute.vehicle_id[0]
                        : fullRoute.vehicle_id;
                    setVehicleId(vId);
                }

                // ids de cargas asignadas a la ruta
                const loadIdsFromRoute = Array.isArray(fullRoute.load_ids) ? fullRoute.load_ids : [];

                let assignedUnsorted = [];

                if (loadIdsFromRoute.length > 0) {
                    const promises = loadIdsFromRoute.map(id =>
                        fetch(`/api/cargas/${id}`)
                            .then(r => r.json())
                            .catch(() => null)
                    );
                    const results = await Promise.all(promises);
                    assignedUnsorted = results.filter(Boolean);
                }

                // ordenar según waypoints -> agregar el resto
                let waypoints = fullRoute.waypoints;
                if (typeof waypoints === "string") {
                    try { waypoints = JSON.parse(waypoints); } catch { waypoints = []; }
                }
                if (!Array.isArray(waypoints)) waypoints = [];

                const loadMap = new Map(assignedUnsorted.map(c => [c.id, c]));
                const sortedLoads = [];

                // primero: en el orden de los waypoints
                waypoints.forEach(wp => {
                    if (issetLoadId(wp) && loadMap.has(intVal(wp.load_id))) {
                        sortedLoads.push(loadMap.get(intVal(wp.load_id)));
                        loadMap.delete(intVal(wp.load_id));
                    }
                });

                // luego: cualquiera que haya quedado sin ordenar
                loadMap.forEach(load => sortedLoads.push(load));

                setOrdered(sortedLoads);
                setSelected(new Set(sortedLoads.map(c => c.id)));
            } catch (err) {
                console.error("Error cargando detalles de ruta:", err);
            }
        })();
    }, [routeId]);

    // -------------------------------------------------------------
    // CÁLCULOS LOCALES
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
    // COMBINAR CARGAS: ordered + draft
    // -------------------------------------------------------------
    const allLoads = [
        ...ordered,
        ...cargasDraft.filter(d => !selected.has(d.id))
    ];

    function toggle(id) {
        const newSelected = new Set(selected);
        const isSelecting = !newSelected.has(id);

        if (isSelecting) {
            newSelected.add(id);
            let itemToAdd = cargasDraft.find(c => c.id === id);

            if (!itemToAdd && routeDetails?.loads) {
                itemToAdd = routeDetails.loads.find(c => c.id === id);
            }

            if (itemToAdd) {
                setOrdered([...ordered, itemToAdd]);
            }
        } else {
            newSelected.delete(id);
            setOrdered(ordered.filter(o => o.id !== id));
            if (fakeSet.has(id)) {
                const m = new Set(fakeSet);
                m.delete(id);
                setFakeSet(m);
            }
        }

        setSelected(newSelected);
    }

    function toggleFake(id, e) {
        e && e.stopPropagation && e.stopPropagation();
        const newFake = new Set(fakeSet);
        if (newFake.has(id)) newFake.delete(id);
        else newFake.add(id);
        setFakeSet(newFake);

        triggerPreviewDebounced();
    }

    // -------------------------------------------------------------
    // ORQUESTADOR DEL RECÁLCULO (debounced)
    // -------------------------------------------------------------
    useEffect(() => {
        triggerPreviewDebounced();
    }, [ordered, originId, destinationId, sameAsOrigin, fakeSet]);

    function triggerPreviewDebounced() {
        if (recalcTimeoutRef.current) clearTimeout(recalcTimeoutRef.current);
        recalcTimeoutRef.current = setTimeout(() => {
            performPreview();
        }, 300);
    }

    async function performPreview() {
        if (!routeId) return;

        // 1. Origen
        const origin = partners.find(p => p.id === originId);
        if (!origin) return;

        // 2. Destino
        let destId = sameAsOrigin ? originId : destinationId;
        const destination = partners.find(p => p.id === destId);
        if (!destination) return;

        // 3. IDs de cargas en el orden seleccionado
        const loadIds = ordered.map(c => c.id);

        try {
            const res = await fetch(`/api/rutas/${routeId}/preview`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    load_ids: loadIds,
                    origin_id: originId,
                    destination_id: destId,
                })
            });

            const data = await res.json();

            const billing = Number(data.total_distance_km ?? 0);
            setDistanceKm(billing);

            if (data.waypoints) {
                window.dispatchEvent(new CustomEvent("draw-preview-route", {
                    detail: { routeId, waypoints: data.waypoints }
                }));
            }

        } catch (err) {
            console.error("Error en preview:", err);
        }
    }

    // -------------------------------------------------------------
    // DRAG & DROP
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

    // -------------------------------------------------------------
    // GUARDAR
    // -------------------------------------------------------------
    async function save() {
        const loadIds = ordered.map(c => c.id);
        let dest = destinationId;
        if (sameAsOrigin) dest = originId;
        try {
            await fetch(`/api/rutas/${routeId}/assign`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    load_ids: loadIds,
                    vehicle_id: vehicleId,
                    origin_id: originId,
                    destination_id: dest,
                    total_cost: costoTotal
                }),
            });
            window.location.reload();
            onClose();
        } catch (e) {
            alert("Error al guardar");
        }
    }

    // -------------------------------------------------------------
    // Inicializar origen/destino desde la ruta SOLO UNA VEZ
    // -------------------------------------------------------------
    useEffect(() => {
        if (initializedFromRouteRef.current) return;
        if (!routeDetails) return;
        if (!Array.isArray(partners) || partners.length === 0) return;
        if (!routeDetails.waypoints) return;

        let wps = routeDetails.waypoints;
        if (typeof wps === "string") {
            try { wps = JSON.parse(wps); } catch { wps = []; }
        }
        if (!Array.isArray(wps) || wps.length === 0) return;

        const originWp = wps.find(w => w && w.type === "origin");
        const destWp = [...wps].reverse().find(w => w && w.type === "destination");

        if (originWp && originWp.partner_id) {
            setOriginId(originWp.partner_id);
        }

        if (destWp && destWp.partner_id) {
            if (originWp && originWp.partner_id === destWp.partner_id) {
                setSameAsOrigin(true);
                setDestinationId(null);
            } else {
                setSameAsOrigin(false);
                setDestinationId(destWp.partner_id);
            }
        }

        initializedFromRouteRef.current = true;
    }, [routeDetails, partners]);

    // -------------------------------------------------------------
    // Render
    // -------------------------------------------------------------
    return (
       <div className="modal-backdrop">
           <div className="route-modal">
                {/* IZQUIERDA */}
                <div className="left-panel">
                     <h3 className="modal-title">Asignar cargas a <strong>{routeDetails?.name}</strong></h3>

                    {/* Origen */}
                    <div className="section">
                        <label className="section-label">Origen de la ruta</label>
                        <div className="input" style={{ position: "relative", padding: 0 }}>
                            <input
                                className="input"
                                style={{ border: "none", width: "100%" }}
                                placeholder="Buscar por nombre"
                                value={originQuery}
                                onFocus={() => setIsOriginOpen(true)}
                                onChange={e => {
                                    const v = e.target.value;
                                    setOriginQuery(v);
                                    setOriginId(null);
                                    setIsOriginOpen(Boolean(v));
                                }}
                                onKeyDown={e => { if (e.key === "Escape") setIsOriginOpen(false); }}
                                onBlur={() => setTimeout(() => setIsOriginOpen(false), 150)}
                            />
                            {isOriginOpen && originQuery && (
                                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, maxHeight: 180, overflowY: "auto", background: "#fff", border: "1px solid #ddd", zIndex: 10 }}>
                                    {filteredOrigins.slice(0, 20).map(p => (
                                        <div
                                            key={p.id}
                                            style={{ padding: "8px 10px", cursor: "pointer" }}
                                            onMouseDown={(e) => { e.preventDefault(); setOriginId(p.id); setOriginQuery(p.name); setIsOriginOpen(false); }}
                                        >
                                            {p.name}
                                        </div>
                                    ))}
                                    {!filteredOrigins.length && (
                                        <div style={{ padding: "8px 10px", color: "#666" }}>Sin resultados</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                     {/* Cargas */}
                    <div className="section">
                        <label className="section-label">Cargas disponibles</label>
                        <div className="cargas-list">
                            {allLoads.map(c => {
                                let fechaLabel = "";
                                if (c.date) {
                                    const d = new Date(c.date);
                                    if (!isNaN(d.getTime())) {
                                        const dd = String(d.getDate()).padStart(2, "0");
                                        const mm = String(d.getMonth() + 1).padStart(2, "0");
                                        const yy = String(d.getFullYear()).slice(-2);
                                        fechaLabel = `${dd}/${mm}/${yy}`;
                                    }
                                }

                                return (
                                    <div key={c.id}
                                         className={`carga-item ${selected.has(c.id) ? "selected" : ""}`}
                                         onClick={() => toggle(c.id)}
                                    >
                                        <div style={{display: "flex", gap: "8px", alignItems: "center", width: "100%"}}>
                                            <div style={{flex: 1}}>
                                                {fechaLabel && (
                                                    <div style={{ fontSize: 11, color: "#666", marginBottom: 2 }}>
                                                        {fechaLabel}
                                                    </div>
                                                )}
                                                <div className="carga-title">{c.name}</div>
                                                <div className="carga-sub">{c.vendor_name}</div>
                                                <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                                                    Pallets: {c.total_pallets ?? "-"}
                                                </div>
                                            </div>

                                            <input
                                                type="checkbox"
                                                checked={selected.has(c.id)}
                                                onChange={() => toggle(c.id)}
                                                style={{marginLeft: 8}}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                     {/* Destino */}
                    <div className="section">
                         <label className="section-label">Destino de la ruta</label>
                         <div className="same-origin">
                            <input
                                type="checkbox"
                                checked={sameAsOrigin}
                                onChange={e => setSameAsOrigin(e.target.checked)}
                            />
                            <span>Mismo que origen</span>
                        </div>
                        <div className="input" style={{ position: "relative", padding: 0 }}>
                            <input
                                className="input"
                                style={{ border: "none", width: "100%" }}
                                placeholder="Buscar por nombre"
                                value={sameAsOrigin ? originQuery : destQuery}
                                disabled={sameAsOrigin}
                                onFocus={() => { if (!sameAsOrigin) setIsDestOpen(true); }}
                                onChange={e => {
                                    const v = e.target.value;
                                    setDestQuery(v);
                                    setDestinationId(null);
                                    if (!sameAsOrigin) setIsDestOpen(Boolean(v));
                                }}
                                onKeyDown={e => { if (e.key === "Escape") setIsDestOpen(false); }}
                                onBlur={() => setTimeout(() => setIsDestOpen(false), 150)}
                            />
                            {!sameAsOrigin && isDestOpen && destQuery && (
                                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, maxHeight: 180, overflowY: "auto", background: "#fff", border: "1px solid #ddd", zIndex: 10 }}>
                                    {filteredDestinations.slice(0, 20).map(p => (
                                        <div
                                            key={p.id}
                                            style={{ padding: "8px 10px", cursor: "pointer" }}
                                            onMouseDown={(e) => { e.preventDefault(); setDestinationId(p.id); setDestQuery(p.name); setIsDestOpen(false); }}
                                        >
                                            {p.name}
                                        </div>
                                    ))}
                                    {!filteredDestinations.length && (
                                        <div style={{ padding: "8px 10px", color: "#666" }}>Sin resultados</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="buttons">
                        <button className="btn btn-outlined" onClick={onClose}>Cancelar</button>
                        <button className="btn btn-primary" onClick={save}>Guardar</button>
                    </div>
                </div>

                {/* CENTRO */}
                <div className="order-panel">
                     <label className="section-label">Orden de las cargas (Arrastrar)</label>
                    <div ref={sortableRef} className="order-list">
                        {ordered.map(c => (
                            <div key={c.id} className="order-item">
                                <span className="drag-handle">☰</span>
                                <div style={{display: "flex", alignItems:"center", justifyContent:"space-between", width: "100%"}}>
                                    <div>
                                        <div className="carga-title">{c.name}</div>
                                        <div className="carga-sub">{c.vendor_name}</div>
                                    </div>
                                    <label style={{display:"flex", alignItems:"center", gap:6}}>
                                        <input
                                            type="checkbox"
                                            checked={fakeSet.has(c.id)}
                                            onChange={(e) => toggleFake(c.id, e)}
                                        />
                                        <small>F</small>
                                    </label>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* DERECHA (cálculos) */}
                 <div className="calc-panel">
                    <h4 className="calc-title">Cálculo estimado</h4>
                    <div className="calc-row">
                        <span>Distancia total (facturable):</span>
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
                        <strong>${Math.round(costoPorKg).toLocaleString()}</strong>
                    </div>
                </div>
           </div>
       </div>
    );
}
