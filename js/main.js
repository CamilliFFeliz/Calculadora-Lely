import { initializeApp } from "./dom.js";
import { registerInstallPromptFlow, registerServiceWorkerUpdateFlow } from "./pwa.js";

document.addEventListener("DOMContentLoaded", async () => {
  await initializeApp();
  registerServiceWorkerUpdateFlow();
  registerInstallPromptFlow();
});
