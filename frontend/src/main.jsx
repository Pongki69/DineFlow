import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";
import "./design-system.css";
import "./design-tokens.css";
import "./production-theme.css";
import "./features/riderSage.css";
import "./responsive-ui.css";
import "./features/orderFoundation.css";
// Last: the shared phone patterns (search, view switch, tiles, buttons).
import "./phoneKit.css";

// No page zoom on phones: iOS Safari ignores user-scalable=no for pinch, so
// cancel its gesture events. Maps and the floor plan zoom on their own.
for (const type of ["gesturestart", "gesturechange"])
  document.addEventListener(type, (event) => event.preventDefault(), {
    passive: false,
  });

// Phones: the header shows a hairline once the page has scrolled.
const markScrolled = () =>
  document.documentElement.toggleAttribute("data-scrolled", window.scrollY > 4);
window.addEventListener("scroll", markScrolled, { passive: true });
markScrolled();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
