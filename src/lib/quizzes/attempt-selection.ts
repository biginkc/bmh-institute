export type AttemptOption = {
  id: string;
  option_text: string;
  sort_order: number | null;
};

export type AttemptQuestion = {
  id: string;
  question_text: string;
  question_type: "true_false" | "single_choice" | "multi_select";
  sort_order: number | null;
  options: AttemptOption[];
};

export type AttemptSelection = {
  questionOrder: string[];
  answerOrders: Record<string, string[]>;
  questions: AttemptQuestion[];
};

export function buildAttemptSelection(input: {
  questions: AttemptQuestion[];
  questionsPerAttempt: number | null;
  randomizeQuestions: boolean;
  randomizeAnswers: boolean;
  random?: () => number;
}): AttemptSelection {
  const random = input.random ?? Math.random;
  const authored = [...input.questions].sort(bySortOrder);
  const orderedQuestions = input.randomizeQuestions
    ? shuffle(authored, random)
    : authored;
  const count = normalizeQuestionCount(
    input.questionsPerAttempt,
    orderedQuestions.length,
  );
  const selected = orderedQuestions.slice(0, count).map((question) => ({
    ...question,
    options: input.randomizeAnswers
      ? shuffle([...question.options].sort(bySortOrder), random)
      : [...question.options].sort(bySortOrder),
  }));

  return {
    questionOrder: selected.map((question) => question.id),
    answerOrders: Object.fromEntries(
      selected.map((question) => [
        question.id,
        question.options.map((option) => option.id),
      ]),
    ),
    questions: selected,
  };
}

export function restoreAttemptQuestions(input: {
  questions: AttemptQuestion[];
  questionOrder: string[];
  answerOrders: Record<string, string[]>;
}): AttemptQuestion[] {
  const questionsById = new Map(
    input.questions.map((question) => [question.id, question]),
  );

  return input.questionOrder.flatMap((questionId) => {
    const question = questionsById.get(questionId);
    if (!question) return [];
    const optionsById = new Map(
      question.options.map((option) => [option.id, option]),
    );
    const persistedOrder = input.answerOrders[questionId] ?? [];
    const orderedOptions = persistedOrder.flatMap((optionId) => {
      const option = optionsById.get(optionId);
      return option ? [option] : [];
    });
    return [{ ...question, options: orderedOptions }];
  });
}

function normalizeQuestionCount(requested: number | null, available: number) {
  if (requested === null || requested <= 0) return available;
  return Math.min(Math.floor(requested), available);
}

function bySortOrder<T extends { sort_order: number | null }>(a: T, b: T) {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

function shuffle<T>(values: T[], random: () => number): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}
