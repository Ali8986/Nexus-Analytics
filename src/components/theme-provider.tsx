"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type ThemePreference = "system" | "light" | "dark";

type ThemeContextValue = {
  preference: ThemePreference;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

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

  const contextValue = useMemo(
    () => ({ preference, toggleTheme }),
    [preference, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

function applyTheme(preference: ThemePreference, systemDark: boolean) {
  document.documentElement.dataset.theme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
