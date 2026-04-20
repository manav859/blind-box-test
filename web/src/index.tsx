import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

// Minimal embedded app shell — admin panel removed.
// SHOPLINE admin handles all product management via the blind-box tag.
// This backend is an invisible logic layer activated only at webhook stage.
function App() {
  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Blind Box</h1>
      <p>
        This app processes blind-box assignments automatically when orders are
        paid. No manual configuration is needed here.
      </p>
      <p style={{ color: "#666", fontSize: "0.875rem", marginTop: "1rem" }}>
        Tag any SHOPLINE product with <code>blind-box</code> to enable
        blind-box assignment on purchase.
      </p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
