import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { AccessibilityProvider } from "./accessibility/accessibilitySettings";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root is missing");
}

createRoot(root).render(
  <StrictMode>
    <AccessibilityProvider>
      <App />
    </AccessibilityProvider>
  </StrictMode>,
);
