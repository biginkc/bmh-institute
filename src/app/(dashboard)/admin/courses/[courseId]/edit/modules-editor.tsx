"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  ListChecks,
  PenLine,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge, Button, Card, IconButton, Input } from "@/components/bmh-ds";
import type { ModuleWithLessons } from "@/lib/courses/shape";

import {
  createLesson,
  createModule,
  deleteLesson,
  deleteModule,
  moveLesson,
  moveModule,
  updateModule,
} from "../../actions";

export function ModulesEditor({
  courseId,
  modules,
}: {
  courseId: string;
  modules: ModuleWithLessons[];
}) {
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [pending, startTransition] = useTransition();

  function onCreateModule() {
    const title = newModuleTitle.trim();
    if (!title) {
      toast.error("Module title is required.");
      return;
    }
    startTransition(async () => {
      const result = await createModule({ courseId, title });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Module added.");
        setNewModuleTitle("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {modules.length === 0 ? (
        <p className="font-[family-name:var(--font-body)] text-sm font-semibold text-[var(--text-muted)]">
          No modules yet.
        </p>
      ) : (
        modules.map((mod, idx) => (
          <ModuleCard
            key={mod.id}
            courseId={courseId}
            module={mod}
            canMoveUp={idx > 0}
            canMoveDown={idx < modules.length - 1}
            pending={pending}
            startTransition={startTransition}
          />
        ))
      )}

      <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] pt-5 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            id="new-module-title"
            label="Add a module"
            value={newModuleTitle}
            onChange={(e) => setNewModuleTitle(e.target.value)}
            placeholder="Module title"
          />
        </div>
        <Button
          onClick={onCreateModule}
          disabled={pending}
          iconLeft={<Plus className="size-4" aria-hidden />}
        >
          {pending ? "Saving..." : "Add module"}
        </Button>
      </div>
    </div>
  );
}

function ModuleCard({
  courseId,
  module: mod,
  canMoveUp,
  canMoveDown,
  pending,
  startTransition,
}: {
  courseId: string;
  module: ModuleWithLessons;
  canMoveUp: boolean;
  canMoveDown: boolean;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  const [title, setTitle] = useState(mod.title);
  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [newLessonType, setNewLessonType] = useState<
    "content" | "quiz" | "assignment"
  >("content");

  function onSaveTitle() {
    if (title === mod.title) return;
    startTransition(async () => {
      const result = await updateModule({
        moduleId: mod.id,
        courseId,
        title,
      });
      if (!result.ok) toast.error(result.error);
      else toast.success("Module renamed.");
    });
  }

  function onDelete() {
    if (
      !confirm(
        `Delete "${mod.title}"? All lessons inside it will also be removed.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteModule({
        moduleId: mod.id,
        courseId,
      });
      if (!result.ok) toast.error(result.error);
      else toast.success("Module removed.");
    });
  }

  function onMove(direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveModule({
        moduleId: mod.id,
        courseId,
        direction,
      });
      if (!result.ok) toast.error(result.error);
    });
  }

  function onAddLesson() {
    const t = newLessonTitle.trim();
    if (!t) {
      toast.error("Lesson title is required.");
      return;
    }
    startTransition(async () => {
      const result = await createLesson({
        moduleId: mod.id,
        courseId,
        title: t,
        lesson_type: newLessonType,
      });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Lesson added.");
        setNewLessonTitle("");
      }
    });
  }

  return (
    <Card padding="sm">
      <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-2 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={onSaveTitle}
            aria-label={`Module title: ${mod.title}`}
            size="sm"
          />
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            variant="plain"
            size="sm"
            label="Move module up"
            disabled={!canMoveUp || pending}
            onClick={() => onMove("up")}
          >
            <ArrowUp className="size-3.5" />
          </IconButton>
          <IconButton
            variant="plain"
            size="sm"
            label="Move module down"
            disabled={!canMoveDown || pending}
            onClick={() => onMove("down")}
          >
            <ArrowDown className="size-3.5" />
          </IconButton>
          <IconButton
            variant="plain"
            size="sm"
            label={`Delete module ${mod.title}`}
            disabled={pending}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </IconButton>
        </div>
      </div>

      <div className="px-2 pt-4">
        {mod.lessons.length === 0 ? (
          <p className="font-[family-name:var(--font-body)] text-xs font-semibold text-[var(--text-muted)]">
            No lessons yet.
          </p>
        ) : (
          <ol className="mb-4 divide-y divide-[var(--border-hairline)]">
            {mod.lessons.map((lesson, idx) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                moduleId={mod.id}
                courseId={courseId}
                canMoveUp={idx > 0}
                canMoveDown={idx < mod.lessons.length - 1}
                pending={pending}
                startTransition={startTransition}
              />
            ))}
          </ol>
        )}

        <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] pt-4 md:flex-row md:items-end">
          <div className="flex-1">
            <Input
              id={`new-lesson-${mod.id}`}
              label="Add lesson"
              value={newLessonTitle}
              onChange={(e) => setNewLessonTitle(e.target.value)}
              placeholder="Lesson title"
            />
          </div>
          <div>
            <label
              htmlFor={`new-lesson-type-${mod.id}`}
              className="mb-1.5 block font-[family-name:var(--font-body)] text-sm font-bold text-[var(--ink-800)]"
            >
              Type
            </label>
            <select
              id={`new-lesson-type-${mod.id}`}
              value={newLessonType}
              onChange={(e) =>
                setNewLessonType(
                  e.target.value as "content" | "quiz" | "assignment",
                )
              }
              className="min-h-[44px] rounded-[var(--bmh-radius-md)] border-2 border-[var(--ink-300)] bg-[var(--paper)] px-3 font-[family-name:var(--font-body)] text-sm font-bold text-[var(--ink-900)] outline-none focus-visible:border-[var(--action)] focus-visible:ring-4 focus-visible:ring-[var(--focus-ring)]"
            >
              <option value="content">Content</option>
              <option value="quiz">Quiz</option>
              <option value="assignment">Assignment</option>
            </select>
          </div>
          <Button
            variant="secondary"
            onClick={onAddLesson}
            disabled={pending}
            iconLeft={<Plus className="size-4" aria-hidden />}
          >
            {pending ? "Saving..." : "Add lesson"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function LessonRow({
  lesson,
  moduleId,
  courseId,
  canMoveUp,
  canMoveDown,
  pending,
  startTransition,
}: {
  lesson: ModuleWithLessons["lessons"][number];
  moduleId: string;
  courseId: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  function onDelete() {
    if (!confirm(`Delete "${lesson.title}"?`)) return;
    startTransition(async () => {
      const result = await deleteLesson({ lessonId: lesson.id, courseId });
      if (!result.ok) toast.error(result.error);
      else toast.success("Lesson removed.");
    });
  }

  function onMove(direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveLesson({
        lessonId: lesson.id,
        moduleId,
        courseId,
        direction,
      });
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--bmh-radius-sm)] bg-[var(--action-soft)] text-[var(--blue-600)]">
          <LessonTypeIcon type={lesson.lesson_type} />
        </span>
        <span className="truncate font-[family-name:var(--font-body)] text-sm font-bold text-[var(--ink-900)]">
          {lesson.title}
        </span>
        <Badge
          tone={lesson.lesson_type === "quiz" ? "blue" : lesson.lesson_type === "assignment" ? "orange" : "neutral"}
          size="sm"
        >
          {lesson.lesson_type === "content"
            ? "Content"
            : lesson.lesson_type === "quiz"
              ? "Quiz"
              : "Assignment"}
        </Badge>
      </div>
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
        <Link
          href={`/admin/lessons/${lesson.id}/edit`}
          aria-label={`Edit ${lesson.title}`}
          className="mr-1 font-[family-name:var(--font-body)] text-sm font-extrabold text-[var(--action)] hover:underline"
        >
          Edit
        </Link>
        <IconButton
          variant="plain"
          size="sm"
          label="Move lesson up"
          disabled={!canMoveUp || pending}
          onClick={() => onMove("up")}
        >
          <ArrowUp className="size-3.5" />
        </IconButton>
        <IconButton
          variant="plain"
          size="sm"
          label="Move lesson down"
          disabled={!canMoveDown || pending}
          onClick={() => onMove("down")}
        >
          <ArrowDown className="size-3.5" />
        </IconButton>
        <IconButton
          variant="plain"
          size="sm"
          label={`Delete lesson ${lesson.title}`}
          disabled={pending}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
    </li>
  );
}

function LessonTypeIcon({ type }: { type: string }) {
  if (type === "quiz") return <ListChecks className="size-4" aria-hidden />;
  if (type === "assignment") return <PenLine className="size-4" aria-hidden />;
  return <FileText className="size-4" aria-hidden />;
}
