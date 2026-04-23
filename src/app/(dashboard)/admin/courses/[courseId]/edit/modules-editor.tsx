"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="flex flex-col gap-6">
      {modules.length === 0 ? (
        <p className="text-muted-foreground text-sm">No modules yet.</p>
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

      <div className="border-border flex items-end gap-3 border-t pt-4">
        <div className="flex-1">
          <label
            htmlFor="new-module-title"
            className="text-muted-foreground mb-1 block text-xs"
          >
            Add a module
          </label>
          <Input
            id="new-module-title"
            value={newModuleTitle}
            onChange={(e) => setNewModuleTitle(e.target.value)}
            placeholder="Module title"
          />
        </div>
        <Button onClick={onCreateModule} disabled={pending}>
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
    <div className="border-border rounded-md border">
      <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex flex-1 items-center gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={onSaveTitle}
            className="max-w-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={!canMoveUp || pending}
            onClick={() => onMove("up")}
            aria-label="Move up"
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={!canMoveDown || pending}
            onClick={() => onMove("down")}
            aria-label="Move down"
          >
            <ArrowDown className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={pending}
            onClick={onDelete}
            aria-label="Delete module"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="p-4">
        {mod.lessons.length === 0 ? (
          <p className="text-muted-foreground text-xs">No lessons yet.</p>
        ) : (
          <ol className="divide-border mb-3 divide-y">
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

        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <div className="flex-1">
            <label
              htmlFor={`new-lesson-${mod.id}`}
              className="text-muted-foreground mb-1 block text-xs"
            >
              Add lesson
            </label>
            <Input
              id={`new-lesson-${mod.id}`}
              value={newLessonTitle}
              onChange={(e) => setNewLessonTitle(e.target.value)}
              placeholder="Lesson title"
            />
          </div>
          <div>
            <label
              htmlFor={`new-lesson-type-${mod.id}`}
              className="text-muted-foreground mb-1 block text-xs"
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
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
            >
              <option value="content">Content</option>
              <option value="quiz">Quiz</option>
              <option value="assignment">Assignment</option>
            </select>
          </div>
          <Button variant="outline" onClick={onAddLesson} disabled={pending}>
            {pending ? "..." : "Add"}
          </Button>
        </div>
      </div>
    </div>
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
    <li className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span className="text-sm">{lesson.title}</span>
        <Badge variant="outline" className="capitalize">
          {lesson.lesson_type}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        <Link
          href={`/admin/lessons/${lesson.id}/edit`}
          className="text-xs underline-offset-2 hover:underline"
        >
          Edit →
        </Link>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={!canMoveUp || pending}
          onClick={() => onMove("up")}
          aria-label="Move up"
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={!canMoveDown || pending}
          onClick={() => onMove("down")}
          aria-label="Move down"
        >
          <ArrowDown className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={pending}
          onClick={onDelete}
          aria-label="Delete lesson"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}
