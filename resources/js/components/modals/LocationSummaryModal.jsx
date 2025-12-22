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
            locations.map((loc, idx) => (
              <div key={idx} style={styles.locationBlock}>
                <div style={styles.locationHeader}>{loc.name}</div>
                <div style={styles.tableHeader}>
                  <div style={{ flex: 1 }}>Item</div>
                  <div style={{ width: 80, textAlign: 'right' }}>Pallets</div>
                  <div style={{ width: 90, textAlign: 'right' }}>BV</div>
                  <div style={{ width: 80, textAlign: 'right' }}>B</div>
                  <div style={{ width: 80, textAlign: 'right' }}>E</div>
                  <div style={{ width: 90, textAlign: 'right' }}>Kilos</div>
                </div>
                {loc.cargas && loc.cargas.length ? loc.cargas.map((c) => {
                  const pallets = Number(c.total_pallets ?? c.pallets ?? 0) || 0;
                  const bv = pallets * BV_UNITS;
                  const b = pallets * B_UNITS;
                  const e = pallets * E_PER_PALLET;
                  const kilos = Number(c.total_quantity ?? 0) || '-';
                  return (
                    <div key={c.id || c.name} style={styles.row}>
                      <div style={{ flex: 1 }}>{c.name}</div>
                      <div style={{ width: 80, textAlign: 'right' }}>{pallets}</div>
                      <div style={{ width: 90, textAlign: 'right' }}>{bv}</div>
                      <div style={{ width: 80, textAlign: 'right' }}>{b}</div>
                      <div style={{ width: 80, textAlign: 'right' }}>{e}</div>
                      <div style={{ width: 90, textAlign: 'right' }}>{kilos}</div>
                    </div>
                  );
                }) : (
                  <div style={{ padding: 8, color: '#666' }}>No hay cargas en esta ubicación</div>
                )}
              </div>
            ))
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
  footer: {
    padding: 12,
    borderTop: '1px solid #eee',
    display: 'flex',
    justifyContent: 'flex-end',
  },
};
