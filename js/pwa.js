const APP_CACHE_PREFIX = "lely-sublimacao-";
const CURRENT_CACHE_NAMES = [
  "lely-sublimacao-v1.0.10-order-slip",
  "lely-sublimacao-runtime-v1.0.10-order-slip"
];

let hasReloadedForUpdate = false;
let deferredInstallPrompt = null;

export function registerServiceWorkerUpdateFlow() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.register("sw.js")
    .then((registration) => {
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;

        if (!newWorker) {
          return;
        }

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateToast(newWorker);
          }
        });
      });

      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateToast(registration.waiting);
      }
    })
    .catch(() => {});

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloadedForUpdate) {
      return;
    }

    hasReloadedForUpdate = true;
    window.location.reload();
  });
}

export function registerInstallPromptFlow() {
  const installButton = document.querySelector("#installAppButton");

  if (!installButton) {
    return;
  }

  const displayModeQuery = typeof window.matchMedia === "function"
    ? window.matchMedia("(display-mode: standalone)")
    : null;
  const isStandaloneDisplay = Boolean(displayModeQuery?.matches);
  const isIosStandalone = Boolean(window.navigator.standalone);

  if (isStandaloneDisplay || isIosStandalone) {
    installButton.hidden = true;
    return;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    deferredInstallPrompt.prompt();
    const choiceResult = await deferredInstallPrompt.userChoice.catch(() => null);

    if (!choiceResult || choiceResult.outcome === "accepted") {
      installButton.hidden = true;
      deferredInstallPrompt = null;
    }
  });

  window.addEventListener("appinstalled", () => {
    installButton.hidden = true;
    deferredInstallPrompt = null;
  });
}

function showUpdateToast(waitingWorker) {
  const existingToast = document.querySelector("#appUpdateToast");

  if (existingToast) {
    return;
  }

  const toast = document.createElement("button");
  toast.id = "appUpdateToast";
  toast.className = "app-update-toast";
  toast.type = "button";
  toast.textContent = "Nova versão disponível. Clique para atualizar.";
  toast.addEventListener("click", async () => {
    await clearOutdatedAppCaches();
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  });
  document.body.append(toast);
}

async function clearOutdatedAppCaches() {
  if (!("caches" in window)) {
    return;
  }

  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith(APP_CACHE_PREFIX) && !CURRENT_CACHE_NAMES.includes(cacheName))
      .map((cacheName) => caches.delete(cacheName))
  );
}
