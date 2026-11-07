"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemePreference = "system" | "light" | "dark";

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_TRANSITION_DURATION_MS = 160;
let themeTransitionFrame: number | null = null;
let themeTransitionTimeout: number | null = null;

function getInitialPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const savedTheme = window.localStorage.getItem("nexus-theme");
  return savedTheme === "light" || savedTheme === "dark" ? savedTheme : "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] =
    useState<ThemePreference>(getInitialPreference);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = () => {
      if (preference === "system") applyTheme("system", mediaQuery.matches);
    };

    applyTheme(preference, mediaQuery.matches);
    mediaQuery.addEventListener("change", onSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", onSystemThemeChange);
  }, [preference]);

  const toggleTheme = useCallback(() => {
    const currentTheme = document.documentElement.dataset.theme;
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    window.localStorage.setItem("nexus-theme", nextTheme);
    setPreference(nextTheme);
  }, []);

  const setThemePreference = useCallback((nextPreference: ThemePreference) => {
    if (nextPreference === "system") {
      window.localStorage.removeItem("nexus-theme");
    } else {
      window.localStorage.setItem("nexus-theme", nextPreference);
    }
    setPreference(nextPreference);
  }, []);

  const contextValue = useMemo(
    () => ({ preference, setPreference: setThemePreference, toggleTheme }),
    [preference, setThemePreference, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

function applyTheme(preference: ThemePreference, systemDark: boolean) {
  const root = document.documentElement;
  const nextTheme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
  if (root.dataset.theme === nextTheme) return;

  if (themeTransitionFrame !== null) window.cancelAnimationFrame(themeTransitionFrame);
  if (themeTransitionTimeout !== null) window.clearTimeout(themeTransitionTimeout);
  themeTransitionFrame = null;
  themeTransitionTimeout = null;

  if (
    !root.dataset.theme ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    root.classList.remove("theme-transition");
    root.dataset.theme = nextTheme;
    return;
  }

  root.classList.add("theme-transition");
  themeTransitionFrame = window.requestAnimationFrame(() => {
    themeTransitionFrame = null;
    root.dataset.theme = nextTheme;
    themeTransitionTimeout = window.setTimeout(() => {
      root.classList.remove("theme-transition");
      themeTransitionTimeout = null;
    }, THEME_TRANSITION_DURATION_MS);
  });
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
