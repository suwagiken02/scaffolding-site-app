import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { hydrateLocalStorageFromServer } from "./lib/persistStorageApi";

async function boot() {
  if (import.meta.env.PROD) {
    await hydrateLocalStorageFromServer();
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
}

void boot();
