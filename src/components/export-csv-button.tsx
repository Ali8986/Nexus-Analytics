"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";

export function ExportCsvButton({
  endpoint,
  label = "Export CSV",
  disabled = false,
}: {
  endpoint: string;
  label?: string;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function exportCsv() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, { method: "GET", credentials: "same-origin" });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error || "The export could not be generated. Please try again.");
      }

      const filename = response.headers
        .get("Content-Disposition")
        ?.match(/filename="([^"]+)"/)?.[1];
      if (!filename) throw new Error("The export response did not include a filename.");

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      const notice = response.headers.get("X-Export-Notice");
      setMessage(notice ? `CSV export downloaded. ${notice}` : "CSV export downloaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The export could not be generated. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="export-action">
      <Button
        className="export-button"
        disabled={pending || disabled}
        onClick={() => void exportCsv()}
        type="button"
        variant="primary"
      >
        {pending ? <LoaderCircle aria-hidden="true" className="export-spinner" size={16} /> : <Download aria-hidden="true" size={16} />}
        <span>{pending ? "Preparing…" : label}</span>
      </Button>
      <span aria-live="polite" className="export-feedback" role={message ? "status" : undefined}>
        {message}
      </span>
    </div>
  );
}
