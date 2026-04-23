"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  createAnswerOption,
  createQuestion,
  deleteAnswerOption,
  deleteQuestion,
  moveQuestion,
  updateAnswerOption,
  updateQuestion,
  updateQuizSettings,
} from "./quiz-actions";

export type QuizSettings = {
  id: string;
  title: string;
  description: string | null;
  passing_score: number;
  randomize_questions: boolean;
  randomize_answers: boolean;
  questions_per_attempt: number | null;
  max_attempts: number | null;
  retake_cooldown_hours: number;
  show_correct_answers_after: "never" | "after_pass" | "always";
};

export type QuestionRow = {
  id: string;
  question_text: string;
  question_type: "true_false" | "single_choice" | "multi_select";
  explanation: string | null;
  points: number;
  sort_order: number;
  answer_options: {
    id: string;
    option_text: string;
    is_correct: boolean;
    sort_order: number;
  }[];
};

export function QuizEditor({
  lessonId,
  quiz,
  questions,
}: {
  lessonId: string;
  quiz: QuizSettings;
  questions: QuestionRow[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <QuizSettingsEditor lessonId={lessonId} quiz={quiz} />
      <QuestionsEditor
        lessonId={lessonId}
        quizId={quiz.id}
        questions={questions}
      />
    </div>
  );
}

function QuizSettingsEditor({
  lessonId,
  quiz,
}: {
  lessonId: string;
  quiz: QuizSettings;
}) {
  const [title, setTitle] = useState(quiz.title);
  const [description, setDescription] = useState(quiz.description ?? "");
  const [passingScore, setPassingScore] = useState(quiz.passing_score);
  const [randomizeQ, setRandomizeQ] = useState(quiz.randomize_questions);
  const [randomizeA, setRandomizeA] = useState(quiz.randomize_answers);
  const [questionsPerAttempt, setQuestionsPerAttempt] = useState<number | "">(
    quiz.questions_per_attempt ?? "",
  );
  const [maxAttempts, setMaxAttempts] = useState<number | "">(
    quiz.max_attempts ?? "",
  );
  const [cooldown, setCooldown] = useState(quiz.retake_cooldown_hours);
  const [showAfter, setShowAfter] = useState(quiz.show_correct_answers_after);
  const [pending, startTransition] = useTransition();

  function onSave() {
    startTransition(async () => {
      const result = await updateQuizSettings({
        quizId: quiz.id,
        lessonId,
        title,
        description: description.trim() || null,
        passing_score: Number(passingScore) || 0,
        randomize_questions: randomizeQ,
        randomize_answers: randomizeA,
        questions_per_attempt:
          questionsPerAttempt === "" ? null : Number(questionsPerAttempt),
        max_attempts: maxAttempts === "" ? null : Number(maxAttempts),
        retake_cooldown_hours: Number(cooldown) || 0,
        show_correct_answers_after: showAfter,
      });
      if (!result.ok) toast.error(result.error);
      else toast.success("Quiz settings saved.");
    });
  }

  return (
    <div className="border-border rounded-md border p-4">
      <h3 className="mb-4 text-sm font-semibold">Quiz settings</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Title" htmlFor="q-title">
          <Input
            id="q-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Passing score (%)" htmlFor="q-pass">
          <Input
            id="q-pass"
            type="number"
            min={0}
            max={100}
            value={passingScore}
            onChange={(e) => setPassingScore(Number(e.target.value))}
          />
        </Field>
        <Field label="Description" htmlFor="q-desc" className="md:col-span-2">
          <textarea
            id="q-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Questions served per attempt" htmlFor="q-per">
          <Input
            id="q-per"
            type="number"
            min={1}
            value={questionsPerAttempt}
            onChange={(e) =>
              setQuestionsPerAttempt(
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
            placeholder="All questions"
          />
        </Field>
        <Field label="Max attempts (blank = unlimited)" htmlFor="q-max">
          <Input
            id="q-max"
            type="number"
            min={1}
            value={maxAttempts}
            onChange={(e) =>
              setMaxAttempts(
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
            placeholder="Unlimited"
          />
        </Field>
        <Field label="Retake cooldown (hours)" htmlFor="q-cool">
          <Input
            id="q-cool"
            type="number"
            min={0}
            value={cooldown}
            onChange={(e) => setCooldown(Number(e.target.value))}
          />
        </Field>
        <Field label="Show correct answers" htmlFor="q-show">
          <select
            id="q-show"
            value={showAfter}
            onChange={(e) =>
              setShowAfter(
                e.target.value as "never" | "after_pass" | "always",
              )
            }
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="never">Never</option>
            <option value="after_pass">After a passing attempt</option>
            <option value="always">Always</option>
          </select>
        </Field>
        <div className="flex items-center gap-2 md:col-span-2">
          <input
            id="q-rq"
            type="checkbox"
            checked={randomizeQ}
            onChange={(e) => setRandomizeQ(e.target.checked)}
            className="size-4"
          />
          <Label htmlFor="q-rq">Randomize question order</Label>
          <div className="w-4" />
          <input
            id="q-ra"
            type="checkbox"
            checked={randomizeA}
            onChange={(e) => setRandomizeA(e.target.checked)}
            className="size-4"
          />
          <Label htmlFor="q-ra">Randomize answer order</Label>
        </div>
      </div>
      <div className="mt-4">
        <Button onClick={onSave} disabled={pending}>
          {pending ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </div>
  );
}

function QuestionsEditor({
  lessonId,
  quizId,
  questions,
}: {
  lessonId: string;
  quizId: string;
  questions: QuestionRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [newType, setNewType] = useState<
    "true_false" | "single_choice" | "multi_select"
  >("single_choice");

  function onAdd() {
    startTransition(async () => {
      const result = await createQuestion({ quizId, lessonId, type: newType });
      if (!result.ok) toast.error(result.error);
      else toast.success("Question added.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold">Questions</h3>

      {questions.length === 0 ? (
        <p className="text-muted-foreground text-sm">No questions yet.</p>
      ) : (
        questions
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((q, idx) => (
            <QuestionCard
              key={q.id}
              question={q}
              lessonId={lessonId}
              quizId={quizId}
              index={idx}
              canMoveUp={idx > 0}
              canMoveDown={idx < questions.length - 1}
              pending={pending}
              startTransition={startTransition}
            />
          ))
      )}

      <div className="border-border flex items-end gap-2 border-t pt-4">
        <div>
          <Label htmlFor="new-q-type">New question type</Label>
          <select
            id="new-q-type"
            value={newType}
            onChange={(e) =>
              setNewType(
                e.target.value as "true_false" | "single_choice" | "multi_select",
              )
            }
            className="border-input bg-background mt-1 rounded-md border px-3 py-2 text-sm"
          >
            <option value="single_choice">Single choice</option>
            <option value="true_false">True / False</option>
            <option value="multi_select">Multi-select</option>
          </select>
        </div>
        <Button variant="outline" onClick={onAdd} disabled={pending}>
          <Plus className="size-3.5" />
          Add question
        </Button>
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  lessonId,
  quizId,
  index,
  canMoveUp,
  canMoveDown,
  pending,
  startTransition,
}: {
  question: QuestionRow;
  lessonId: string;
  quizId: string;
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  const [text, setText] = useState(question.question_text);
  const [explanation, setExplanation] = useState(question.explanation ?? "");
  const [points, setPoints] = useState(question.points);
  const [newOption, setNewOption] = useState("");

  function onSave() {
    startTransition(async () => {
      const result = await updateQuestion({
        questionId: question.id,
        lessonId,
        question_text: text,
        explanation: explanation.trim() || null,
        points: Number(points) || 1,
      });
      if (!result.ok) toast.error(result.error);
      else toast.success("Question saved.");
    });
  }

  function onDelete() {
    if (!confirm("Delete this question?")) return;
    startTransition(async () => {
      const result = await deleteQuestion({
        questionId: question.id,
        lessonId,
      });
      if (!result.ok) toast.error(result.error);
      else toast.success("Question removed.");
    });
  }

  function onMove(direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveQuestion({
        questionId: question.id,
        quizId,
        lessonId,
        direction,
      });
      if (!result.ok) toast.error(result.error);
    });
  }

  function onAddOption() {
    const t = newOption.trim();
    if (!t) {
      toast.error("Option text is required.");
      return;
    }
    if (question.question_type === "true_false") {
      toast.error("True/False questions have fixed options.");
      return;
    }
    startTransition(async () => {
      const result = await createAnswerOption({
        questionId: question.id,
        lessonId,
        text: t,
      });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success("Option added.");
        setNewOption("");
      }
    });
  }

  const sortedOptions = [...question.answer_options].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  return (
    <div className="border-border rounded-md border">
      <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm tabular-nums">
            Q{index + 1}
          </span>
          <Badge variant="secondary" className="capitalize">
            {question.question_type.replace("_", " ")}
          </Badge>
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
            aria-label="Delete question"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">
        <Field label="Question text" htmlFor={`qt-${question.id}`}>
          <textarea
            id={`qt-${question.id}`}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </Field>
        <div className="grid gap-3 md:grid-cols-4">
          <Field
            label="Explanation (shown after answering)"
            htmlFor={`ex-${question.id}`}
            className="md:col-span-3"
          >
            <Input
              id={`ex-${question.id}`}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </Field>
          <Field label="Points" htmlFor={`pt-${question.id}`}>
            <Input
              id={`pt-${question.id}`}
              type="number"
              min={0}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
            />
          </Field>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={onSave} disabled={pending}>
            Save question
          </Button>
        </div>

        <div className="mt-2">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Options
          </div>
          {sortedOptions.length === 0 ? (
            <p className="text-muted-foreground text-xs">No options yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sortedOptions.map((o) => (
                <OptionRow
                  key={o.id}
                  option={o}
                  questionType={question.question_type}
                  peerOptionIds={sortedOptions
                    .filter((s) => s.id !== o.id)
                    .map((s) => s.id)}
                  lessonId={lessonId}
                  pending={pending}
                  startTransition={startTransition}
                />
              ))}
            </ul>
          )}

          {question.question_type !== "true_false" ? (
            <div className="mt-3 flex gap-2">
              <Input
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                placeholder="New option"
              />
              <Button variant="outline" onClick={onAddOption} disabled={pending}>
                Add option
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OptionRow({
  option,
  questionType,
  peerOptionIds,
  lessonId,
  pending,
  startTransition,
}: {
  option: QuestionRow["answer_options"][number];
  questionType: QuestionRow["question_type"];
  peerOptionIds: string[];
  lessonId: string;
  pending: boolean;
  startTransition: (cb: () => void | Promise<void>) => void;
}) {
  const [text, setText] = useState(option.option_text);
  const [correct, setCorrect] = useState(option.is_correct);
  const isRadio = questionType !== "multi_select";

  function save(nextCorrect = correct) {
    startTransition(async () => {
      const result = await updateAnswerOption({
        optionId: option.id,
        lessonId,
        text,
        is_correct: nextCorrect,
        exclusivePeerOptionIds: isRadio && nextCorrect ? peerOptionIds : [],
      });
      if (!result.ok) toast.error(result.error);
    });
  }

  function onCorrectChange(checked: boolean) {
    setCorrect(checked);
    save(checked);
  }

  function onDelete() {
    if (questionType === "true_false") {
      toast.error("True/False options can't be deleted.");
      return;
    }
    if (!confirm("Delete this option?")) return;
    startTransition(async () => {
      const result = await deleteAnswerOption({
        optionId: option.id,
        lessonId,
      });
      if (!result.ok) toast.error(result.error);
      else toast.success("Option removed.");
    });
  }

  return (
    <li className="flex items-center gap-2">
      <input
        type={isRadio ? "radio" : "checkbox"}
        checked={correct}
        onChange={(e) => onCorrectChange(e.target.checked)}
        className="size-4"
        aria-label="Mark correct"
      />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => save()}
        className="flex-1"
      />
      {questionType === "true_false" ? null : (
        <Button
          variant="outline"
          size="icon-sm"
          disabled={pending}
          onClick={onDelete}
          aria-label="Delete option"
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </li>
  );
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className ? `${className} flex flex-col gap-1.5` : "flex flex-col gap-1.5"}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
