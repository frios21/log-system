import { useState } from "react";
import "../../css/logistics_sidebar.css";
import CargasList from "./sidebar/CargasList";
import RutasList from "./sidebar/RoutesList";
import ContactsList from "./sidebar/ContactsList";
import CircleLoader from "./common/CircleLoader";

export default function Sidebar({ currentView, onChangeView }) {
    const [isBlocking, setIsBlocking] = useState(false);

    return (
        <div className="logistics-main-sidebar">

            <div className="logistics-sidebar-header">
                <h2>Logística</h2>
                <p>Gestión de cargas, rutas y contactos</p>
            </div>

            <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
                <button
                    onClick={() => onChangeView("cargas")}
                    className={"assign-btn" + (currentView === "cargas" ? "" : " inactive")}
                >
                    Cargas
                </button>

                <button
                    onClick={() => onChangeView("rutas")}
                    className={"assign-btn" + (currentView === "rutas" ? "" : " inactive")}
                >
                    Rutas
                </button>

                <button
                    onClick={() => onChangeView("contactos")}
                    className={"assign-btn" + (currentView === "contactos" ? "" : " inactive")}
                >
                    Contactos
                </button>
            </div>

            <div className="logistics-sidebar-body">
                {currentView === "cargas" && (
                    <CargasList onBlockingChange={setIsBlocking} />
                )}
                {currentView === "rutas" && (
                    <RutasList onBlockingChange={setIsBlocking} />
                )}
                {currentView === "contactos" && <ContactsList />}
            </div>

            {isBlocking && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(0,0,0,0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 50,
                    }}
                >
                    <div
                        style={{
                            background: "rgba(255,255,255,0.95)",
                            borderRadius: 8,
                            padding: 16,
                            minWidth: 140,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <CircleLoader size={32} />
                        <span style={{ fontSize: 13, color: "#374151" }}>
                            Creando...
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
