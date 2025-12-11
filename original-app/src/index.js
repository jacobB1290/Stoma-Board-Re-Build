// src/index.js
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

import "./styles/glass.css"; // existing
import "./flash.css"; // existing
import "./index.css"; // ← new

createRoot(document.getElementById("root")).render(<App />);
