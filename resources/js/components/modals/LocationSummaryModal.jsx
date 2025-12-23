import React from 'react';
import './LocationSummaryModal.css';

export default function LocationSummaryModal({ open, onClose = () => {}, locations = [], loading = false }) {
  if (!open) return null;

  // capacidades por pallet
  const BV_UNITS = 240; // bandejas verdes/blancas
  const B_UNITS = 75;   // bandejones
  const E_PER_PALLET = 4; // esquineros por pallet

  // HELPER para determinar el estado de la carga
  const getChargeStatus = (c) => {
    if (!c) return 'draft';
    const s = (c.status || c.state || c.estado || '').toString().toLowerCase();

    // lógica para estados
    if (s === 'done' || s === 'finalized' || s === 'finalizado') return 'done';
    if (s === 'assigned' || s === 'asignado' || s === 'assigned_to' || c.assigned === true) return 'assigned';
    return 'draft'; // default draft
  };

  const getChargeStatusColor = (status) => {
    if (status === 'done') return 'lsm-row-done';
    if (status === 'assigned') return 'lsm-row-assigned';
    return 'lsm-row-draft';
  };
  
  // calcular totales globales considerando TODAS las cargas
  const totals = locations.reduce((acc, loc) => {
    // 🚨 CORRECCIÓN CRÍTICA: Ignorar si la UBICACIÓN es null/undefined
    if (!loc) return acc; 

    // Usar encadenamiento opcional para mayor seguridad aunque ya revisamos loc
    (loc.cargas || []).forEach(c => {
      // Control de seguridad para cargas nulas/undefined
      if (!c) return; 

      const pallets = Number(c.total_pallets ?? c.pallets ?? 0) || 0;
      const kilos = Number(c.total_quantity ?? 0) || 0;
      acc.pallets += pallets;
      acc.kilos += kilos;

      const explicitQty = (c.insumo_qty != null && c.insumo_qty !== '') ? Number(c.insumo_qty) : null;
      const tipoRaw = (c.tipo_insumo || c.insumo_type || c.tipo || c.insumo || c.name || '').toString().toUpperCase();

      // decide type code
      let typeCode = 'BV'; 
      let unitsPerPallet = BV_UNITS; 
      
      if (tipoRaw === '') typeCode = 'N/A';
      else if (/ESQUIN/i.test(tipoRaw) || /ESQ/i.test(tipoRaw)) {
        typeCode = 'E';
      }
      else if (/BANDEJON|BANDJ|B-?J|BANDEJON/i.test(tipoRaw)) {
        typeCode = 'B';
        unitsPerPallet = B_UNITS;
      }
      else if (/BANDEJA VERDE|BV/i.test(tipoRaw)) {
        typeCode = 'BV';
        unitsPerPallet = BV_UNITS;
      }
      else if (/BANDEJA BLAN|BB|BLANCA/i.test(tipoRaw)) {
        typeCode = 'BB';
        unitsPerPallet = BV_UNITS; 
      }
      else if (/BANDEJA/i.test(tipoRaw)) {
          typeCode = 'BV';
          unitsPerPallet = BV_UNITS;
      }


      if (explicitQty != null && !Number.isNaN(explicitQty)) {
        // Si hay cantidad explícita, se suma a su tipo
        if (typeCode === 'E') acc.e += explicitQty;
        else if (typeCode === 'B') acc.b += explicitQty;
        else if (typeCode === 'BV') acc.bv += explicitQty;
        else if (typeCode === 'BB') acc.bb += explicitQty; 
      } else {
        // Estimar solo Esquineros.
        if (typeCode === 'E') acc.e += pallets * E_PER_PALLET;
      }
    });
    
    return acc; // ¡Asegurarse de retornar el acumulador!
  }, { pallets: 0, kilos: 0, bv: 0, bb: 0, b: 0, e: 0 });

  // preparar ubicaciones visibles (todas las que tienen cargas)
  const visibleLocations = (locations || [])
    .filter(loc => loc) // Filtrar ubicaciones nulas/undefined de la lista
    .map(loc => ({
      ...loc,
      cargas: (loc?.cargas || [])
    }))
    .filter(loc => (loc.cargas || []).length > 0);

  // formateadores numéricos
  const intFmt = new Intl.NumberFormat();
  const kiloFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

  // safe close helper to avoid uncaught errors coming from parent onClose
  const safeClose = () => {
    try {
      onClose && onClose();
    } catch (err) {
      console.error('Error executing onClose from LocationSummaryModal:', err);
      // don't rethrow
    }
  };

  // Print builder: creates HTML, opens new window, triggers print (supports multi-page)
  const handlePrint = () => {
    try {
      const printCss = `
        body { font-family: Arial, Helvetica, sans-serif; color: #111; padding: 18px; }
        .header { display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px; }
        .summary { display:flex; gap:16px; margin-bottom: 12px; flex-wrap:wrap; }
        .summary div { font-size: 13px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        thead { background: #f7f9fb; }
        th, td { padding: 8px 6px; border: 1px solid #e6e6e6; text-align: left; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        .col-label{ display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:8px; vertical-align:middle }
        .label-insumo{ background: #9b1c1c }
        .label-entrega{ background: #116530 }
        .label-kilos{ background: #0ea5a4 }
        .row-assigned { border-left: 6px solid #f59e0b; }
        .row-done { border-left: 6px solid #10b981; background: rgba(16,185,129,0.03); }
        .row-draft { border-left: 6px solid #9b1c1c; }
        @media print {
          @page { size: A4; margin: 12mm; }
          body { padding: 0; }
          .no-print { display: none; }
        }
      `;

      // build rows
      let rowsHtml = '';
      visibleLocations.forEach(loc => {
        const provider = loc.name || '';
        (loc.cargas || []).forEach((c) => {
          const { label, insumoQuantity, pallets } = resolveInsumo(c);
          const entregaKilos = Number(c.total_quantity ?? c.kilos ?? 0) || 0;
          const entregaPallets = pallets || 0;
          const status = getChargeStatus(c) || 'draft';
          const rowClass = `row-${status}`;
          rowsHtml += `<tr class="${rowClass}">
            <td>${escapeHtml(provider)}</td>
            <td>${escapeHtml(c.name || '')}</td>
            <td style="text-align:left">${escapeHtml(String(label))}</td>
            <td style="text-align:left">${insumoQuantity != null && insumoQuantity !== '-' ? intFmt.format(insumoQuantity) : '-'}</td>
            <td style="text-align:left">${entregaKilos ? kiloFmt.format(entregaKilos) : '-'}</td>
            <td style="text-align:left">${entregaPallets || '-'}</td>
          </tr>`;
        });
      });

      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Resumen por Ubicación</title><style>${printCss}</style></head><body>
        <div class="header">
          <h2>Resumen por Ubicación</h2>
          <div class="no-print">Generado: ${new Date().toLocaleString()}</div>
        </div>
        <div class="summary">
          <div>Palets: <strong>${intFmt.format(totals.pallets || 0)}</strong></div>
          <div>BV: <strong>${intFmt.format(totals.bv || 0)}</strong></div>
          <div>BB: <strong>${intFmt.format(totals.bb || 0)}</strong></div>
          <div>B: <strong>${intFmt.format(totals.b || 0)}</strong></div>
          <div>Esquineros (est): <strong>${intFmt.format(totals.e || 0)}</strong></div>
          <div>Kilos (aprox): <strong>${kiloFmt.format(totals.kilos || 0)} kg</strong></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Carga</th>
              <th>Insumo (Tipo)</th>
              <th>Insumo (Cantidad)</th>
              <th>Entrega (Kilos)</th>
              <th>Entrega (Pallets)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body></html>`;

      const w = window.open('', '_blank');
      if (!w) {
        alert('No se pudo abrir la ventana de impresión. ¿Hay un bloqueador de ventanas emergentes?');
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      // small delay to allow rendering
      setTimeout(() => {
        try { w.print(); } catch (e) { console.error('Print failed', e); }
      }, 500);
    } catch (err) {
      console.error('Error building print view', err);
      alert('Error preparando la impresión');
    }
  };

  // small helper to escape HTML
  const escapeHtml = (s) => {
    if (s == null) return '';
    return String(s).replace(/[&<>\"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  // helper para resolver tipo de insumo y cantidad por pallets
  const resolveInsumo = (c) => {
    // Control de seguridad adicional
    if (!c) return { code: 'N/A', label: 'Error de Carga', insumoQuantity: '-', pallets: 0 };
    
    const pallets = Number(c.total_pallets ?? c.pallets ?? 0) || 0;
    const rawType = (c.tipo_insumo || c.insumo_type || c.tipo || c.insumo || c.name || '').toString();
    const rawTypeUp = rawType.toUpperCase();

    let code = 'BV';
    let label = rawType ? rawType : 'N/A'; 
    let unitsPerPallet = BV_UNITS; 

    if (rawTypeUp === '') {
        code = 'N/A';
    } else if (/ESQUIN/i.test(rawTypeUp) || /ESQ/i.test(rawTypeUp)) {
      code = 'E';
      label = 'Esquinero';
    } else if (/BANDEJON|BANDJ|B-?J|BANDEJON/i.test(rawTypeUp)) {
      code = 'B';
      label = 'Bandejón';
      unitsPerPallet = B_UNITS;
    } else if (/BANDEJA VERDE|BV/i.test(rawTypeUp)) {
      code = 'BV';
      label = 'B. Verde';
      unitsPerPallet = BV_UNITS;
    } else if (/BANDEJA BLAN|BB|BLANCA/i.test(rawTypeUp)) {
      code = 'BB';
      label = 'B. Blanca';
      unitsPerPallet = BV_UNITS; 
    } else if (/BANDEJA/i.test(rawTypeUp)) {
      code = 'BV';
      label = 'Bandeja';
      unitsPerPallet = BV_UNITS;
    }

    const explicitQty = (c.insumo_qty != null && c.insumo_qty !== '') ? Number(c.insumo_qty) : null;
    
    let insumoQuantity;

    if (code === 'N/A') {
        insumoQuantity = '-';
    } else if (explicitQty != null && !Number.isNaN(explicitQty)) {
        insumoQuantity = explicitQty;
    } else if (code === 'E') {
        insumoQuantity = pallets * E_PER_PALLET;
    } else {
        insumoQuantity = '-';
    }

    return { code, label, insumoQuantity, pallets };
  };

  return (
    <div className="lsm-modal">
      <div className="lsm-tab">Resumen</div>
      <div className="lsm-header">
        <strong>Resumen por Ubicación</strong>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="lsm-printBtn" onClick={() => handlePrint()} style={{ marginRight: 8 }}>Imprimir</button>
          <button className="lsm-closeBtn" onClick={safeClose}>Cerrar</button>
        </div>
      </div>

      <div className="lsm-summaryTop">
        <div>Palets: <strong>{intFmt.format(totals.pallets || 0)}</strong></div>
        <div>BV (unidades): <strong>{intFmt.format(totals.bv || 0)}</strong></div>
        <div>BB (unidades): <strong>{intFmt.format(totals.bb || 0)}</strong></div>
        <div>B (unidades): <strong>{intFmt.format(totals.b || 0)}</strong></div>
        <div>Esquineros: <strong>{intFmt.format(E_PER_PALLET*totals.pallets || 0)}</strong></div>
        <div>Kilos (aprox): <strong>{kiloFmt.format(totals.kilos || 0)} kg</strong></div>
        <div style={{ marginLeft: 'auto' }}>
          <div className="lsm-legend">
            <div><span className="lsm-col-label label-assigned"/>Asignada</div>
            <div><span className="lsm-col-label label-done"/>Finalizada</div>
            <div><span className="lsm-col-label label-draft"/>Borrador</div>
          </div>
        </div>
      </div>

      <div className="lsm-content">
          {loading ? (
            <div style={{ padding: 12 }}>Cargando...</div>
          ) : (
            <div style={styles.matrixWrap}>
              <div className="lsm-matrixTable">
                <div className="lsm-matrixHeader">
                  <div className="lsm-col lsm-col-provider">Proveedor</div>
                  <div className="lsm-col lsm-col-carga">Carga</div>
                  <div className="lsm-col lsm-col-insumo lsm-insumoHeader lsm-cell-left"><span className="lsm-col-label label-insumo"></span>Insumo (Tipo)</div>
                  <div className="lsm-col lsm-col-insumoQty lsm-insumoHeader lsm-cell-left"><span className="lsm-col-label label-insumo"></span>Insumo (Cantidad)</div>
                  <div className="lsm-col lsm-col-kilos lsm-entregaHeader lsm-cell-left"><span className="lsm-col-label label-kilos"></span>Entrega (Kilos)</div>
                  <div className="lsm-col lsm-col-pallets lsm-entregaHeader lsm-cell-left"><span className="lsm-col-label label-entrega"></span>Entrega (Pallets)</div>
                </div>

                {visibleLocations && visibleLocations.length ? visibleLocations.map((loc, idx) => {
                  const cargas = loc.cargas || [];

                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column' }}>
                      {cargas.length ? cargas.map((c, j) => {
                        // Control de seguridad dentro del map
                        if (!c) return null; 
                        
                        const { label, insumoQuantity, pallets } = resolveInsumo(c);
                        const entregaKilos = Number(c.total_quantity ?? c.kilos ?? 0) || '-';
                        const entregaPallets = pallets || '-';
                        const status = getChargeStatus(c); 
                        const rowClass = getChargeStatusColor(status); 
                        
                        return (
                          <div key={(c.id || j)} className={`lsm-matrixRow ${rowClass}`}>
                            <div className="lsm-col lsm-col-provider" title={loc.name}>
                                {j === 0 ? <strong className="lsm-proveedorName">{loc.name}</strong> : ''}
                            </div>
                            <div className="lsm-col lsm-col-carga" title={c.name}>{c.name}</div>
                            <div className="lsm-col lsm-col-insumo lsm-cell-left">{label}</div>
                            <div className="lsm-col lsm-col-insumoQty lsm-cell-left">
                                {insumoQuantity != null && insumoQuantity !== '-' ? intFmt.format(insumoQuantity) : insumoQuantity}
                            </div>
                            <div className="lsm-col lsm-col-kilos lsm-cell-left">{entregaKilos}</div>
                            <div className="lsm-col lsm-col-pallets lsm-cell-left">{entregaPallets}</div>
                          </div>
                        );
                      }) : (
                        <div style={styles.matrixRow}><div className="lsm-col lsm-col-provider"><strong>{loc.name}</strong></div><div style={{ paddingLeft: 8, color: '#666' }}>No hay cargas</div></div>
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
          {/* Footer vacío */}
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