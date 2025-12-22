import React from 'react';

// Modal compacto para mostrar resumen por ubicación
export default function LocationSummaryModal({ open, onClose, locations = [], loading = false }) {
  if (!open) return null;

  // Capacidades por pallet
  const BV_UNITS = 240; // bandejas verdes/blancas
  const B_UNITS = 75;   // bandejones
  const E_PER_PALLET = 4; // esquineros por pallet

  // calcular totales globales
  const totals = locations.reduce((acc, loc) => {
    loc.cargas.forEach(c => {
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

  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <strong>Resumen por Ubicación</strong>
          <button className="btn" onClick={onClose} style={styles.closeBtn}>Cerrar</button>
        </div>

        <div style={styles.summaryTop}>
          <div>Palets: <strong>{totals.pallets}</strong></div>
          <div>BV (unidades): <strong>{totals.bv}</strong></div>
          <div>B (unidades): <strong>{totals.b}</strong></div>
          <div>Esquineros: <strong>{totals.e}</strong></div>
          <div>Kilos (aprox): <strong>{totals.kilos || '-'}</strong></div>
        </div>

        <div style={styles.content}>
          {loading ? (
            <div style={{ padding: 12 }}>Cargando...</div>
          ) : (
            <div style={styles.matrixWrap}>
              <div style={styles.note}>
                Nota: se usan campos heurísticos para "Recolección" (in) y "Entrega" (out). Si una carga solo tiene `total_quantity` se considerará como entrega.
              </div>
              <div style={styles.matrixTable}>
                <div style={styles.matrixHeader}>
                  <div style={{ flex: 2 }}>Proveedor / Ubicación</div>
                  <div style={{ width: 120, textAlign: 'right' }}>Recolecta (Kilos)</div>
                  <div style={{ width: 120, textAlign: 'right' }}>Recolecta (Pallets)</div>
                  <div style={{ width: 120, textAlign: 'right' }}>Entrega (Kilos)</div>
                  <div style={{ width: 120, textAlign: 'right' }}>Entrega (Pallets)</div>
                  <div style={{ width: 120, textAlign: 'right' }}>Entrega (Esq.)</div>
                </div>

                {locations && locations.length ? locations.map((loc, idx) => {
                  // agregar totales por ubicación, usando heurísticas flexibles
                  const locTotals = (loc.cargas || []).reduce((acc, c) => {
                    const inKilos = Number(c.in_quantity ?? c.total_in ?? 0) || 0;
                    const outKilos = Number(c.out_quantity ?? c.total_quantity ?? 0) || 0;
                    const inPallets = Number(c.in_pallets ?? 0) || 0;
                    const outPallets = Number(c.out_pallets ?? c.total_pallets ?? c.pallets ?? 0) || 0;
                    const outEsq = Number(c.out_esquineros ?? 0) || 0;
                    acc.inKilos += inKilos;
                    acc.outKilos += outKilos;
                    acc.inPallets += inPallets;
                    acc.outPallets += outPallets;
                    acc.outEsq += outEsq;
                    return acc;
                  }, { inKilos: 0, outKilos: 0, inPallets: 0, outPallets: 0, outEsq: 0 });

                  return (
                    <div key={idx} style={styles.matrixRow}>
                      <div style={{ flex: 2, fontWeight: 600 }}>{loc.name}</div>
                      <div style={{ width: 120, textAlign: 'right' }}>{locTotals.inKilos || '-'}</div>
                      <div style={{ width: 120, textAlign: 'right' }}>{locTotals.inPallets || '-'}</div>
                      <div style={{ width: 120, textAlign: 'right' }}>{locTotals.outKilos || '-'}</div>
                      <div style={{ width: 120, textAlign: 'right' }}>{locTotals.outPallets || '-'}</div>
                      <div style={{ width: 120, textAlign: 'right' }}>{locTotals.outEsq || '-'}</div>
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
          <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
        </div>
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
  footer: {
    padding: 12,
    borderTop: '1px solid #eee',
    display: 'flex',
    justifyContent: 'flex-end',
  },
};
