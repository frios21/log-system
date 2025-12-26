import React, { useState, useMemo } from 'react';
import './LocationSummaryModal.css';

export default function LocationSummaryModal({ open, onClose = () => {}, locations = [], loading = false, startDate = '', endDate = '' }) {
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
    if (!loc) return acc; 

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
        if (typeCode === 'E') acc.e += explicitQty;
        else if (typeCode === 'B') acc.b += explicitQty;
        else if (typeCode === 'BV') acc.bv += explicitQty;
        else if (typeCode === 'BB') acc.bb += explicitQty; 
      } else {
        // Estimar solo Esquineros.
        if (typeCode === 'E') acc.e += pallets * E_PER_PALLET;
      }
    });
    
    return acc;
  }, { pallets: 0, kilos: 0, bv: 0, bb: 0, b: 0, e: 0 });

  // preparar ubicaciones visibles (todas las que tienen cargas)
  const visibleLocations = (locations || [])
    .filter(loc => loc)
    .map(loc => ({
      ...loc,
      cargas: (loc?.cargas || [])
    }))
    .filter(loc => (loc.cargas || []).length > 0);

  // formateadores numéricos
  const intFmt = new Intl.NumberFormat();
  const kiloFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

  // sort tabla columnas
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(0);

  const toggleSort = (key) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir(1);
      return;
    }
    // ciclo 0 -> 1 -> 2 -> 0
    const next = sortDir === 0 ? 1 : (sortDir === 1 ? 2 : 0);
    setSortDir(next);
    if (next === 0) setSortKey(null);
  };

  

  const safeClose = () => {
    try {
      onClose && onClose();
    } catch (err) {
      console.error('Error executing onClose from LocationSummaryModal:', err);
    }
  };

  // helper para formatear fechas de filtro (yyyy-mm-dd -> local)
  const formatFilterDate = (raw) => {
    if (!raw) return '';
    try {
      const [y, m, d] = raw.split('-').map(Number);
      if (!y || !m || !d) return raw;
      // Formatear como dd/mm/yyyy (con padding)
      const dd = String(d).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const yyyy = String(y);
      return `${dd}/${mm}/${yyyy}`;
    } catch (e) {
      return raw;
    }
  };

  const formattedStart = formatFilterDate(startDate);
  const formattedEnd = formatFilterDate(endDate);
  let dateRangeText = '';
  if (formattedStart && formattedEnd) {
    dateRangeText = `De ${formattedStart} hasta ${formattedEnd}`;
  } else if (formattedStart) {
    dateRangeText = `${formattedStart}`;
  } else if (formattedEnd) {
    dateRangeText = `${formattedEnd}`;
  }

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
        .row-assigned { border-left: 6px solid #f59e0b; background: rgba(255, 248, 225, 1) }
        .row-done { border-left: 6px solid #10b981; background: rgba(232, 245, 233, 1); }
        .row-draft { border-left: 6px solid #9b1c1c; background: rgba(255, 235, 238, 1); }
        @media print {
          @page { size: A4; margin: 12mm; }
          body { padding: 0; }
          .no-print { display: none; }
        }
      `;

      let rowsHtml = '';
      (displayRows || []).forEach(r => {
        const c = r.carga;
        const provider = r.provider || '';
        const label = r.label;
        const insumoQuantity = r.insumoQuantity;
        const entregaKilos = Number(r.entregaKilos || 0) || 0;
        const entregaPallets = r.entregaPallets || 0;
        const status = r.status || 'draft';
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

      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Resumen por Ubicación</title><style>${printCss}</style></head><body>
        <div class="header">
          <div style="display:flex;flex-direction:column;">
            <h2 style="margin:0;padding:0">Resumen por Ubicación</h2>
            <div style="font-size:12px;color:#666;margin-top:6px">${dateRangeText || ''}</div>
          </div>
          <div class="no-print">Generado: ${new Date().toLocaleString()}</div>
        </div>
        <div class="summary">
          <div>Palets: <strong>${intFmt.format(totals.pallets || 0)}</strong></div>
          <div>BV: <strong>${intFmt.format(totals.bv || 0)}</strong></div>
          <div>BB: <strong>${intFmt.format(totals.bb || 0)}</strong></div>
          <div>B: <strong>${intFmt.format(totals.b || 0)}</strong></div>
          <div>Esquineros: <strong>${intFmt.format(E_PER_PALLET*totals.pallets || 0)}</strong></div>
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

  // prepara las filas a mostrar en la tabla, con sorting
  const displayRows = useMemo(() => {
    const rows = [];
    (visibleLocations || []).forEach(loc => {
      const provider = loc.name || '';
      (loc.cargas || []).forEach(c => {
        if (!c) return;
        const { label, insumoQuantity, pallets } = resolveInsumo(c);
        const entregaKilos = Number(c.total_quantity ?? c.kilos ?? 0) || 0;
        const entregaPallets = pallets || 0;
        const status = getChargeStatus(c) || 'draft';
        const rowClass = getChargeStatusColor(status);
        rows.push({ provider, carga: c, label, insumoQuantity, entregaKilos, entregaPallets, status, rowClass });
      });
    });

    if (!sortKey || sortDir === 0) return rows;

    const dir = sortDir === 1 ? 1 : -1;
    if (sortKey === 'insumo') {
      rows.sort((a, b) => {
        const aa = (a.insumoQuantity == null || a.insumoQuantity === '-') ? NaN : Number(a.insumoQuantity);
        const bb = (b.insumoQuantity == null || b.insumoQuantity === '-') ? NaN : Number(b.insumoQuantity);
        if (!Number.isNaN(aa) && !Number.isNaN(bb) && aa !== bb) return (aa - bb) * dir;
        const la = (a.label || '').toString().localeCompare((b.label || '').toString());
        return la * dir;
      });
    } else if (sortKey === 'entrega') {
      rows.sort((a, b) => (Number(a.entregaKilos || 0) - Number(b.entregaKilos || 0)) * dir);
    }

    return rows;
  }, [visibleLocations, sortKey, sortDir]);

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
            <div><span className="lsm-col-label label-draft"/>Pendiente</div>
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
                  <div className="lsm-col-provider">Proveedor</div>
                  <div className="lsm-col-carga">Carga</div>
                  <div className="lsm-col-insumo lsm-insumoHeader lsm-cell-left" onClick={() => toggleSort('insumo')} style={{ cursor: 'pointer' }}>
                    <span className="lsm-col-label label-insumo"></span>Insumo<br/>(Tipo)
                    <span style={{ marginLeft: 6 }}>{sortKey === 'insumo' ? (sortDir === 1 ? '▲' : sortDir === 2 ? '▼' : '') : ''}</span>
                  </div>
                  <div className="lsm-col-insumoQty lsm-insumoHeader lsm-cell-left" onClick={() => toggleSort('insumo')} style={{ cursor: 'pointer' }}>
                    <span className="lsm-col-label label-insumo"></span>Insumo (Cantidad)
                    <span style={{ marginLeft: 6 }}>{sortKey === 'insumo' ? (sortDir === 1 ? '▲' : sortDir === 2 ? '▼' : '') : ''}</span>
                  </div>
                  <div className="lsm-col-kilos lsm-entregaHeader lsm-cell-left" onClick={() => toggleSort('entrega')} style={{ cursor: 'pointer' }}>
                    <span className="lsm-col-label label-kilos"></span>Entrega<br/>(Kilos)
                    <span style={{ marginLeft: 6 }}>{sortKey === 'entrega' ? (sortDir === 1 ? '▲' : sortDir === 2 ? '▼' : '') : ''}</span>
                  </div>
                  <div className="lsm-col-pallets lsm-entregaHeader lsm-cell-left" onClick={() => toggleSort('entrega')} style={{ cursor: 'pointer' }}>
                    <span className="lsm-col-label label-entrega"></span>Entrega (Pallets)
                    <span style={{ marginLeft: 6 }}>{sortKey === 'entrega' ? (sortDir === 1 ? '▲' : sortDir === 2 ? '▼' : '') : ''}</span>
                  </div>
                </div>

                {sortKey && sortDir !== 0 ? (
                  (displayRows && displayRows.length) ? displayRows.map((r, idx) => {
                    const c = r.carga;
                    return (
                      <div key={c.id || idx} className={`lsm-matrixRow ${r.rowClass}`}>
                        <div className="lsm-col-provider" title={r.provider}><strong className="lsm-proveedorName">{r.provider}</strong></div>
                        <div className="lsm-col-carga" title={c.name}>{c.name}</div>
                        <div className="lsm-col-insumo lsm-cell-left">{r.label}</div>
                        <div className="lsm-col-insumoQty lsm-cell-left">{r.insumoQuantity != null && r.insumoQuantity !== '-' ? intFmt.format(r.insumoQuantity) : r.insumoQuantity}</div>
                        <div className="lsm-col-kilos lsm-cell-left">{r.entregaKilos || '-'}</div>
                        <div className="lsm-col-pallets lsm-cell-left">{r.entregaPallets || '-'}</div>
                      </div>
                    );
                  }) : (
                    <div style={{ padding: 8, color: '#666' }}>No hay ubicaciones para mostrar</div>
                  )
                ) : (
                  (visibleLocations && visibleLocations.length) ? visibleLocations.map((loc, idx) => {
                    const cargas = loc.cargas || [];

                    return (
                      <div key={idx} style={{ display: 'flex', flexDirection: 'column' }}>
                        {cargas.length ? cargas.map((c, j) => {
                          if (!c) return null;

                          const { label, insumoQuantity, pallets } = resolveInsumo(c);
                          const entregaKilos = Number(c.total_quantity ?? c.kilos ?? 0) || '-';
                          const entregaPallets = pallets || '-';
                          const status = getChargeStatus(c);
                          const rowClass = getChargeStatusColor(status);

                          return (
                            <div key={(c.id || j)} className={`lsm-matrixRow ${rowClass}`}>
                              <div className="lsm-col-provider" title={loc.name}>
                                  {j === 0 ? <strong className="lsm-proveedorName">{loc.name}</strong> : ''}
                              </div>
                              <div className="lsm-col-carga" title={c.name}>{c.name}</div>
                              <div className="lsm-col-insumo lsm-cell-left">{label}</div>
                              <div className="lsm-col-insumoQty lsm-cell-left">
                                  {insumoQuantity != null && insumoQuantity !== '-' ? intFmt.format(insumoQuantity) : insumoQuantity}
                              </div>
                              <div className="lsm-col-kilos lsm-cell-left">{entregaKilos}</div>
                              <div className="lsm-col-pallets lsm-cell-left">{entregaPallets}</div>
                            </div>
                          );
                        }) : (
                          <div style={styles.matrixRow}><div className="lsm-col lsm-col-provider"><strong>{loc.name}</strong></div><div style={{ paddingLeft: 8, color: '#666' }}>No hay cargas</div></div>
                        )}
                      </div>
                    );
                  }) : (
                    <div style={{ padding: 8, color: '#666' }}>No hay ubicaciones para mostrar</div>
                  )
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
    alignItems: 'flex-start',
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