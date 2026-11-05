"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { selectWorkspaceAction } from "@/app/actions/workspaces";
import type { WorkspaceSummary } from "@/lib/workspaces/list";

export function AutoSelectWorkspace({
  workspace,
}: {
  workspace: WorkspaceSummary;
}) {
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const formData = new FormData();
    formData.set("workspaceId", workspace.id);
    void selectWorkspaceAction(formData).catch(() => setFailed(true));
  }, [workspace.id]);

  return (
    <main className="workspace-selection-page">
      <section aria-live="polite" className="workspace-selection-card">
        {failed ? (
          <>
            <p className="form-message form-message-error" role="alert">
              We couldn’t open your workspace. Please refresh and try again.
            </p>
          </>
        ) : (
          <>
            <LoaderCircle aria-hidden="true" className="auth-spinner workspace-loader" size={24} />
            <h1>Opening {workspace.name}</h1>
            <p className="auth-description">Preparing your workspace…</p>
          </>
        )}
      </section>
    </main>
  );
}
