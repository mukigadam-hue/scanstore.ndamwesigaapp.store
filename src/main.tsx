import "./lib/polyfills";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { registerPwa } from "./lib/pwaRegister";
import { initOfflineSync } from "./lib/offlineQueue";

createRoot(document.getElementById("root")!).render(<App />);

// Kick off PWA registration + offline queue sync after mount.
registerPwa();
initOfflineSync();
