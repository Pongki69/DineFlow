// @ts-check
import React from "react";
import { createRoot } from "react-dom/client";
import { DesignLab } from "./DesignLab";
import "../design-tokens.css";
import "./components.css";
import "./designLab.css";

const root = document.getElementById("root");
if (!root) throw new Error("The design preview root is missing.");
createRoot(root).render(
  <React.StrictMode>
    <DesignLab />
  </React.StrictMode>,
);
