import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/login",
  parseLogin: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) =>
    createElement("a", props, children),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithPassword: mocks.signInWithPassword } }),
}));
vi.mock("@/lib/validation/schemas", () => ({
  loginSchema: { safeParse: mocks.parseLogin },
  passwordRecoverySchema: { safeParse: vi.fn() },
  passwordResetSchema: { safeParse: vi.fn() },
  signupSchema: { safeParse: vi.fn() },
}));

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/login",
});
Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  Event: { configurable: true, value: dom.window.Event },
  HTMLElement: { configurable: true, value: dom.window.HTMLElement },
  HTMLInputElement: { configurable: true, value: dom.window.HTMLInputElement },
  InputEvent: { configurable: true, value: dom.window.InputEvent },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true },
});

describe("login form", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/login";
    mocks.parseLogin.mockReturnValue({
      success: true,
      data: { email: "member@example.com", password: "valid-password" },
    });
    container = document.createElement("div");
    document.body.append(container);
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    container.remove();
  });

  async function render() {
    const { LoginForm } = await import("@/components/auth-forms");
    root = createRoot(container);
    await act(async () => root.render(createElement(LoginForm)));
  }

  it("keeps the form pending after authentication until pathname navigation completes", async () => {
    let resolveSignIn!: (result: { error: null }) => void;
    mocks.signInWithPassword.mockReturnValueOnce(new Promise((resolve) => {
      resolveSignIn = resolve;
    }));
    await render();

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    const form = container.querySelector("form")!;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(submit.disabled).toBe(true);
    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1);

    await act(async () => resolveSignIn({ error: null }));
    expect(mocks.replace).toHaveBeenCalledWith("/");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(submit.disabled).toBe(true);

    mocks.pathname = "/";
    const { LoginForm } = await import("@/components/auth-forms");
    await act(async () => root.render(createElement(LoginForm)));
    expect(form.getAttribute("aria-busy")).toBe("false");
    expect(submit.disabled).toBe(false);
  });

  it("releases pending state and displays a safe error when sign-in fails", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ error: new Error("invalid credentials") });
    await render();

    await act(async () => {
      container.querySelector("form")?.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(container.querySelector("form")?.getAttribute("aria-busy")).toBe("false");
    expect(container.querySelector('[role="alert"]')?.textContent)
      .toBe("Email or password is incorrect.");
  });
});
