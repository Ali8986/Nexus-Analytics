import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveProfileSettings: vi.fn(),
  saveWorkspaceSettings: vi.fn(),
  refresh: vi.fn(),
  setPreference: vi.fn(),
}));

vi.mock("@/app/actions/settings", () => ({
  saveProfileSettings: mocks.saveProfileSettings,
  saveWorkspaceSettings: mocks.saveWorkspaceSettings,
}));
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    preference: "system",
    setPreference: mocks.setPreference,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) =>
    createElement("a", props, children),
}));

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/settings",
});
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  Element: { configurable: true, value: dom.window.Element },
  HTMLAnchorElement: { configurable: true, value: dom.window.HTMLAnchorElement },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  HTMLInputElement: { configurable: true, value: dom.window.HTMLInputElement },
  Event: { configurable: true, value: dom.window.Event },
  InputEvent: { configurable: true, value: dom.window.InputEvent },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
});
dom.window.confirm = () => true;

const initialData = {
  email: "avery@example.test",
  emailConfirmedAt: "2026-11-01T10:00:00.000Z",
  accountCreatedAt: "2026-10-01T10:00:00.000Z",
  fullName: "Avery Smith",
  workspaceName: "Nexus Test Workspace",
  reportingCurrency: "USD",
  reportingTimezone: "UTC",
  role: "owner" as const,
};

describe("settings dashboard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveProfileSettings.mockResolvedValue({ success: true });
    mocks.saveWorkspaceSettings.mockResolvedValue({ success: true });
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    container?.remove();
  });

  async function render(role: "owner" | "admin" | "analyst" | "viewer" = initialData.role) {
    const { SettingsDashboard } = await import("@/components/settings-dashboard");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(SettingsDashboard, {
        initialData: { ...initialData, role },
      }));
    });
  }

  it("preserves profile values on save failure and prevents duplicate action calls", async () => {
    let resolveSave: ((result: { error: string }) => void) | undefined;
    mocks.saveProfileSettings.mockReturnValueOnce(new Promise((resolve) => {
      resolveSave = resolve;
    }));
    await render();

    const profileForm = container.querySelector("form.settings-form");
    const nameInput = profileForm?.querySelector("input");
    expect(nameInput).not.toBeNull();
    await act(async () => {
      const submit = new dom.window.Event("submit", { bubbles: true, cancelable: true });
      profileForm?.dispatchEvent(submit);
      profileForm?.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.saveProfileSettings).toHaveBeenCalledTimes(1);
    expect(mocks.saveProfileSettings).toHaveBeenCalledTimes(1);
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.includes("Saving…"))).toBe(true);

    await act(async () => resolveSave?.({ error: "Profile update failed. Try again." }));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Profile update failed");
    expect(nameInput?.value).toBe("Avery Smith");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.includes("Save profile"))).toBe(true);
  });

  it("shows workspace settings as read-only for a viewer", async () => {
    await render("viewer");
    const workspaceSection = container.querySelector("#workspace");
    const workspaceInputs = workspaceSection?.querySelectorAll("input");
    expect(workspaceSection?.textContent).toContain("read-only for your viewer role");
    expect(workspaceInputs?.length).toBe(3);
    expect([...workspaceInputs!].every((input) => input.disabled)).toBe(true);
    expect(workspaceSection?.textContent).not.toContain("Save workspace settings");
    expect(mocks.saveWorkspaceSettings).not.toHaveBeenCalled();
  });

  it("shows supported account security actions and theme choices", async () => {
    await render();
    expect(container.querySelector("#security")?.textContent).toContain("Verified");
    expect(container.querySelector('#security a[href="/forgot-password"]')?.textContent).toBe("Reset password");
    expect(container.querySelectorAll('input[name="theme"]')).toHaveLength(3);
    expect(container.querySelector("#appearance")?.textContent).toContain("saved locally");

    await act(async () => container.querySelector<HTMLInputElement>('input[name="theme"][value="dark"]')?.click());
    expect(mocks.setPreference).toHaveBeenCalledWith("dark");
  });
});
