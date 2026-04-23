"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  approveSubmission,
  createSubmissionDownloadUrl,
  requestRevision,
} from "./actions";

export function ReviewControls({
  submissionId,
  filePath,
}: {
  submissionId: string;
  filePath: string | null;
}) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function onApprove() {
    startTransition(async () => {
      const result = await approveSubmission({
        submissionId,
        note: note.trim() || undefined,
      });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Approved.");
        setNote("");
      }
    });
  }

  function onRequestRevision() {
    if (!note.trim()) {
      toast.error("Leave a note first.");
      return;
    }
    startTransition(async () => {
      const result = await requestRevision({
        submissionId,
        note: note.trim(),
      });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Sent back with note.");
        setNote("");
      }
    });
  }

  async function onDownload() {
    if (!filePath) return;
    const result = await createSubmissionDownloadUrl(filePath);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-2">
      {filePath ? (
        <Button variant="outline" size="sm" onClick={onDownload}>
          Open attached file
        </Button>
      ) : null}
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note to learner (optional for approve, required to request revision)"
      />
      <div className="flex gap-2">
        <Button onClick={onApprove} disabled={pending}>
          Approve
        </Button>
        <Button
          variant="outline"
          onClick={onRequestRevision}
          disabled={pending}
        >
          Request revision
        </Button>
      </div>
    </div>
  );
}
