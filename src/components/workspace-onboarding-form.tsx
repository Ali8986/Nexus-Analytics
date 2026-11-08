"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createWorkspaceAction,
  type WorkspaceCreationState,
} from "@/app/actions/workspaces";
import { Button } from "@/components/ui";

const initialState: WorkspaceCreationState = {};

export function WorkspaceOnboardingForm({ fullName }: { fullName: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    createWorkspaceAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) router.replace("/");
  }, [router, state.success]);

  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <span className="onboarding-mark" aria-hidden="true">✦</span>
        <p className="auth-eyebrow">YOUR BUSINESS, IN ONE PLACE</p>
        <h1>Welcome, {fullName}</h1>
        <p className="auth-description">
          Create a workspace to bring your orders, customers, and product insights together.
        </p>
        <div className="onboarding-explainer">
          <strong>What’s a workspace?</strong>
          <p>
            It’s a private home for your business data and the people you choose to work with.
            You’ll be its Owner.
          </p>
        </div>
        <form action={action} aria-busy={pending} className="auth-form">
          <fieldset className="auth-pending-fields" disabled={pending}>
            <div className="auth-field">
              <label htmlFor="workspace-name">Workspace name</label>
              <input
                autoComplete="organization"
                autoFocus
                id="workspace-name"
                maxLength={120}
                name="name"
                placeholder="e.g. Northstar Goods"
                required
              />
            </div>
          </fieldset>
          <p className="auth-field-hint">
            Default reporting settings: USD · UTC. You can adjust these later.
          </p>
          {state.error ? (
            <p className="form-message form-message-error" role="alert">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="form-message form-message-success" role="status">
              Workspace created. Opening your dashboard…
            </p>
          ) : null}
          <Button className="auth-submit" disabled={pending} type="submit" variant="primary">
            {pending ? (
              <LoaderCircle aria-hidden="true" className="auth-spinner" size={16} />
            ) : (
              <ArrowRight aria-hidden="true" size={16} />
            )}
            {pending ? "Creating workspace…" : "Create workspace"}
          </Button>
        </form>
      </section>
    </main>
  );
}
