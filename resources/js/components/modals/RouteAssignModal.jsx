import { useEffect, useState, useRef } from "react";
import Sortable from "sortablejs";
import "../../../css/RouteAssignModal.css";

export default function RouteAssignModal({ ruta, onClose }) {
    const routeId = ruta?.id;
    const [routeDetails, setRouteDetails] = useState(ruta);

    // Datos externos
    const [cargasDraft, setCargasDraft] = useState([]);
    const [partners, setPartners] = useState([]);

    // Estados de selección y orden
    const [selected, setSelected] = useState(new Set());
    const [ordered, setOrdered] = useState([]);
    const [fakeSet, setFakeSet] = useState(new Set()); // cargas marcadas como "falso"

    // Referencias
    const sortableRef = useRef(null);
    const recalcTimeoutRef = useRef(null);

    // Inicializar vehículo (no usado para preview pero lo dejo)
    const [vehicleId, setVehicleId] = useState(
        ruta.vehicle_id ? (Array.isArray(ruta.vehicle_id) ? ruta.vehicle_id[0] : ruta.vehicle_id) : null
    );

    // Estados de formulario
    const [originId, setOriginId] = useState(null);
    const [destinationId, setDestinationId] = useState(null);
    const [sameAsOrigin, setSameAsOrigin] = useState(true);

    // Cálculos
    const COSTO_POR_KM = 1000;
    const [distanceKm, setDistanceKm] = useState(ruta.total_distance_km ?? 0); // billing distance used for cost
    const [totalKg, setTotalKg] = useState(0);
    const [costoTotal, setCostoTotal] = useState(0);
    const [costoPorKg, setCostoPorKg] = useState(0);

    // -------------------------------------------------------------
    // 1. CARGA INICIAL Y ORDENAMIENTO POR WAYPOINTS
    // -------------------------------------------------------------
    useEffect(() => {
        // A. Cargar recursos globales
        fetch(`/api/cargas?state=draft`).then(r => r.json()).then(setCargasDraft);
        fetch(`/api/contactos`).then(r => r.json()).then(setPartners);

        // B. Cargar la RUTA COMPLETA
        if (routeId) {
            fetch(`/api/rutas/${routeId}`)
                .then(r => r.json())
                .then(fullRoute => {
                    setRouteDetails(fullRoute);
                    if (fullRoute.vehicle_id) {
                        const vId = Array.isArray(fullRoute.vehicle_id) ? fullRoute.vehicle_id[0] : fullRoute.vehicle_id;
                        setVehicleId(vId);
                    }

                    const assignedUnsorted = Array.isArray(fullRoute.loads) ? fullRoute.loads : [];

                    let waypoints = fullRoute.waypoints;
                    if (typeof waypoints === 'string') {
                        try { waypoints = JSON.parse(waypoints); } catch { waypoints = []; }
                    }
                    if (!Array.isArray(waypoints)) waypoints = [];

                    const sortedLoads = [];
                    const loadMap = new Map(assignedUnsorted.map(c => [c.id, c]));

                    waypoints.forEach(wp => {
                        if (issetLoadId(wp) && loadMap.has(intVal(wp.load_id))) {
                            sortedLoads.push(loadMap.get(intVal(wp.load_id)));
                            loadMap.delete(intVal(wp.load_id));
                        }
                    });

                    loadMap.forEach(load => sortedLoads.push(load));

                    setOrdered(sortedLoads);
                    setSelected(new Set(sortedLoads.map(c => c.id)));
                })
                .catch(err => console.error("Error cargando detalles de ruta:", err));
        }

        function issetLoadId(wp) {
            return wp && (wp.load_id !== undefined && wp.load_id !== null);
        }
        function intVal(v) {
            return typeof v === 'string' ? parseInt(v, 10) : v;
        }

    }, [routeId]);

    // -------------------------------------------------------------
    // CÁLCULOS LOCALES (usa billing distance `distanceKm`)
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
    // COMBINAR CARGAS: ordered + draft (similar)
    // -------------------------------------------------------------
    const allLoads = [
        ...(ordered),
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
    // ORQUESTADOR DEL RECALCULO (debounced)
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

        // 1. Obtener ORIGEN
        const origin = partners.find(p => p.id === originId);
        if (!origin) return;

        // 2. Obtener DESTINO
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
    // GUARDAR (assign): mantiene comportamiento previo, no modifica fakeSet en backend por ahora
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

    useEffect(() => {
        if (!routeDetails) return;
        if (!Array.isArray(partners) || partners.length === 0) return;
        if (!routeDetails.waypoints) return;
        let wps = routeDetails.waypoints;
        if (typeof wps === 'string') {
            try { wps = JSON.parse(wps); } catch { wps = []; }
        }
        if (!Array.isArray(wps) || wps.length === 0) return;

        const originWp = wps.find(w => w && w.type === 'origin');
        const destWp = [...wps].reverse().find(w => w && w.type === 'destination');

        if (originWp && originWp.partner_id && originId == null) {
            setOriginId(originWp.partner_id);
        }

        if (destWp && destWp.partner_id) {
            if (originWp && originWp.partner_id === destWp.partner_id) {
                setSameAsOrigin(true);
                if (destinationId !== null) setDestinationId(null);
                setDestinationId(destWp.partner_id);
                setSameAsOrigin(false);
            }
        }
    }, [routeDetails, partners, originId, destinationId]);

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
                        <select className="input" value={originId || ""} onChange={e => setOriginId(Number(e.target.value))}>
                            <option value="">-- Seleccione Origen --</option>
                            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>

                     {/* Cargas */}
                    <div className="section">
                        <label className="section-label">Cargas disponibles</label>
                        <div className="cargas-list">
                            {allLoads.map(c => (
                                <div key={c.id}
                                     className={`carga-item ${selected.has(c.id) ? 'selected' : ''}`}
                                     onClick={() => toggle(c.id)}
                                >
                                    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                                        <div style={{flex: 1}}>
                                            <div className="carga-title">{c.name}</div>
                                            <div className="carga-sub">{c.vendor_name}</div>
                                        </div>

                                        <input
                                            type="checkbox"
                                            checked={selected.has(c.id)}
                                            onChange={() => toggle(c.id)}
                                            style={{marginLeft: 8}}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                     {/* Destino */}
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

                {/* CENTRO */}
                <div className="order-panel">
                     <label className="section-label">Orden de las cargas (Arrastrar)</label>
                    <div ref={sortableRef} className="order-list">
                        {ordered.map(c => (
                            <div key={c.id} className="order-item">
                                <span className="drag-handle">☰</span>
                                <div style={{display: 'flex', alignItems:'center', justifyContent:'space-between', width: '100%'}}>
                                    <div>
                                        <div className="carga-title">{c.name}</div>
                                        <div className="carga-sub">{c.vendor_name}</div>
                                    </div>
                                    <label style={{display:'flex', alignItems:'center', gap:6}}>
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
