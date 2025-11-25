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
    
    // Referencias
    const sortableRef = useRef(null);
    const recalcTimeoutRef = useRef(null); 

    // Inicializar vehículo
    const [vehicleId, setVehicleId] = useState(
        ruta.vehicle_id ? (Array.isArray(ruta.vehicle_id) ? ruta.vehicle_id[0] : ruta.vehicle_id) : null
    );

    // Estados de formulario
    const [originId, setOriginId] = useState(null);
    const [destinationId, setDestinationId] = useState(null);
    const [sameAsOrigin, setSameAsOrigin] = useState(true);

    // Cálculos
    const COSTO_POR_KM = 1000;
    const [distanceKm, setDistanceKm] = useState(ruta.total_distance_km ?? 0);
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

                    // --- INICIO DE LA CORRECCIÓN DE ORDEN ---
                    
                    // 1. Obtener las cargas asignadas (que pueden venir desordenadas por ID)
                    const assignedUnsorted = Array.isArray(fullRoute.loads) ? fullRoute.loads : [];
                    
                    // 2. Obtener waypoints (donde está el orden real)
                    let waypoints = fullRoute.waypoints;
                    if (typeof waypoints === 'string') {
                        try { waypoints = JSON.parse(waypoints); } catch { waypoints = []; }
                    }
                    if (!Array.isArray(waypoints)) waypoints = [];

                    // 3. Reconstruir el orden basado en los Waypoints
                    const sortedLoads = [];
                    // Mapa auxiliar para buscar rápido por ID
                    const loadMap = new Map(assignedUnsorted.map(c => [c.id, c]));

                    // Recorremos los waypoints en orden
                    waypoints.forEach(wp => {
                        // Si el waypoint tiene un load_id y esa carga existe en nuestra lista
                        if (wp.load_id && loadMap.has(wp.load_id)) {
                            sortedLoads.push(loadMap.get(wp.load_id));
                            loadMap.delete(wp.load_id); // La quitamos del mapa para no duplicar
                        }
                    });

                    // Si sobró alguna carga (que no tenía waypoint asignado por error), la agregamos al final
                    loadMap.forEach(load => sortedLoads.push(load));

                    // 4. Establecer estado con la lista YA ORDENADA
                    setOrdered(sortedLoads);
                    setSelected(new Set(sortedLoads.map(c => c.id)));

                    // --- FIN DE LA CORRECCIÓN DE ORDEN ---


                    // Llenar Origen y Destino desde Waypoints
                    let startId = null;
                    let endId = null;

                    if (waypoints.length > 0) {
                        const first = waypoints[0];
                        if (first && first.partner_id && first.type !== 'load') startId = Number(first.partner_id);

                        const last = waypoints[waypoints.length - 1];
                        if (last && last.partner_id && last.type !== 'load') endId = Number(last.partner_id);
                        
                        // Fallback: si el primero tiene load_id, es que no hay origen explícito, asumimos lógica de servicio
                        if (first && first.load_id) startId = null; 
                    }

                    if (startId) setOriginId(startId);
                    if (endId) setDestinationId(endId);
                    
                    if (startId && endId && startId !== endId) {
                        setSameAsOrigin(false);
                    } else {
                        setSameAsOrigin(true);
                    }
                })
                .catch(err => console.error("Error cargando detalles de ruta:", err));
        }
    }, [routeId]);

    // -------------------------------------------------------------
    // 2. CÁLCULOS LOCALES
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
    // COMBINAR CARGAS
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
            
            if (!itemToAdd && routeDetails.loads) {
                itemToAdd = routeDetails.loads.find(c => c.id === id);
            }

            if (itemToAdd) {
                setOrdered([...ordered, itemToAdd]);
            }
        } else {
            newSelected.delete(id);
            setOrdered(ordered.filter(o => o.id !== id));
        }
        
        setSelected(newSelected);
    }

    // -------------------------------------------------------------
    // 3. ORQUESTADOR DEL RECALCULO
    // -------------------------------------------------------------
    useEffect(() => {
        if (!routeDetails || !routeId) return;

        if (recalcTimeoutRef.current) clearTimeout(recalcTimeoutRef.current);

        recalcTimeoutRef.current = setTimeout(() => {
            performPreview();
        }, 500);

        return () => clearTimeout(recalcTimeoutRef.current);
    }, [ordered, originId, destinationId, sameAsOrigin]);

    async function performPreview() {
        const loadIds = ordered.map(c => c.id);
        
        // Evitar llamada vacía inicial si no hay datos relevantes
        if (loadIds.length === 0 && !originId && !destinationId) return;

        let dest = destinationId;
        if (sameAsOrigin) dest = originId;

        try {
            const res = await fetch(`/api/rutas/${routeId}/preview`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    load_ids: loadIds,
                    origin_id: originId || null,
                    destination_id: dest || null
                })
            });
            const data = await res.json();

            if (data.total_distance_km !== undefined) {
                setDistanceKm(Number(data.total_distance_km));
            }

            if (data.waypoints) {
                window.dispatchEvent(
                    new CustomEvent("draw-preview-route", {
                        detail: { 
                            routeId: routeId, 
                            waypoints: data.waypoints 
                        }
                    })
                );
            }

        } catch (error) {
            console.error("Error obteniendo preview de ruta", error);
        }
    }

    // -------------------------------------------------------------
    // 4. DRAG & DROP
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
                    destination_id: dest
                }),
            });
            window.location.reload(); 
            onClose();
        } catch (e) {
            alert("Error al guardar");
        }
    }

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
                                <div>
                                    <div className="carga-title">{c.name}</div>
                                    <div className="carga-sub">{c.vendor_name}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* DERECHA */}
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
                        <strong>${Math.round(costoPorKg).toLocaleString()}</strong>
                    </div>
                </div>
           </div>
       </div>
    );
}