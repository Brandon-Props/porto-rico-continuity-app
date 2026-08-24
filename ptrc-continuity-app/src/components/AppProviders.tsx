"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type ThemeMode = "light" | "dark" | "system";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({ mode: "system", setMode: () => {} });
export const useTheme = () => useContext(ThemeContext);

interface ProductionModeContextValue {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}

const ProductionModeContext = createContext<ProductionModeContextValue>({ enabled: false, setEnabled: () => {} });
export const useProductionMode = () => useContext(ProductionModeContext);

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const isDark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    const storedTheme = (localStorage.getItem("ptrc.theme") as ThemeMode | null) ?? "system";
    setModeState(storedTheme);
    applyTheme(storedTheme);
    setEnabledState(localStorage.getItem("ptrc.productionMode") === "1");

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme((localStorage.getItem("ptrc.theme") as ThemeMode | null) ?? "system");
    mq.addEventListener("change", handler);

    // Ask the browser not to evict this site's storage (localStorage/IndexedDB
    // — everything the app keeps: current user, productions, scenes, photos)
    // under disk pressure. Chrome/Android honors this reliably; iOS Safari's
    // support is much less consistent even for an installed home-screen app,
    // so this reduces but doesn't eliminate the risk of a device clearing
    // local data on its own — that's why sync exists as the real safety net.
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      navigator.storage.persist().catch(() => {});
    }

    return () => mq.removeEventListener("change", handler);
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    localStorage.setItem("ptrc.theme", next);
    applyTheme(next);
  };

  const setEnabled = (v: boolean) => {
    setEnabledState(v);
    localStorage.setItem("ptrc.productionMode", v ? "1" : "0");
  };

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      <ProductionModeContext.Provider value={{ enabled, setEnabled }}>{children}</ProductionModeContext.Provider>
    </ThemeContext.Provider>
  );
}
