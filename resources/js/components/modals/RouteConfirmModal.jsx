import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCargas } from "../../api/cargas";

// Modal para confirmar inicio o finalización de una ruta
// Muestra detalles de la ruta: paradas, distancia, cargas asociadas
// Permite confirmar o cancelar la acción
// Carga detalles de las cargas asociadas al abrirse

function parseWaypointsField(w) {
  if (!w) return [];
  if (Array.isArray(w)) return w;
  if (typeof w === "string") {
    try {
      const parsed = JSON.parse(w);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function RouteConfirmModal({ open, onClose, onConfirm, ruta, targetStatus }) {
  const { data: cargasData = [] } = useCargas();

  const loadsDetails = Array.isArray(cargasData) && ruta && Array.isArray(ruta.load_ids)
    ? cargasData.filter(l => ruta.load_ids.includes(l.id))
    : [];

  if (!open || !ruta) return null;

  const waypoints = parseWaypointsField(ruta.waypoints);

  const hasExplicitOrigin = waypoints.some(wp => wp && wp.type === 'origin');
  const inferredOriginLabel = !hasExplicitOrigin && loadsDetails.length
    ? `${loadsDetails[0].vendor_name || loadsDetails[0].name || `Carga #${loadsDetails[0].id}`}`
    : null;

  const title = targetStatus === 'assigned' ? 'Comenzar ruta' : targetStatus === 'done' ? 'Finalizar ruta' : 'Confirmar';
  const totalDist = ruta.total_distance_km != null ? `${Number(ruta.total_distance_km).toFixed(2)} km` : '—';

  const modalContent = (
    <div style={{
      position: 'fixed', left: 12, top: 72, width: 340,
      zIndex: 4000, background: '#fff', border: '1px solid #ddd', borderRadius: 8,
      boxShadow: '0 6px 20px rgba(0,0,0,0.18)', overflow: 'hidden', fontSize: 13
    }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #eee', fontWeight: 600 }}>
        {title}: {ruta.name}
      </div>
      <div style={{ maxHeight: 380, overflowY: 'auto', padding: 12 }}>
        {inferredOriginLabel && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Origen</div>
            <div style={{ color: '#333' }}>{inferredOriginLabel}</div>
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Secuencia de paradas</div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {waypoints.map((wp, idx) => {
              const label = wp.label || (wp.type === 'origin' ? 'Origen' : wp.type === 'destination' ? 'Destino' : `Punto ${idx+1}`);
              return <li key={idx} style={{ marginBottom: 4 }}>{label}</li>;
            })}
            {!waypoints.length && <li style={{ color: '#666' }}>Sin paradas</li>}
          </ol>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Distancia total</div>
          <div style={{ color: '#333' }}>{totalDist}</div>
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Cargas</div>
          {loadsDetails.length ? (
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {loadsDetails.map(load => {
                const lines = load.lines || load.load_lines || load.products || [];
                const displayName = `${load.name || load.code || `Carga #${load.id}`} ${load.vendor_name ? `- ${load.vendor_name}` : ""}`.trim();
                return (
                  <li key={load.id} style={{ marginBottom: 6 }}>
                    <strong>{displayName}</strong>
                    {Array.isArray(lines) && lines.length ? (
                      <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                        {lines.map((ln, i) => (
                          <li key={i} style={{ marginBottom: 2 }}>
                            {(ln.product_name || ln.product || ln.name || 'Producto')} — {(ln.quantity ?? ln.qty ?? ln.cantidad ?? 0)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ color: '#666' }}>Sin productos</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div style={{ color: '#666' }}>Sin cargas asociadas</div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #eee', justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose} style={{ background: '#f5f5f5' }}>Cancelar</button>
        <button className="btn btn-primary" onClick={onConfirm}>
          {targetStatus === 'assigned' ? 'Confirmar inicio' : targetStatus === 'done' ? 'Confirmar fin' : 'Confirmar'}
        </button>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
