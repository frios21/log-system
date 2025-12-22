import React from 'react';
import './LocationSummaryModal.css';

// Modal compacto para mostrar resumen por ubicación
export default function LocationSummaryModal({ open, onClose, locations = [], loading = false }) {
  if (!open) return null;

  // Capacidades por pallet
  const BV_UNITS = 240; // bandejas verdes/blancas
  const B_UNITS = 75;   // bandejones
  const E_PER_PALLET = 4; // esquineros por pallet

  // helper para determinar si una carga está 'assigned'
  const isAssigned = (c) => {
    if (!c) return false;
    const s = (c.status || c.state || c.estado || '').toString().toLowerCase();
    return s === 'assigned' || s === 'asignado' || s === 'assigned_to' || c.assigned === true;
  };

  // calcular totales globales considerando solo cargas 'assigned'
  const totals = locations.reduce((acc, loc) => {
    (loc.cargas || []).forEach(c => {
      if (!isAssigned(c)) return;
      const pallets = Number(c.total_pallets ?? c.pallets ?? 0) || 0;
      const kilos = Number(c.total_quantity ?? 0) || 0;
      acc.pallets += pallets;
      acc.kilos += kilos;
      acc.bv += pallets * BV_UNITS;
      acc.b += pallets * B_UNITS;
      acc.e += pallets * E_PER_PALLET;
    });
    return acc;
  }, { pallets: 0, kilos: 0, bv: 0, b: 0, e: 0 });

  // preparar ubicaciones visibles (solo las que tienen cargas assigned)
  const visibleLocations = (locations || []).map(loc => ({
    ...loc,
    cargas: (loc.cargas || []).filter(c => isAssigned(c))
  })).filter(loc => (loc.cargas || []).length > 0);

  return (
    <div className="lsm-modal">
      <div className="lsm-header">
        <strong>Resumen por Ubicación</strong>
        <button className="lsm-closeBtn" onClick={onClose}>Cerrar</button>
      </div>

      <div className="lsm-summaryTop">
        <div>Palets: <strong>{totals.pallets}</strong></div>
        <div>BV (unidades): <strong>{totals.bv}</strong></div>
        <div>B (unidades): <strong>{totals.b}</strong></div>
        <div>Esquineros: <strong>{totals.e}</strong></div>
        <div>Kilos (aprox): <strong>{totals.kilos || '-'}</strong></div>
      </div>

      <div className="lsm-content">
          {loading ? (
            <div style={{ padding: 12 }}>Cargando...</div>
          ) : (
            <div style={styles.matrixWrap}>
              <div className="lsm-matrixTable">
                <div className="lsm-matrixHeader">
                  <div style={{ width: 220 }}>Proveedor / Ubicación</div>
                  <div style={{ width: 180 }}>Carga</div>
                  <div style={{ width: 140 }} className="lsm-insumoHeader lsm-cell-left">Insumo (Tipo)</div>
                  <div style={{ width: 140 }} className="lsm-insumoHeader lsm-cell-left">Insumo (Cantidad)</div>
                  <div style={{ width: 140 }} className="lsm-entregaHeader lsm-cell-left">Entrega (Kilos)</div>
                  <div style={{ width: 120 }} className="lsm-entregaHeader lsm-cell-left">Entrega (Pallets)</div>
                </div>

                {visibleLocations && visibleLocations.length ? visibleLocations.map((loc, idx) => {
                  const cargas = loc.cargas || [];

                  // helper para resolver tipo de insumo y cantidad por pallets
                  const resolveInsumo = (c) => {
                    const pallets = Number(c.total_pallets ?? c.pallets ?? 0) || 0;
                    // prefer explicit type fields, fallback to name heuristics
                    const rawType = (c.insumo_type || c.tipo || c.insumo || c.name || '').toString().toUpperCase();
                    let type = 'BV';
                    if (/ESQUIN/i.test(rawType) || /ESQ/i.test(rawType)) type = 'E';
                    else if (/BANDEJON|BANDJ|B-?B|BB/i.test(rawType) || /BANDEJA ARANDANERA/i.test(rawType)) type = 'B';
                    else if (/BANDEJA|BV|BANDEJA VERDE|BANDEJA BLAN/i.test(rawType)) type = 'BV';

                    let unitsPerPallet = BV_UNITS;
                    if (type === 'B') unitsPerPallet = B_UNITS;
                    if (type === 'E') unitsPerPallet = E_PER_PALLET;

                    const insumoQuantity = pallets * unitsPerPallet;
                    return { type, insumoQuantity, pallets };
                  };

                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column' }}>
                      {cargas.length ? cargas.map((c, j) => {
                        const { type, insumoQuantity, pallets } = resolveInsumo(c);
                        const entregaKilos = Number(c.total_quantity ?? c.kilos ?? 0) || '-';
                        const entregaPallets = pallets || '-';
                        return (
                          <div key={(c.id || j)} className="lsm-matrixRow">
                            <div style={{ width: 220, paddingRight: 8 }}>{j === 0 ? <strong className="lsm-proveedorName">{loc.name}</strong> : ''}</div>
                            <div style={{ width: 180 }}>{c.name}</div>
                            <div style={{ width: 140 }} className="lsm-cell-left">{type}</div>
                            <div style={{ width: 140 }} className="lsm-cell-left">{insumoQuantity || '-'}</div>
                            <div style={{ width: 140 }} className="lsm-cell-left">{entregaKilos}</div>
                            <div style={{ width: 120 }} className="lsm-cell-left">{entregaPallets}</div>
                          </div>
                        );
                      }) : (
                        // esta rama ya no debería ocurrir porque filtramos ubicaciones sin cargas
                        <div style={styles.matrixRow}><div style={{ width: 220 }}><strong>{loc.name}</strong></div><div style={{ paddingLeft: 8, color: '#666' }}>No hay cargas</div></div>
                      )}
                    </div>
                  );
                }) : (
                  <div style={{ padding: 8, color: '#666' }}>No hay ubicaciones para mostrar</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={styles.footer}>
          {/* Cierre en el header; footer intencionalmente vacío para evitar botón duplicado */}
        </div>
      </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    width: 720,
    maxHeight: '80vh',
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'fixed',
    left: 20,
    top: 80,
    zIndex: 9999,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #eee',
  },
  closeBtn: {
    marginLeft: 12,
  },
  summaryTop: {
    display: 'flex',
    gap: 12,
    padding: '10px 16px',
    borderBottom: '1px solid #f3f3f3',
    background: '#fafafa',
    fontSize: 13,
  },
  content: {
    padding: 12,
    overflow: 'auto',
    flex: 1,
  },
  locationBlock: {
    marginBottom: 12,
    border: '1px solid #eee',
    borderRadius: 6,
    overflow: 'hidden',
  },
  locationHeader: {
    background: '#f7f7f9',
    padding: '8px 12px',
    fontWeight: 600,
  },
  tableHeader: {
    display: 'flex',
    padding: '6px 12px',
    fontSize: 12,
    color: '#666',
    borderBottom: '1px solid #eee',
    alignItems: 'center',
  },
  row: {
    display: 'flex',
    padding: '8px 12px',
    alignItems: 'center',
    borderBottom: '1px solid #fafafa',
  },
  subRow: {
    display: 'flex',
    padding: '4px 12px 8px 12px',
    alignItems: 'center',
    background: '#fff',
    borderBottom: '1px solid #fbfbfb',
  },
  matrixWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  note: {
    fontSize: 12,
    color: '#666',
    padding: '4px 8px',
  },
  matrixTable: {
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #eee',
    borderRadius: 6,
    overflow: 'hidden',
    background: '#fff',
  },
  matrixHeader: {
    display: 'flex',
    padding: '8px 12px',
    background: '#f7f9fb',
    fontSize: 13,
    color: '#333',
    borderBottom: '1px solid #eee',
    alignItems: 'center',
  },
  matrixRow: {
    display: 'flex',
    padding: '8px 12px',
    alignItems: 'center',
    borderBottom: '1px solid #fafafa',
  },
  insumoHeader: {
    color: '#9b1c1c',
    background: '#fff5f5',
    padding: '4px 8px',
    fontWeight: 700,
    borderLeft: '1px solid #eee',
  },
  entregaHeader: {
    color: '#116530',
    background: '#f5fff5',
    padding: '4px 8px',
    fontWeight: 700,
    borderLeft: '1px solid #eee',
  },
  proveedorName: {
    background: '#e6f7e6',
    padding: '2px 6px',
    borderRadius: 4,
  },
  footer: {
    padding: 12,
    borderTop: '1px solid #eee',
    display: 'flex',
    justifyContent: 'flex-end',
  },
};
