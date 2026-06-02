import { initializeApp } from "./js/dom.js";
import { registerInstallPromptFlow, registerServiceWorkerUpdateFlow } from "./js/pwa.js";

document.addEventListener("DOMContentLoaded", async () => {
  await initializeApp();
  registerServiceWorkerUpdateFlow();
  registerInstallPromptFlow();
});
