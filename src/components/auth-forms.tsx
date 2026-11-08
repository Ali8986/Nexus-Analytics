"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  loginSchema,
  passwordRecoverySchema,
  passwordResetSchema,
  signupSchema,
} from "@/lib/validation/schemas";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

type AuthMessage = Readonly<{
  text: string;
  tone: "error" | "success";
}>;

function firstIssue(error: { issues: readonly { message: string }[] }): string {
  return error.issues[0]?.message ?? "Check the information and try again.";
}

function friendlyAuthError(error: unknown, operation: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 429
  ) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "weak_password"
  ) {
    return "Choose a stronger password and try again.";
  }
  if (operation === "login") return "Email or password is incorrect.";
  if (operation === "signup") return "We couldn’t create your account. Check your details and try again.";
  if (operation === "recovery") return "We couldn’t process that request. Please try again.";
  return "We couldn’t update your password. Please try again.";
}

function FormMessage({ message }: { message: AuthMessage | null }) {
  if (!message) return null;
  return (
    <p
      className={`form-message form-message-${message.tone}`}
      role={message.tone === "error" ? "alert" : "status"}
    >
      {message.text}
    </p>
  );
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input-wrap">
        <input
          autoComplete={autoComplete}
          id={id}
          name={id}
          onChange={(event) => onChange(event.target.value)}
          required
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={visible ? "Hide password" : "Show password"}
          className="password-visibility"
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </div>
  );
}

function SubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: string;
}) {
  return (
    <Button className="auth-submit" disabled={pending} type="submit" variant="primary">
      {pending ? <LoaderCircle aria-hidden="true" className="auth-spinner" size={16} /> : null}
      {pending ? "Please wait…" : children}
    </Button>
  );
}

export function LoginForm({ callbackError = false }: { callbackError?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const sourcePath = useRef(pathname);
  const [message, setMessage] = useState<AuthMessage | null>(
    callbackError
      ? { tone: "error", text: "That sign-in link has expired. Please sign in again." }
      : null,
  );

  useEffect(() => {
    if (pending && pathname !== sourcePath.current) {
      submitting.current = false;
      setPending(false);
    }
  }, [pathname, pending]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setMessage({ tone: "error", text: firstIssue(parsed.error) });
      return;
    }

    submitting.current = true;
    sourcePath.current = pathname;
    setPending(true);
    setMessage(null);
    try {
      const { error } = await createClient().auth.signInWithPassword(parsed.data);
      if (error) {
        submitting.current = false;
        setPending(false);
        setMessage({ tone: "error", text: friendlyAuthError(error, "login") });
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (error) {
      submitting.current = false;
      setPending(false);
      setMessage({ tone: "error", text: friendlyAuthError(error, "login") });
    }
  }

  return (
    <>
      <p className="auth-eyebrow">WELCOME BACK</p>
      <h1>Sign in to Nexus</h1>
      <p className="auth-description">Use your account to continue to your workspace.</p>
      <form aria-busy={pending} className="auth-form" onSubmit={submit}>
        <fieldset className="auth-pending-fields" disabled={pending}>
          <div className="auth-field">
            <label htmlFor="login-email">Email address</label>
            <input
              autoComplete="email"
              id="login-email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </div>
          <PasswordInput
            autoComplete="current-password"
            id="login-password"
            label="Password"
            onChange={setPassword}
            value={password}
          />
          <div className="auth-form-row auth-form-row-end">
            <Link
              aria-disabled={pending}
              className="text-link"
              href="/forgot-password"
              onClick={(event) => {
                if (pending) event.preventDefault();
              }}
              tabIndex={pending ? -1 : undefined}
            >
              Forgot password?
            </Link>
          </div>
        </fieldset>
        <FormMessage message={message} />
        {pending ? (
          <p aria-live="polite" className="auth-pending-message" role="status">
            <LoaderCircle aria-hidden="true" className="auth-spinner" size={15} />
            Opening your workspace…
          </p>
        ) : null}
        <SubmitButton pending={pending}>{pending ? "Signing you in…" : "Sign in"}</SubmitButton>
      </form>
      <p aria-disabled={pending} className="auth-switch">
        Don’t have an account?{" "}
        <Link
          aria-disabled={pending}
          href="/signup"
          onClick={(event) => {
            if (pending) event.preventDefault();
          }}
          tabIndex={pending ? -1 : undefined}
        >
          Create one
        </Link>
      </p>
    </>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<AuthMessage | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = signupSchema.safeParse({
      fullName,
      email,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      setMessage({ tone: "error", text: firstIssue(parsed.error) });
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const origin = window.location.origin;
      const { data, error } = await createClient().auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          data: { full_name: parsed.data.fullName },
          emailRedirectTo: `${origin}/auth/callback?next=%2Fonboarding`,
        },
      });
      if (error) {
        setMessage({ tone: "error", text: friendlyAuthError(error, "signup") });
        return;
      }
      if (data.session) {
        router.replace("/onboarding");
        router.refresh();
      } else {
        setMessage({
          tone: "success",
          text: "Account created. Check your email to confirm your address, then sign in.",
        });
      }
    } catch (error) {
      setMessage({ tone: "error", text: friendlyAuthError(error, "signup") });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <p className="auth-eyebrow">GET STARTED</p>
      <h1>Create your account</h1>
      <p className="auth-description">A few details, then your workspace is ready to set up.</p>
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-field">
          <label htmlFor="signup-name">Full name</label>
          <input
            autoComplete="name"
            id="signup-name"
            name="fullName"
            onChange={(event) => setFullName(event.target.value)}
            required
            type="text"
            value={fullName}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="signup-email">Email address</label>
          <input
            autoComplete="email"
            id="signup-email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </div>
        <PasswordInput
          autoComplete="new-password"
          id="signup-password"
          label="Password"
          onChange={setPassword}
          value={password}
        />
        <PasswordInput
          autoComplete="new-password"
          id="signup-confirm-password"
          label="Confirm password"
          onChange={setConfirmPassword}
          value={confirmPassword}
        />
        <p className="auth-field-hint">Use at least 8 characters.</p>
        <FormMessage message={message} />
        <SubmitButton pending={pending}>Create account</SubmitButton>
      </form>
      <p className="auth-switch">
        Already have an account? <Link className="text-link" href="/login">Sign in</Link>
      </p>
    </>
  );
}

export function PasswordRecoveryForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<AuthMessage | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = passwordRecoverySchema.safeParse({ email });
    if (!parsed.success) {
      setMessage({ tone: "error", text: firstIssue(parsed.error) });
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(
        parsed.data.email,
        {
          redirectTo: `${window.location.origin}/auth/callback?next=%2Freset-password`,
        },
      );
      if (error) {
        setMessage({ tone: "error", text: friendlyAuthError(error, "recovery") });
      } else {
        setMessage({
          tone: "success",
          text: "If an account exists for that email, a password reset link is on its way.",
        });
      }
    } catch (error) {
      setMessage({ tone: "error", text: friendlyAuthError(error, "recovery") });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <p className="auth-eyebrow">ACCOUNT RECOVERY</p>
      <h1>Forgot your password?</h1>
      <p className="auth-description">
        Enter the email address associated with your account and we’ll send a reset link.
      </p>
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-field">
          <label htmlFor="recovery-email">Email address</label>
          <input
            autoComplete="email"
            id="recovery-email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </div>
        <FormMessage message={message} />
        <SubmitButton pending={pending}>Send reset link</SubmitButton>
      </form>
      <p className="auth-switch">
        Remember your password? <Link className="text-link" href="/login">Back to sign in</Link>
      </p>
    </>
  );
}

export function PasswordResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<AuthMessage | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = passwordResetSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      setMessage({ tone: "error", text: firstIssue(parsed.error) });
      return;
    }

    setPending(true);
    setMessage(null);
    try {
      const { error } = await createClient().auth.updateUser({
        password: parsed.data.password,
      });
      if (error) {
        setMessage({ tone: "error", text: friendlyAuthError(error, "reset") });
        return;
      }
      setMessage({ tone: "success", text: "Password updated. Opening your account…" });
      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: friendlyAuthError(error, "reset") });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <p className="auth-eyebrow">SECURE YOUR ACCOUNT</p>
      <h1>Choose a new password</h1>
      <p className="auth-description">Use at least 8 characters for your new password.</p>
      <form className="auth-form" onSubmit={submit}>
        <PasswordInput
          autoComplete="new-password"
          id="reset-password"
          label="New password"
          onChange={setPassword}
          value={password}
        />
        <PasswordInput
          autoComplete="new-password"
          id="reset-confirm-password"
          label="Confirm new password"
          onChange={setConfirmPassword}
          value={confirmPassword}
        />
        <FormMessage message={message} />
        <SubmitButton pending={pending}>Update password</SubmitButton>
      </form>
    </>
  );
}
