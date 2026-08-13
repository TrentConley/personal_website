export type VocabularyStage =
  | "meaning"
  | "context"
  | "expression"
  | "mastered";

export type ClozePrompt = {
  sentence: string;
  answer: string;
  hint: string;
};

export type ReviewHistory = {
  at: number;
  stage: VocabularyStage;
  score: number;
  correct: boolean;
};

export type VocabularyCard = {
  id: string;
  term: string;
  definition: string;
  partOfSpeech: string;
  pronunciation: string;
  nuance: string;
  synonyms: string[];
  clozes: ClozePrompt[];
  clozeIndex: number;
  stage: VocabularyStage;
  stagePasses: number;
  consecutiveWrong: number;
  stabilityHours: number;
  difficulty: number;
  dueAt: number;
  createdAt: number;
  lastPracticedAt: number | null;
  reviews: number;
  lapses: number;
  history: ReviewHistory[];
};

export type TutorGrade = {
  score: number;
  verdict: "strong" | "close" | "miss";
  feedback: string;
  idealAnswer: string;
  source: "ai" | "quick";
  nextCloze?: ClozePrompt | null;
};

export type EnrichedWord = {
  term: string;
  definition: string;
  partOfSpeech: string;
  pronunciation: string;
  nuance: string;
  synonyms: string[];
  clozes: ClozePrompt[];
};

export type VocabularyState = {
  version: 1;
  cards: VocabularyCard[];
  totalReviews: number;
  currentStreakDays: number;
  lastStudyDay: string | null;
};

export const stageMeta: Record<
  VocabularyStage,
  { index: number; short: string; label: string; prompt: string }
> = {
  meaning: {
    index: 0,
    short: "01",
    label: "Meaning",
    prompt: "Define it in your own words.",
  },
  context: {
    index: 1,
    short: "02",
    label: "Context",
    prompt: "Recover it from context.",
  },
  expression: {
    index: 2,
    short: "03",
    label: "Expression",
    prompt: "Use it as if it were already yours.",
  },
  mastered: {
    index: 3,
    short: "04",
    label: "Retained",
    prompt: "Keep it alive.",
  },
};
