import "../../css/logistics_sidebar.css";
import CargasList from "./sidebar/CargasList";
import RutasList from "./sidebar/RoutesList";
import ContactsList from "./sidebar/ContactsList";

// Sidebar que carga los componentes de listas
// falta dinamizar el título y componentes según la pestaña activa

export default function Sidebar({ currentView, onChangeView }) {
    return (
        <div className="logistics-main-sidebar">

            <div className="logistics-sidebar-header">
                <h2>Logística</h2>
                <p>Gestión de cargas, rutas y contactos</p>
            </div>
            <div className="logistics-sidebar-header">
                <h2>Logística</h2>
                <p>Gestión de cargas, rutas y contactos</p>

                {/* BOTÓN TEMPORAL - Resetear todas las cargas */}
                <button
                    style={{
                        marginTop: "10px",
                        padding: "6px 10px",
                        fontSize: "12px",
                        width: "100%",
                        background: "#ffdddd",
                        border: "1px solid #cc0000",
                        borderRadius: "6px",
                        cursor: "pointer"
                    }}
                    onClick={async () => {
                        if (!confirm("¿Seguro que quieres pasar TODAS las cargas a borrador (draft)?")) return;

                        await fetch("/api/cargas/reset", { method: "POST" });
                        
                        // refresca inmediatamente las listas
                        window.dispatchEvent(new Event("cargas-refresh"));
                        window.dispatchEvent(new Event("rutas-refresh"));
                        alert("Todas las cargas fueron puestas en estado draft.");
                    }}
                >
                    Reset
                </button>
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
                {currentView === "cargas" && <CargasList />}
                {currentView === "rutas" && <RutasList />}
                {currentView === "contactos" && <ContactsList />}
            </div>

        </div>
    );
}
