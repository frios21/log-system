import React from 'react';
import { createPortal } from 'react-dom';
import CircleLoader from '../common/CircleLoader';

function formatNumber(n) {
  return typeof n === 'number' ? n : Number(n || 0);
}

export default function LocationSummaryModal({ open, onClose, locations, loading }) {
  if (!open) return null;

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        left: 12,
        top: 72,
        width: 420,
        maxHeight: '70vh',
        zIndex: 4000,
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 8,
        boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
        overflow: 'hidden',
        fontSize: 13,
      }}
    >
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #eee', fontWeight: 600 }}>
        Resumen por ubicación
      </div>

      <div style={{ padding: 12, overflowY: 'auto', maxHeight: '60vh' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <CircleLoader size={36} />
          </div>
        ) : (
          (locations || []).map((loc, idx) => {
            const locName = loc.name || `Ubicación ${idx + 1}`;
            // compute totals per location
            let totalPallets = 0;
            let totalBV = 0;
            let totalBandejones = 0;
            let totalE = 0;

            (loc.cargas || []).forEach((c) => {
              const pallets = formatNumber(c.total_pallets ?? c.pallets ?? c.total_pallets_manual ?? 0);
              totalPallets += pallets;
              totalBV += pallets * 240; // bandejas verdes/blancas
              totalBandejones += pallets * 75; // bandejones
              totalE += pallets * 4; // esquineros
            });

            return (
              <div key={idx} style={{ marginBottom: 12, borderBottom: '1px solid #f1f1f1', paddingBottom: 8 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{locName}</div>
                <div style={{ marginBottom: 6, color: '#444' }}>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>
                    Cargas:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {(loc.cargas || []).map((c, i) => {
                      const pallets = formatNumber(c.total_pallets ?? c.pallets ?? c.total_pallets_manual ?? 0);
                      const bv = pallets * 240;
                      const b = pallets * 75;
                      const e = pallets * 4;
                      const title = c.name || c.code || (c.load_name || `OC ${c.id || ''}`) || `OC ${c.id || ''}`;
                      return (
                        <li key={i} style={{ marginBottom: 6 }}>
                          <strong>{title}</strong>
                          <div style={{ fontSize: 12, color: '#555' }}>
                            pallets: {pallets} — BV/BB: {bv} — B: {b} — E: {e}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div style={{ fontSize: 13, color: '#222', fontWeight: 600 }}>
                  Totales: pallets: {totalPallets} — BV/BB: {totalBV} — B: {totalBandejones} — E: {totalE}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #eee', justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
