"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/bmh-ds";

import { setRoleGroupAccess } from "../actions";

type Program = {
  id: string;
  title: string;
  isPublished: boolean;
  direct: boolean;
};

type Course = {
  id: string;
  title: string;
  isPublished: boolean;
  direct: boolean;
  inherited: boolean;
};

export function RoleGroupAccessEditor({
  roleGroupId,
  protectedGroup,
  programs: initialPrograms,
  courses: initialCourses,
}: {
  roleGroupId: string;
  protectedGroup: boolean;
  programs: Program[];
  courses: Course[];
}) {
  const [programs, setPrograms] = useState(initialPrograms);
  const [courses, setCourses] = useState(initialCourses);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(scope: "program" | "course", targetId: string, enabled: boolean) {
    if (protectedGroup) return;
    const key = `${scope}:${targetId}`;
    const previousPrograms = programs;
    const previousCourses = courses;
    if (scope === "program") {
      setPrograms((current) => current.map((item) => item.id === targetId ? { ...item, direct: enabled } : item));
    } else {
      setCourses((current) => current.map((item) => item.id === targetId ? { ...item, direct: enabled } : item));
    }
    setPendingKey(key);
    startTransition(async () => {
      const result = await setRoleGroupAccess({
        roleGroupId,
        scope,
        targetId,
        enabled,
      });
      setPendingKey(null);
      if (!result.ok) {
        setPrograms(previousPrograms);
        setCourses(previousCourses);
        toast.error(result.error);
      } else {
        toast.success(enabled ? "Access granted." : "Access removed.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-7">
      <AccessList
        title="Programs"
        empty="No programs yet."
        items={programs}
        protectedGroup={protectedGroup}
        pendingKey={pendingKey}
        onToggle={(id, enabled) => toggle("program", id, enabled)}
      />
      <AccessList
        title="Courses"
        empty="No courses yet."
        items={courses}
        protectedGroup={protectedGroup}
        pendingKey={pendingKey}
        onToggle={(id, enabled) => toggle("course", id, enabled)}
      />
    </div>
  );
}

function AccessList({
  title,
  empty,
  items,
  protectedGroup,
  pendingKey,
  onToggle,
}: {
  title: string;
  empty: string;
  items: Array<Program | Course>;
  protectedGroup: boolean;
  pendingKey: string | null;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 font-[family-name:var(--font-display)] text-lg font-bold text-[var(--ink-900)]">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm font-semibold text-[var(--text-muted)]">{empty}</p>
      ) : (
        <div className="divide-y divide-[var(--border-hairline)] rounded-[var(--bmh-radius-md)] border border-[var(--border-card)]">
          {items.map((item) => {
            const course = "inherited" in item ? item : null;
            const disabled = protectedGroup || pendingKey !== null;
            return (
              <label key={item.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-[var(--ink-900)]">{item.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone={item.isPublished ? "green" : "neutral"} size="sm">
                      {item.isPublished ? "Published" : "Draft"}
                    </Badge>
                    {course?.inherited && !course.direct ? <Badge tone="blue" size="sm">Inherited from program</Badge> : null}
                    {course?.direct ? <Badge tone="solid" size="sm">Direct grant</Badge> : null}
                  </span>
                </span>
                <input
                  type="checkbox"
                  aria-label={`Grant ${title.toLowerCase()} access: ${item.title}`}
                  checked={item.direct}
                  disabled={disabled}
                  onChange={(event) => onToggle(item.id, event.target.checked)}
                  className="size-5 shrink-0 accent-[var(--action)]"
                />
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
