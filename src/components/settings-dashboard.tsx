"use client";

import {
  Building2,
  Check,
  CircleAlert,
  Globe2,
  Monitor,
  Moon,
  Save,
  ShieldCheck,
  Sun,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { saveProfileSettings, saveWorkspaceSettings } from "@/app/actions/settings";
import { useTheme } from "@/components/theme-provider";
import { Button, Surface, Skeleton } from "@/components/ui";
import {
  profileSettingsSchema,
  workspaceSettingsSchema,
} from "@/lib/settings/schemas";

export type SettingsDashboardData = {
  email: string;
  emailConfirmedAt: string | null;
  accountCreatedAt: string;
  fullName: string;
  workspaceName: string;
  reportingCurrency: string;
  reportingTimezone: string;
  role: "owner" | "admin" | "analyst" | "viewer";
};

type Feedback = { tone: "success" | "error"; message: string } | null;

const subscribeToNothing = () => () => undefined;
const getServerThemePreference = () => "system";

function formattedDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  const Icon = feedback.tone === "success" ? Check : CircleAlert;
  return (
    <p
      aria-live="polite"
      className={`settings-feedback settings-feedback-${feedback.tone}`}
      role={feedback.tone === "error" ? "alert" : "status"}
    >
      <Icon aria-hidden="true" size={15} />
      {feedback.message}
    </p>
  );
}

export function SettingsDashboard({ initialData }: { initialData: SettingsDashboardData }) {
  const router = useRouter();
  const { preference, setPreference } = useTheme();
  const displayedPreference = useSyncExternalStore(
    subscribeToNothing,
    () => preference,
    getServerThemePreference,
  );
  const [fullName, setFullName] = useState(initialData.fullName);
  const [savedFullName, setSavedFullName] = useState(initialData.fullName);
  const [workspaceName, setWorkspaceName] = useState(initialData.workspaceName);
  const [reportingCurrency, setReportingCurrency] = useState(initialData.reportingCurrency);
  const [reportingTimezone, setReportingTimezone] = useState(initialData.reportingTimezone);
  const [savedWorkspace, setSavedWorkspace] = useState({
    name: initialData.workspaceName,
    reportingCurrency: initialData.reportingCurrency,
    reportingTimezone: initialData.reportingTimezone,
  });
  const [profilePending, setProfilePending] = useState(false);
  const [workspacePending, setWorkspacePending] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null);
  const [workspaceFeedback, setWorkspaceFeedback] = useState<Feedback>(null);
  const [activeSection, setActiveSection] = useState("profile");
  const profileBusy = useRef(false);
  const workspaceBusy = useRef(false);
  const canManageWorkspace = initialData.role === "owner" || initialData.role === "admin";
  const profileDirty = fullName !== savedFullName;
  const workspaceDirty =
    workspaceName !== savedWorkspace.name ||
    reportingCurrency !== savedWorkspace.reportingCurrency ||
    reportingTimezone !== savedWorkspace.reportingTimezone;

  useEffect(() => {
    const sectionIds = ["profile", "workspace", "regional", "appearance", "security"];
    const updateActiveSection = () => {
      const documentHeight = document.documentElement.scrollHeight;
      if (
        documentHeight > window.innerHeight &&
        window.scrollY + window.innerHeight >= documentHeight - 2
      ) {
        setActiveSection("security");
        return;
      }

      const currentSection = sectionIds
        .map((id) => document.getElementById(id))
        .filter((element): element is HTMLElement => element !== null)
        .filter((element) => element.getBoundingClientRect().top <= 160)
        .at(-1);
      setActiveSection(currentSection?.id ?? "profile");
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    return () => {
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, []);

  useEffect(() => {
    const hasUnsavedChanges = () => profileDirty || workspaceDirty;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const confirmNavigation = (event: MouseEvent) => {
      if (!hasUnsavedChanges()) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target || link.origin !== window.location.origin) return;
      const destination = new URL(link.href);
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      ) return;
      if (!window.confirm("You have unsaved settings. Leave this page without saving?")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", confirmNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", confirmNavigation, true);
    };
  }, [profileDirty, workspaceDirty]);

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profileBusy.current) return;
    const parsed = profileSettingsSchema.safeParse({ fullName });
    if (!parsed.success) {
      setProfileFeedback({ tone: "error", message: parsed.error.issues[0]?.message ?? "Enter a valid name." });
      return;
    }

    profileBusy.current = true;
    setProfilePending(true);
    setProfileFeedback(null);
    try {
      const result = await saveProfileSettings(parsed.data);
      if ("error" in result) {
        setProfileFeedback({ tone: "error", message: result.error });
        return;
      }
      setFullName(parsed.data.fullName);
      setSavedFullName(parsed.data.fullName);
      setProfileFeedback({ tone: "success", message: "Profile saved." });
      router.refresh();
    } catch {
      setProfileFeedback({ tone: "error", message: "Profile could not be saved. Please try again." });
    } finally {
      profileBusy.current = false;
      setProfilePending(false);
    }
  }

  async function submitWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (workspaceBusy.current || !canManageWorkspace) return;
    const parsed = workspaceSettingsSchema.safeParse({
      name: workspaceName,
      reportingCurrency,
      reportingTimezone,
    });
    if (!parsed.success) {
      setWorkspaceFeedback({ tone: "error", message: parsed.error.issues[0]?.message ?? "Enter valid settings." });
      return;
    }

    workspaceBusy.current = true;
    setWorkspacePending(true);
    setWorkspaceFeedback(null);
    try {
      const result = await saveWorkspaceSettings(parsed.data);
      if ("error" in result) {
        setWorkspaceFeedback({ tone: "error", message: result.error });
        return;
      }
      const saved = parsed.data;
      setWorkspaceName(saved.name);
      setReportingCurrency(saved.reportingCurrency);
      setReportingTimezone(saved.reportingTimezone);
      setSavedWorkspace(saved);
      setWorkspaceFeedback({ tone: "success", message: "Workspace settings saved." });
      router.refresh();
    } catch {
      setWorkspaceFeedback({ tone: "error", message: "Workspace settings could not be saved. Please try again." });
    } finally {
      workspaceBusy.current = false;
      setWorkspacePending(false);
    }
  }

  function resetProfile() {
    setFullName(savedFullName);
    setProfileFeedback(null);
  }

  function resetWorkspace() {
    setWorkspaceName(savedWorkspace.name);
    setReportingCurrency(savedWorkspace.reportingCurrency);
    setReportingTimezone(savedWorkspace.reportingTimezone);
    setWorkspaceFeedback(null);
  }

  return (
    <div className="settings-page">
      <header className="settings-page-heading">
        <div>
          <p className="eyebrow">PREFERENCES & ACCESS</p>
          <h1>Settings</h1>
          <p>Manage your account, workspace reporting, and appearance.</p>
        </div>
        <span className="settings-role-note">{initialData.role[0]?.toUpperCase()}{initialData.role.slice(1)} access</span>
      </header>

      <div className="settings-layout">
        <nav aria-label="Settings sections" className="settings-nav">
          <a aria-current={activeSection === "profile" ? "location" : undefined} className={activeSection === "profile" ? "settings-nav-active" : undefined} href="#profile" onClick={() => setActiveSection("profile")}><UserRound aria-hidden="true" size={16} /> My Profile</a>
          <a aria-current={activeSection === "workspace" ? "location" : undefined} className={activeSection === "workspace" ? "settings-nav-active" : undefined} href="#workspace" onClick={() => setActiveSection("workspace")}><Building2 aria-hidden="true" size={16} /> Workspace</a>
          <a aria-current={activeSection === "regional" ? "location" : undefined} className={activeSection === "regional" ? "settings-nav-active" : undefined} href="#regional" onClick={() => setActiveSection("regional")}><Globe2 aria-hidden="true" size={16} /> Regional Preferences</a>
          <a aria-current={activeSection === "appearance" ? "location" : undefined} className={activeSection === "appearance" ? "settings-nav-active" : undefined} href="#appearance" onClick={() => setActiveSection("appearance")}><Sun aria-hidden="true" size={16} /> Appearance</a>
          <a aria-current={activeSection === "security" ? "location" : undefined} className={activeSection === "security" ? "settings-nav-active" : undefined} href="#security" onClick={() => setActiveSection("security")}><ShieldCheck aria-hidden="true" size={16} /> Account & Security</a>
        </nav>

        <div className="settings-sections">
          <div className="settings-card-anchor" id="profile">
            <Surface className="settings-card">
              <div className="settings-card-heading">
                <span className="settings-section-icon"><UserRound aria-hidden="true" size={18} /></span>
                <div>
                  <h2>My Profile</h2>
                  <p>Update the name associated with your account.</p>
                </div>
              </div>
              <form className="settings-form" onSubmit={(event) => void submitProfile(event)}>
                <label className="settings-field">
                  <span>Full name</span>
                  <input
                    autoComplete="name"
                    maxLength={200}
                    onChange={(event) => {
                      setFullName(event.target.value);
                      setProfileFeedback(null);
                    }}
                    required
                    value={fullName}
                  />
                </label>
                <label className="settings-field">
                  <span>Email address</span>
                  <input disabled readOnly type="email" value={initialData.email} />
                  <small>Email changes are not currently supported from Settings.</small>
                </label>
                <FeedbackMessage feedback={profileFeedback} />
                <div className="settings-form-actions">
                  {profileDirty ? (
                    <Button disabled={profilePending} onClick={resetProfile} type="button">Discard</Button>
                  ) : null}
                  <Button disabled={profilePending || !profileDirty} type="submit" variant="primary">
                    <Save aria-hidden="true" size={15} /> {profilePending ? "Saving…" : "Save profile"}
                  </Button>
                </div>
              </form>
            </Surface>
          </div>

          <div className="settings-card-anchor" id="workspace">
            <Surface className="settings-card">
              <div className="settings-card-heading">
                <span className="settings-section-icon"><Building2 aria-hidden="true" size={18} /></span>
                <div>
                  <h2>Workspace Settings</h2>
                  <p>Workspace identity and reporting configuration.</p>
                </div>
              </div>
              {!canManageWorkspace ? (
                <p className="settings-permission-note">
                  <ShieldCheck aria-hidden="true" size={16} />
                  Workspace settings are read-only for your {initialData.role} role. An owner or admin can edit these values.
                </p>
              ) : null}
              <form className="settings-form settings-workspace-form" onSubmit={(event) => void submitWorkspace(event)}>
                <label className="settings-field">
                  <span>Workspace name</span>
                  <input
                    disabled={!canManageWorkspace || workspacePending}
                    maxLength={120}
                    onChange={(event) => {
                      setWorkspaceName(event.target.value);
                      setWorkspaceFeedback(null);
                    }}
                    required
                    value={workspaceName}
                  />
                </label>
                <div className="settings-regional-group" id="regional">
                  <div className="settings-regional-heading">
                    <Globe2 aria-hidden="true" className="settings-regional-icon" size={17} />
                    <div>
                      <h3>Regional Preferences</h3>
                      <p>These settings control currency formatting and date boundaries in Analytics.</p>
                    </div>
                  </div>
                  <div className="settings-regional-fields">
                    <label className="settings-field">
                      <span>Reporting currency</span>
                      <input
                        autoCapitalize="characters"
                        disabled={!canManageWorkspace || workspacePending}
                        maxLength={3}
                        onChange={(event) => {
                          setReportingCurrency(event.target.value.toUpperCase());
                          setWorkspaceFeedback(null);
                        }}
                        pattern="[A-Z]{3}"
                        required
                        value={reportingCurrency}
                      />
                      <small>Enter an active ISO 4217 currency code, for example USD.</small>
                    </label>
                    <label className="settings-field">
                      <span>Reporting time zone</span>
                      <input
                        disabled={!canManageWorkspace || workspacePending}
                        maxLength={100}
                        onChange={(event) => {
                          setReportingTimezone(event.target.value);
                          setWorkspaceFeedback(null);
                        }}
                        required
                        value={reportingTimezone}
                      />
                      <small>Use an IANA time zone, for example America/Los_Angeles.</small>
                    </label>
                  </div>
                </div>
                {canManageWorkspace ? (
                  <>
                    <FeedbackMessage feedback={workspaceFeedback} />
                    <div className="settings-form-actions">
                      {workspaceDirty ? (
                        <Button disabled={workspacePending} onClick={resetWorkspace} type="button">Discard</Button>
                      ) : null}
                      <Button disabled={workspacePending || !workspaceDirty} type="submit" variant="primary">
                        <Save aria-hidden="true" size={15} /> {workspacePending ? "Saving…" : "Save workspace settings"}
                      </Button>
                    </div>
                  </>
                ) : null}
              </form>
            </Surface>
          </div>

          <div className="settings-card-anchor" id="appearance">
            <Surface className="settings-card">
              <div className="settings-card-heading">
                <span className="settings-section-icon"><Sun aria-hidden="true" size={18} /></span>
                <div>
                  <h2>Appearance</h2>
                  <p>Choose how Nexus Analytics looks on this device.</p>
                </div>
              </div>
              <fieldset className="settings-theme-options">
                <legend>Color theme</legend>
                {([
                  { value: "system", label: "System", Icon: Monitor, description: "Follow your device" },
                  { value: "light", label: "Light", Icon: Sun, description: "Bright workspace" },
                  { value: "dark", label: "Dark", Icon: Moon, description: "Low-light workspace" },
                ] as const).map(({ value, label, Icon, description }) => (
                  <label
                    className={`settings-theme-option${displayedPreference === value ? " is-selected" : ""}`}
                    key={value}
                  >
                    <input
                      checked={displayedPreference === value}
                      name="theme"
                      onChange={() => setPreference(value)}
                      type="radio"
                      value={value}
                    />
                    <Icon aria-hidden="true" size={18} />
                    <span><strong>{label}</strong><small>{description}</small></span>
                  </label>
                ))}
              </fieldset>
              <p className="settings-inline-note">Your appearance choice is saved locally in this browser.</p>
            </Surface>
          </div>

          <div className="settings-card-anchor" id="security">
            <Surface className="settings-card">
              <div className="settings-card-heading">
                <span className="settings-section-icon"><ShieldCheck aria-hidden="true" size={18} /></span>
                <div>
                  <h2>Account & Security</h2>
                  <p>Review your sign-in details and account recovery options.</p>
                </div>
              </div>
              <dl className="settings-security-list">
                <div><dt>Email verification</dt><dd>{initialData.emailConfirmedAt ? "Verified" : "Not verified"}</dd></div>
                <div><dt>Account created</dt><dd>{formattedDate(initialData.accountCreatedAt)}</dd></div>
              </dl>
              <div className="settings-security-action">
                <div><strong>Password</strong><p>Request a secure password reset link to your email.</p></div>
                <Link className="button button-secondary" href="/forgot-password">Reset password</Link>
              </div>
            </Surface>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading settings" className="settings-page">
      <div className="settings-page-heading">
        <div className="loading-heading">
          <Skeleton className="loading-line loading-line-short" />
          <Skeleton className="loading-line loading-line-title" />
          <Skeleton className="loading-line loading-line-long" />
        </div>
      </div>
      <div className="settings-loading-grid">
        {[1, 2, 3].map((item) => (
          <Surface className="settings-card" key={item}>
            <Skeleton className="loading-line loading-line-title" />
            <Skeleton className="loading-line loading-line-long" />
            <Skeleton className="loading-line loading-line-long" />
          </Surface>
        ))}
      </div>
    </div>
  );
}
