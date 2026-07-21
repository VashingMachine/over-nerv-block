import { useCallback, useEffect, useRef, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
}

export interface PwaStatus {
  readonly supported: boolean;
  readonly phase: "checking" | "ready" | "unavailable" | "error";
  readonly online: boolean;
  readonly cacheReady: boolean;
  readonly installAvailable: boolean;
  readonly installed: boolean;
  readonly updateWaiting: boolean;
  readonly message: string;
  readonly requestInstall: () => Promise<void>;
  readonly applyUpdate: () => void;
  readonly checkCache: () => Promise<void>;
}

interface CacheStatusResponse {
  readonly type: "CACHE_STATUS";
  readonly buildIdentifier: string;
  readonly ready: boolean;
}

function isCacheStatus(
  value: unknown,
  buildIdentifier: string,
): value is CacheStatusResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).type === "CACHE_STATUS" &&
    (value as Record<string, unknown>).buildIdentifier === buildIdentifier &&
    typeof (value as Record<string, unknown>).ready === "boolean"
  );
}

async function requestCacheStatus(
  worker: ServiceWorker,
  buildIdentifier: string,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve(false), 2_000);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      window.clearTimeout(timeout);
      resolve(
        isCacheStatus(event.data, buildIdentifier) ? event.data.ready : false,
      );
    };
    worker.postMessage({ type: "CACHE_STATUS" }, [channel.port2]);
  });
}

export function usePwaStatus(buildIdentifier: string): PwaStatus {
  const supported =
    typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const productionPwaAvailable = import.meta.env.PROD && supported;
  const [phase, setPhase] = useState<PwaStatus["phase"]>(
    productionPwaAvailable ? "checking" : "unavailable",
  );
  const [online, setOnline] = useState(() => navigator.onLine);
  const [cacheReady, setCacheReady] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState(
    () => window.matchMedia?.("(display-mode: standalone)").matches ?? false,
  );
  const [updateWaiting, setUpdateWaiting] = useState(false);
  const [message, setMessage] = useState(() => {
    if (!import.meta.env.PROD) {
      return "Install and offline readiness are checked in the production build.";
    }
    if (!supported) {
      return "This browser does not support local app installation or offline caching.";
    }
    return "Checking local app readiness…";
  });
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const reloadingRef = useRef(false);
  const updateRequestedRef = useRef(false);

  const checkCache = useCallback(async () => {
    const registration = registrationRef.current;
    const worker = registration?.active ?? navigator.serviceWorker.controller;
    if (!worker) {
      setCacheReady(false);
      return;
    }
    try {
      const ready = await requestCacheStatus(worker, buildIdentifier);
      setCacheReady(ready);
    } catch {
      setCacheReady(false);
    }
  }, [buildIdentifier]);

  useEffect(() => {
    const handleOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOnline);
    };
  }, []);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!productionPwaAvailable) return;
    let disposed = false;
    const noteWaitingWorker = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) setUpdateWaiting(true);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => {
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            setUpdateWaiting(true);
          }
        });
      });
    };
    const handleControllerChange = () => {
      if (updateRequestedRef.current && !reloadingRef.current) {
        reloadingRef.current = true;
        window.location.reload();
        return;
      }
      void checkCache();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );
    void navigator.serviceWorker
      .register(new URL("./sw.js", document.baseURI), { scope: "./" })
      .then(async (registration) => {
        if (disposed) return;
        registrationRef.current = registration;
        noteWaitingWorker(registration);
        await navigator.serviceWorker.ready;
        if (disposed) return;
        setPhase("ready");
        setMessage(
          "Local app shell registered. Selected music is never cached.",
        );
        await checkCache();
      })
      .catch(() => {
        if (!disposed) {
          setPhase("error");
          setMessage(
            "Offline setup could not finish. The online game still works.",
          );
        }
      });
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
    };
  }, [checkCache, productionPwaAvailable]);

  const requestInstall = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  }, [installPrompt]);

  const applyUpdate = useCallback(() => {
    updateRequestedRef.current = true;
    registrationRef.current?.waiting?.postMessage({ type: "SKIP_WAITING" });
  }, []);

  return {
    supported,
    phase,
    online,
    cacheReady,
    installAvailable: installPrompt !== null,
    installed,
    updateWaiting,
    message,
    requestInstall,
    applyUpdate,
    checkCache,
  };
}
