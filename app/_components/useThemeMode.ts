"use client";

import { useEffect, useState } from "react";

type ThemeMode = "dark" | "light";

function readThemeMode(): ThemeMode {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export default function useThemeMode() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readThemeMode());

  useEffect(() => {
    setThemeMode(readThemeMode());

    const observer = new MutationObserver(() => {
      setThemeMode(readThemeMode());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  return themeMode;
}
