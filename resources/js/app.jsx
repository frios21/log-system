import './bootstrap';
import "../css/logistics_sidebar.css";
import "../css/ui-modern.css";


import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
const root = createRoot(document.getElementById("app"));
root.render(<App />);
