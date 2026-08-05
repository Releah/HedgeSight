import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, VersionStamp } from "./App.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><App /><VersionStamp /></StrictMode>);
