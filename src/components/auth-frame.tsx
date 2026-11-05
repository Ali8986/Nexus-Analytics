import { Activity } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AuthThemeToggle } from "@/components/auth-theme-toggle";

export function AuthFrame({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <Link aria-label="Nexus Analytics sign in" className="brand" href="/login">
          <span className="brand-mark" aria-hidden="true">
            <Activity size={19} strokeWidth={2.2} />
          </span>
          <span className="brand-name">
            nexus<span>analytics</span>
          </span>
        </Link>
        <AuthThemeToggle />
      </header>
      <section className="auth-content">
        <div className="auth-card">{children}</div>
        {footer ? <p className="auth-footer">{footer}</p> : null}
      </section>
    </main>
  );
}
