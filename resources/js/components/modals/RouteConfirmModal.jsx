import React, { useState } from "react";
import { createPortal } from "react-dom";
import CircleLoader from "../common/CircleLoader";

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
  const [totalQnt, setTotalQnt] = useState(() =>
    ruta?.total_qnt != null
      ? Number(ruta.total_qnt)
      : Number(ruta?.expected_qnt ?? 0)
  );
  const [editingTotalQnt, setEditingTotalQnt] = useState(false);
  const [tempTotalQnt, setTempTotalQnt] = useState(totalQnt);
  const [saving, setSaving] = useState(false);

  if (!open || !ruta) return null;

  // Intentamos usar detalles de cargas embebidos en la ruta (si existen).
  // Si no, degradamos a un listado mínimo sólo con el id/nombre básico.
  let loadsDetails = Array.isArray(ruta.loads) ? ruta.loads : [];

  if (!loadsDetails.length && Array.isArray(ruta.load_ids)) {
    loadsDetails = ruta.load_ids.map((id) => ({ id }));
  }

  const waypoints = parseWaypointsField(ruta.waypoints);
  const hasExplicitOrigin = waypoints.some((wp) => wp && wp.type === "origin");

  const prettyStops = (() => {
    if (!Array.isArray(waypoints) || waypoints.length === 0) return [];

    const stops = [];

    if (!hasExplicitOrigin && loadsDetails.length) {
      const firstLoad = loadsDetails[0];
      const cargaName = firstLoad.name || firstLoad.code || `Carga #${firstLoad.id}`;
      const vendor = firstLoad.vendor_name ? ` - ${firstLoad.vendor_name}` : "";
      stops.push(`Origen: ${cargaName}${vendor}`);
    }

    waypoints.forEach((wp, idx) => {
      if (!wp) return;

      if (!hasExplicitOrigin && loadsDetails.length && wp.load_id === loadsDetails[0].id) {
        return;
      }

      const baseLabel =
        wp.label ||
        (wp.type === "origin"
          ? "Origen"
          : wp.type === "destination"
          ? "Destino"
          : `Punto ${idx + 1}`);
      stops.push(baseLabel);
    });

    return stops;
  })();

  const title =
    targetStatus === "assigned"
      ? "Comenzar ruta"
      : targetStatus === "done"
      ? "Finalizar ruta"
      : "Confirmar";

  const totalDist =
    ruta.total_distance_km != null ? `${Number(ruta.total_distance_km).toFixed(2)} km` : "—";

  const expectedTotal =
    ruta?.expected_qnt != null ? Number(ruta.expected_qnt) : Number(totalQnt);

  const handleSaveTotalQnt = () => {
    setTotalQnt(Number(tempTotalQnt) || 0);
    setEditingTotalQnt(false);
  };

  const handleConfirm = async () => {
    if (saving) return;

    try {
      setSaving(true);

      if (targetStatus === "done") {
        try {
          await fetch(`/api/rutas/${ruta.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ total_qnt: totalQnt }),
          });
        } catch (e) {
          console.error("Error actualizando total_qnt", e);
        }
      }

      if (onConfirm) {
        await onConfirm();
      }
    } finally {
      setSaving(false);
    }
  };

  const modalContent = (
    <div
      style={{
        position: "fixed",
        left: 12,
        top: 72,
        width: 340,
        zIndex: 4000,
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: 8,
        boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
        overflow: "hidden",
        fontSize: 13,
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid #eee",
          fontWeight: 600,
        }}
      >
        {title}: {ruta.name}
      </div>
      <div style={{ maxHeight: 380, overflowY: "auto", padding: 12 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Secuencia de paradas</div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {prettyStops.map((label, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>
                {label}
              </li>
            ))}
            {!prettyStops.length && (
              <li style={{ color: "#666" }}>Sin paradas</li>
            )}
          </ol>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Distancia total</div>
          <div style={{ color: "#333" }}>{totalDist}</div>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Cargas</div>
          {loadsDetails.length ? (
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {loadsDetails.map((load) => {
                const lines = load.lines || load.load_lines || load.products || [];
                const displayName = `${load.name || load.code || `Carga #${load.id}`} ${
                  load.vendor_name ? `- ${load.vendor_name}` : ""
                }`.trim();
                return (
                  <li key={load.id} style={{ marginBottom: 6 }}>
                    <strong>{displayName}</strong>
                    {Array.isArray(lines) && lines.length ? (
                      <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                        {lines.map((ln, i) => (
                          <li key={i} style={{ marginBottom: 2 }}>
                            {(ln.product_name || ln.product || ln.name || "Producto")} —{" "}
                            {ln.quantity ?? ln.qty ?? ln.cantidad ?? 0} kg
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ color: "#666" }}>Sin productos</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div style={{ color: "#666" }}>Sin cargas asociadas</div>
          )}
        </div>

        <div style={{ fontWeight: 600, marginTop: 8 }}>
          Cantidad total esperada: {expectedTotal} kg
        </div>

        {targetStatus === "done" && (
          <div
            style={{ fontWeight: 600, marginTop: 6, cursor: "pointer" }}
            onDoubleClick={() => {
              setEditingTotalQnt(true);
              setTempTotalQnt(totalQnt);
            }}
          >
            Cantidad total real: {" "}
            {editingTotalQnt ? (
              <input
                autoFocus
                type="number"
                value={tempTotalQnt}
                onChange={(e) => setTempTotalQnt(e.target.value)}
                onBlur={handleSaveTotalQnt}
                onKeyDown={(e) => e.key === "Enter" && handleSaveTotalQnt()}
                style={{ width: 80, padding: 4 }}
              />
            ) : (
              `${totalQnt} kg`
            )}
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: 12,
          borderTop: "1px solid #eee",
          justifyContent: "flex-end",
        }}
      >
        <button
          className="btn"
          onClick={onClose}
          disabled={saving}
          style={{ background: "#f5f5f5" }}
        >
          Cancelar
        </button>
        <button
          className="btn btn-primary"
          onClick={handleConfirm}
          disabled={saving}
        >
          {targetStatus === "assigned"
            ? "Confirmar inicio"
            : targetStatus === "done"
            ? "Confirmar fin"
            : "Confirmar"}
        </button>
      </div>
    </div>
  );

  return createPortal(
    <>
      {modalContent}
      {saving && (
        <div
          style={{
            position: "fixed",
            left: 12,
            top: 72,
            width: 340,
            height: "auto",
            maxHeight: "calc(100vh - 100px)",
            borderRadius: 8,
            background: "rgba(255,255,255,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 4001,
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 8,
              background: "#ffffff",
              boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircleLoader size={40} />
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
