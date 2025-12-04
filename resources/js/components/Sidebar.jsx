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
