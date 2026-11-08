"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";
import { selectWorkspaceAction } from "@/app/actions/workspaces";
import type { WorkspaceSummary } from "@/lib/workspaces/list";
import { Button } from "@/components/ui";

function SelectWorkspaceButton() {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant="secondary">
      {pending ? <LoaderCircle aria-hidden="true" className="auth-spinner" size={15} /> : null}
      {pending ? "Opening…" : "Open workspace"}
    </Button>
  );
}

export function WorkspaceSelectForm({ workspace }: { workspace: WorkspaceSummary }) {
  return (
    <form action={selectWorkspaceAction}>
      <input name="workspaceId" type="hidden" value={workspace.id} />
      <div className="workspace-option-copy">
        <strong>{workspace.name}</strong>
        <span>{workspace.role[0].toUpperCase() + workspace.role.slice(1)}</span>
      </div>
      <SelectWorkspaceButton />
    </form>
  );
}
