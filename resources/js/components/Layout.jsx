import { useState } from "react";
import MapView from "./MapView";
import Sidebar from "./Sidebar";

export default function Layout() {
    const [view, setView] = useState("cargas");

    return (
        <div style={{ display: "flex", width: "100%", height: "100vh" }}>
            <MapView />
            <Sidebar currentView={view} onChangeView={setView} />
        </div>
    );
}
