import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import {
  AssignmentRunner,
  type AssignmentDescriptor,
  type PriorSubmission,
} from "./assignment-runner";
import { submitAssignment } from "./assignment-actions";

const refreshSpy = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshSpy }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("./assignment-actions", () => ({
  submitAssignment: vi.fn(),
}));

vi.mock("@/components/file-upload", () => ({
  FileUpload: ({
    onUploaded,
  }: {
    onUploaded: (file: {
      file_path: string;
      filename: string;
      size_bytes: number;
      mime_type: string;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onUploaded({
          file_path: "learner-1/assignment.pdf",
          filename: "assignment.pdf",
          size_bytes: 10,
          mime_type: "application/pdf",
        })
      }
    >
      Upload fixture file
    </button>
  ),
}));

const baseAssignment: AssignmentDescriptor = {
  id: "assignment-1",
  title: "Practice your opening",
  instructions: "Record your opening and explain the choices you made.",
  submission_type: "text",
  requires_review: true,
};

function renderRunner(
  assignment: AssignmentDescriptor = baseAssignment,
  priorSubmissions: PriorSubmission[] = [],
) {
  return render(
    <AssignmentRunner
      lessonId="lesson-1"
      assignment={assignment}
      priorSubmissions={priorSubmissions}
    />,
  );
}

describe("<AssignmentRunner />", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshSpy.mockClear();
    vi.mocked(submitAssignment).mockResolvedValue({ ok: true });
  });

  it("submits the same text payload from the branded form", async () => {
    const user = userEvent.setup();
    renderRunner();

    await user.type(screen.getByLabelText("Response"), "My practice response");
    await user.click(screen.getByRole("button", { name: "Submit for review" }));

    await waitFor(() =>
      expect(submitAssignment).toHaveBeenCalledWith({
        assignmentId: "assignment-1",
        lessonId: "lesson-1",
        submission_type: "text",
        submission_text: "My practice response",
        submission_url: undefined,
        submission_file_path: undefined,
      }),
    );
  });

  it("shows a stable error when the server action rejects unexpectedly", async () => {
    vi.mocked(submitAssignment).mockRejectedValueOnce(new Error("network failure"));
    const user = userEvent.setup();
    renderRunner();
    await user.type(screen.getByLabelText("Response"), "My practice response");
    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      "Submission could not be confirmed. Check your connection and try again.",
    ));
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it("preserves URL and file submission payloads", async () => {
    const user = userEvent.setup();
    const { unmount } = renderRunner({
      ...baseAssignment,
      submission_type: "url",
    });

    await user.type(screen.getByLabelText("URL"), "https://example.com/practice");
    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() =>
      expect(submitAssignment).toHaveBeenLastCalledWith(
        expect.objectContaining({
          submission_type: "url",
          submission_url: "https://example.com/practice",
        }),
      ),
    );

    unmount();
    renderRunner({ ...baseAssignment, submission_type: "file_upload" });
    await user.click(screen.getByRole("button", { name: "Upload fixture file" }));
    expect(screen.getByText("Selected: assignment.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() =>
      expect(submitAssignment).toHaveBeenLastCalledWith(
        expect.objectContaining({
          submission_type: "file_upload",
          submission_file_path: "learner-1/assignment.pdf",
        }),
      ),
    );
  });

  it("shows pending review and hides resubmission until a decision", () => {
    renderRunner(baseAssignment, [
      {
        id: "submission-1",
        status: "submitted",
        submitted_at: "2026-07-16T10:00:00.000Z",
        reviewer_notes: null,
        submission_text: "My submitted response",
        submission_url: null,
        submission_file_path: null,
      },
    ]);

    expect(
      screen.getByRole("heading", { name: "Submitted, awaiting review" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Andrea" })).toHaveAttribute(
      "src",
      "/brand/mascot/face-content.png",
    );
    expect(screen.queryByRole("button", { name: "Submit for review" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Response")).not.toBeInTheDocument();
  });

  it("celebrates approval and hides the submission form", () => {
    renderRunner(baseAssignment, [
      {
        id: "submission-1",
        status: "approved",
        submitted_at: "2026-07-16T10:00:00.000Z",
        reviewer_notes: null,
        submission_text: "My approved response",
        submission_url: null,
        submission_file_path: null,
      },
    ]);

    expect(screen.getByRole("heading", { name: "Approved" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Andrea" })).toHaveAttribute(
      "src",
      "/brand/mascot/face-laugh.png",
    );
    expect(screen.queryByLabelText("Response")).not.toBeInTheDocument();
  });

  it("pairs a worried revision state with the reviewer note and resubmit action", () => {
    renderRunner(baseAssignment, [
      {
        id: "submission-1",
        status: "needs_revision",
        submitted_at: "2026-07-16T10:00:00.000Z",
        reviewer_notes: "Mirror the agent's words before you reframe.",
        submission_text: "My original response",
        submission_url: null,
        submission_file_path: null,
      },
    ]);

    expect(screen.getByRole("heading", { name: "Needs revision" })).toBeInTheDocument();
    expect(screen.getByText("Reviewer note")).toBeInTheDocument();
    expect(
      screen.getAllByText("Mirror the agent's words before you reframe."),
    ).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Andrea" })).toHaveAttribute(
      "src",
      "/brand/mascot/face-worried.png",
    );
    expect(screen.getByRole("button", { name: "Resubmit for review" })).toBeInTheDocument();
    expect(screen.getByLabelText("Response")).toHaveValue("My original response");
  });

  it("prefills URL and file submissions when an admin requests a revision", () => {
    const { unmount } = renderRunner(
      { ...baseAssignment, submission_type: "url" },
      [
        {
          id: "submission-1",
          status: "needs_revision",
          submitted_at: "2026-07-16T10:00:00.000Z",
          reviewer_notes: "Use the share link.",
          submission_text: null,
          submission_url: "https://example.com/original",
          submission_file_path: null,
        },
      ],
    );

    expect(screen.getByLabelText("URL")).toHaveValue("https://example.com/original");

    unmount();
    renderRunner(
      { ...baseAssignment, submission_type: "file_upload" },
      [
        {
          id: "submission-2",
          status: "needs_revision",
          submitted_at: "2026-07-16T11:00:00.000Z",
          reviewer_notes: "Replace page two.",
          submission_text: null,
          submission_url: null,
          submission_file_path: "learner-1/original-assignment.pdf",
        },
      ],
    );

    expect(screen.getByText("Selected: original-assignment.pdf")).toBeInTheDocument();
  });
});
