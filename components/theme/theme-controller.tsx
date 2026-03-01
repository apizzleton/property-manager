"use client";

import { useEffect } from "react";
import { applyThemeColor, DEFAULT_THEME_HEX, readSavedThemeColor } from "@/lib/theme";

export function ThemeController() {
  useEffect(() => {
    applyThemeColor(readSavedThemeColor());

    const onStorage = (event: StorageEvent) => {
      if (event.key) {
        applyThemeColor(readSavedThemeColor());
      }
    };

    const onThemeChanged = () => {
      applyThemeColor(readSavedThemeColor());
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("pmapp-theme-changed", onThemeChanged);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pmapp-theme-changed", onThemeChanged);
      // Ensure we always leave the app on a valid color if storage gets cleared mid-session.
      applyThemeColor(readSavedThemeColor() || DEFAULT_THEME_HEX);
    };
  }, []);

  return null;
}
