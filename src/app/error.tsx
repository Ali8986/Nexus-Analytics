"use client";

import { AlertTriangle } from "lucide-react";
import { ErrorState, Surface } from "@/components/ui";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="route-error-page">
      <Surface className="route-error-card">
        <span className="route-error-icon"><AlertTriangle size={20} /></span>
        <ErrorState
          description="This page couldn't be loaded. Please try again."
          onRetry={reset}
          title="We hit a snag"
        />
      </Surface>
    </div>
  );
}
