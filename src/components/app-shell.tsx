"use client";

import {
  Activity,
  ArrowUpRight,
  Bell,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Command,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  ShoppingBag,
  Sun,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { IconButton } from "@/components/ui";
import { logoutAction } from "@/app/actions/auth";

const navigation = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Orders", href: "/orders", icon: ShoppingBag },
  { label: "Customers", href: "/customers", icon: UsersRound },
  { label: "Products", href: "/products", icon: Package },
  { label: "Analytics", href: "/analytics", icon: ChartNoAxesCombined },
];

const routeTitles: Record<string, { title: string; breadcrumb?: string }> = {
  "/": { title: "Overview" },
  "/orders": { title: "Orders", breadcrumb: "Manage your transactions" },
  "/customers": { title: "Customers", breadcrumb: "Know your customers" },
  "/products": { title: "Products", breadcrumb: "Manage your catalog" },
  "/analytics": { title: "Analytics", breadcrumb: "Understand your performance" },
  "/audit-logs": { title: "Audit Logs", breadcrumb: "Review workspace activity" },
  "/settings": { title: "Settings", breadcrumb: "Manage your workspace" },
};

export function AppShell({
  children,
  workspaceName,
  workspaceRole,
  userName,
  userEmail,
}: {
  children: React.ReactNode;
  workspaceName: string;
  workspaceRole: string;
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const searchDialogRef = useRef<HTMLDialogElement>(null);
  const notificationsRef = useRef<HTMLDetailsElement>(null);
  const profileRef = useRef<HTMLDetailsElement>(null);
  const { toggleTheme } = useTheme();
  const visibleNavigation = useMemo(
    () =>
      workspaceRole === "owner" || workspaceRole === "admin"
        ? [...navigation, { label: "Audit Logs", href: "/audit-logs", icon: ClipboardList }]
        : navigation,
    [workspaceRole],
  );
  const currentPage = routeTitles[pathname] ?? routeTitles["/"];
  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [
      ...visibleNavigation,
      { label: "Settings", href: "/settings", icon: Settings2 },
    ].filter((item) =>
      term ? item.label.toLowerCase().includes(term) : true,
    );
  }, [query, visibleNavigation]);

  useEffect(() => {
    const dialog = searchDialogRef.current;
    if (!dialog) return;
    if (searchOpen && !dialog.open) dialog.showModal();
    if (!searchOpen && dialog.open) dialog.close();
  }, [searchOpen]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        if (notificationsRef.current?.open) {
          notificationsRef.current.open = false;
          setNotificationsOpen(false);
          notificationsRef.current.querySelector("summary")?.focus();
        }
        if (profileRef.current?.open) {
          profileRef.current.open = false;
          setProfileOpen(false);
          profileRef.current.querySelector("summary")?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!notificationsRef.current?.contains(event.target as Node)) {
        if (notificationsRef.current?.open) notificationsRef.current.open = false;
        setNotificationsOpen(false);
      }
      if (!profileRef.current?.contains(event.target as Node)) {
        if (profileRef.current?.open) profileRef.current.open = false;
        setProfileOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  return (
    <div className={`app-shell${collapsed ? " shell-collapsed" : ""}`}>
      {mobileOpen ? (
        <button
          aria-label="Close navigation"
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      ) : null}
      <aside className={`sidebar${mobileOpen ? " sidebar-mobile-open" : ""}`}>
        <Link aria-label="Nexus Analytics home" className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <Activity size={19} strokeWidth={2.2} />
          </span>
          <span className="brand-name">
            nexus<span>analytics</span>
          </span>
        </Link>

        <Link
          aria-label={`Current workspace: ${workspaceName}. Switch workspace`}
          className="workspace-switcher"
          href="/workspaces"
        >
          <span className="workspace-avatar">{workspaceName[0]?.toUpperCase() ?? "W"}</span>
          <span className="workspace-copy">
            <strong>{workspaceName}</strong>
            <span>{workspaceRole[0]?.toUpperCase()}{workspaceRole.slice(1)}</span>
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </Link>

        <div className="sidebar-section-label">WORKSPACE</div>
        <nav aria-label="Main navigation" className="primary-nav">
          {visibleNavigation.map(({ label, href, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`nav-link${active ? " nav-link-active" : ""}`}
                href={href}
                onClick={() => setMobileOpen(false)}
                key={href}
                title={collapsed ? label : undefined}
              >
                <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                <span className="nav-label">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-note">
          <span className="sidebar-note-icon" aria-hidden="true">
            <Activity size={16} />
          </span>
          <div className="sidebar-note-copy">
            <strong>Workspace connected</strong>
            <span>Live workspace data</span>
          </div>
        </div>
        <Link
          aria-current={pathname === "/settings" ? "page" : undefined}
          className={`nav-link settings-link${pathname === "/settings" ? " nav-link-active" : ""}`}
          href="/settings"
          onClick={() => setMobileOpen(false)}
          title={collapsed ? "Settings" : undefined}
        >
          <Settings2 size={18} strokeWidth={1.8} aria-hidden="true" />
          <span className="nav-label">Settings</span>
        </Link>

        <button
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="sidebar-collapse"
          onClick={() => setCollapsed((value) => !value)}
          type="button"
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          <span className="nav-label">Collapse sidebar</span>
        </button>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-heading">
            <IconButton
              className="mobile-menu-button"
              label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={19} />
            </IconButton>
            <div className="breadcrumbs">
              <span className="breadcrumb-root">Workspace</span>
              <ChevronRight size={14} aria-hidden="true" />
              <span aria-current="page">{currentPage.title}</span>
            </div>
            {currentPage.breadcrumb ? (
              <span className="topbar-subtitle">{currentPage.breadcrumb}</span>
            ) : null}
          </div>
          <div className="topbar-actions">
            <button
              aria-label="Search pages"
              aria-keyshortcuts="Control+K Meta+K"
              className="search-trigger"
              onClick={() => setSearchOpen(true)}
              type="button"
            >
              <Search size={16} aria-hidden="true" />
              <span>Search anything</span>
              <kbd>
                <Command size={11} aria-hidden="true" /> K
              </kbd>
            </button>
            <div className="topbar-divider" />
            <IconButton label="Toggle color theme" onClick={toggleTheme}>
              <Sun className="theme-icon-light" size={18} />
              <Moon className="theme-icon-dark" size={18} />
            </IconButton>
            <details
              className="popover-wrap"
              onToggle={(event) => setNotificationsOpen(event.currentTarget.open)}
              ref={notificationsRef}
            >
              <summary aria-expanded={notificationsOpen} aria-label="Notifications" className="icon-button notification-button">
                <Bell size={18} />
              </summary>
              <div className="popover notification-popover">
                <div className="popover-heading">
                  <strong>Notifications</strong>
                </div>
                <p className="notification-empty">No notifications to display.</p>
              </div>
            </details>
            <div className="topbar-divider profile-divider" />
            <details
              className="popover-wrap profile-wrap"
              onToggle={(event) => setProfileOpen(event.currentTarget.open)}
              ref={profileRef}
            >
              <summary aria-expanded={profileOpen} className="profile-trigger">
                <span className="profile-avatar">{initials || "U"}</span>
                <span className="profile-copy"><strong>{userName}</strong><small>{workspaceRole[0]?.toUpperCase()}{workspaceRole.slice(1)}</small></span>
                <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <div className="popover profile-popover">
                <div className="profile-popover-head"><span className="profile-avatar">{initials || "U"}</span><span><strong>{userName}</strong><small>{userEmail}</small></span></div>
                <Link
                  className="popover-link"
                  href="/settings"
                  onClick={() => {
                    if (profileRef.current) profileRef.current.open = false;
                    setProfileOpen(false);
                  }}
                >
                  <Settings2 size={15} /> Profile & settings
                </Link>
                <Link
                  className="popover-link"
                  href="/workspaces"
                  onClick={() => {
                    if (profileRef.current) profileRef.current.open = false;
                    setProfileOpen(false);
                  }}
                >
                  <UsersRound size={15} /> Switch workspace
                </Link>
                <form
                  action={logoutAction}
                  onSubmit={() => {
                    if (profileRef.current) profileRef.current.open = false;
                    setProfileOpen(false);
                  }}
                >
                  <button className="popover-link profile-signout" type="submit"><LogOut size={15} /> Sign out</button>
                </form>
              </div>
            </details>
          </div>
        </header>
        <main className="main-content" id="main-content">{children}</main>
        <footer className="app-footer">
          <span>© 2026 Nexus Analytics</span>
          <span>Workspace analytics · Reporting data</span>
        </footer>
      </div>

      {searchOpen ? (
        <dialog
          aria-label="Search navigation"
          className="command-backdrop"
          onClose={() => setSearchOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) setSearchOpen(false);
          }}
          ref={searchDialogRef}
        >
          <section className="command-dialog">
            <div className="command-input-wrap">
              <Search size={19} aria-hidden="true" />
              <input
                aria-label="Search pages"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pages..."
                ref={searchRef}
                value={query}
              />
              <button aria-label="Close search" className="command-close" onClick={() => setSearchOpen(false)} type="button"><X size={17} /></button>
            </div>
            <p className="command-label">PAGES</p>
            <div className="command-results">
              {searchResults.map(({ label, href, icon: Icon }) => (
                <Link className="command-result" href={href} key={href} onClick={() => setSearchOpen(false)}>
                  <Icon size={17} /><span>{label}</span><ArrowUpRight size={14} className="command-result-arrow" />
                </Link>
              ))}
              {searchResults.length === 0 ? <p className="command-empty">No pages match “{query}”.</p> : null}
            </div>
            <div className="command-hint"><span><kbd>tab</kbd> to navigate</span><span><kbd>esc</kbd> to close</span></div>
          </section>
        </dialog>
      ) : null}
    </div>
  );
}
