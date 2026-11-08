import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
});
const mediaQuery: MediaQueryList = {
  media: "(prefers-color-scheme: dark)",
  matches: false,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => true,
};
let reducedMotion = false;
const reduceMotionQuery: MediaQueryList = {
  ...mediaQuery,
  media: "(prefers-reduced-motion: reduce)",
  get matches() {
    return reducedMotion;
  },
};
Object.defineProperty(dom.window, "matchMedia", {
  value: (query: string) => query === reduceMotionQuery.media ? reduceMotionQuery : mediaQuery,
});
Object.defineProperty(dom.window, "requestAnimationFrame", {
  value: (callback: FrameRequestCallback) =>
    dom.window.setTimeout(() => callback(dom.window.performance.now()), 0),
});
Object.defineProperty(dom.window, "cancelAnimationFrame", {
  value: (handle: number) => dom.window.clearTimeout(handle),
});

describe("theme preference provider", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    container?.remove();
    dom.window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.documentElement.classList.remove("theme-transition");
  });

  it("persists a selected theme and clears storage for system preference", async () => {
    const { ThemeProvider, useTheme } = await import("@/components/theme-provider");
    function ThemeControls() {
      const { preference, setPreference } = useTheme();
      return createElement(
        "div",
        null,
        createElement("output", null, preference),
        createElement("button", { onClick: () => setPreference("dark") }, "Dark"),
        createElement("button", { onClick: () => setPreference("system") }, "System"),
      );
    }

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(ThemeProvider, null, createElement(ThemeControls)));
    });

    await act(async () => container.querySelector("button")?.click());
    await act(async () => new Promise((resolve) => dom.window.setTimeout(resolve, 20)));
    expect(container.querySelector("output")?.textContent).toBe("dark");
    expect(dom.window.localStorage.getItem("nexus-theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("theme-transition")).toBe(true);

    await act(async () => container.querySelectorAll("button")[1]?.click());
    await act(async () => new Promise((resolve) => dom.window.setTimeout(resolve, 20)));
    expect(container.querySelector("output")?.textContent).toBe("system");
    expect(dom.window.localStorage.getItem("nexus-theme")).toBeNull();
    expect(document.documentElement.dataset.theme).toBe("light");
    await act(async () => new Promise((resolve) => dom.window.setTimeout(resolve, 300)));
    expect(document.documentElement.classList.contains("theme-transition")).toBe(false);
  });

  it("applies theme changes immediately when reduced motion is preferred", async () => {
    reducedMotion = true;
    const { ThemeProvider, useTheme } = await import("@/components/theme-provider");
    function ThemeControls() {
      const { setPreference } = useTheme();
      return createElement("button", { onClick: () => setPreference("dark") }, "Dark");
    }

    document.documentElement.dataset.theme = "light";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(ThemeProvider, null, createElement(ThemeControls)));
    });

    await act(async () => container.querySelector("button")?.click());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("theme-transition")).toBe(false);
    reducedMotion = false;
  });
});
