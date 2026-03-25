import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import { ContasMLProvider } from "./contexts/ContasMLContext.jsx";
import "./index.css"; // <- ESSENCIAL

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <ContasMLProvider>
        <App />
      </ContasMLProvider>
    </AuthProvider>
  </React.StrictMode>
);