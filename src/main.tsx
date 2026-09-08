import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyBrand } from "./config/brand";
import { initNotificationAudioUnlock } from "./lib/notification-sound";

applyBrand();

// Destrava o AudioContext no primeiro gesto do usuário. Sem isto o contexto
// nasce `suspended` e o som da primeira notificação da sessão sai mudo — sem
// erro nenhum, que era parte do "não escuto mais o som".
initNotificationAudioUnlock();

createRoot(document.getElementById("root")!).render(<App />);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
