import {
  type TutorGrade,
  type VocabularyCard,
  type VocabularyStage,
} from "./types";

const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;

const stagePriority: Record<VocabularyStage, number> = {
  meaning: 1.2,
  context: 1.05,
  expression: 0.95,
  mastered: 0.5,
};

export function selectNextCard(
  cards: VocabularyCard[],
  now: number,
  previousCardId?: string | null,
) {
  if (!cards.length) return null;

  const dueCards = cards.filter((card) => card.dueAt <= now);
  const pool = dueCards.length
    ? dueCards
    : [...cards].sort((a, b) => a.dueAt - b.dueAt).slice(0, 3);
  const alternatives = pool.filter((card) => card.id !== previousCardId);
  const candidates = alternatives.length ? alternatives : pool;

  return [...candidates].sort((a, b) => {
    const score = (card: VocabularyCard) => {
      const overdueHours = Math.max(0, now - card.dueAt) / HOUR;
      const spacingHours = card.lastPracticedAt
        ? (now - card.lastPracticedAt) / HOUR
        : 10_000;
      const spacingPenalty = spacingHours < 0.025 ? 8 : 0;
      const uncertainty = 1 + card.difficulty * 0.7 + card.lapses * 0.08;
      const overdue = overdueHours / Math.max(0.25, card.stabilityHours);

      return (
        overdue * uncertainty +
        stagePriority[card.stage] +
        card.consecutiveWrong * 0.7 -
        spacingPenalty
      );
    };

    return score(b) - score(a);
  })[0];
}

function intervalFromStability(card: VocabularyCard, minimumMs: number) {
  return Math.max(minimumMs, card.stabilityHours * HOUR);
}

export function applyGrade(
  card: VocabularyCard,
  grade: TutorGrade,
  now: number,
): VocabularyCard {
  const threshold = card.stage === "meaning" ? 70 : 80;
  const correct = grade.score >= threshold;
  const quality = Math.min(1, Math.max(0, grade.score / 100));
  let stage = card.stage;
  let stagePasses = card.stagePasses;
  let consecutiveWrong = correct ? 0 : card.consecutiveWrong + 1;
  let stabilityHours = card.stabilityHours;
  let difficulty = Math.min(
    1,
    Math.max(0.05, card.difficulty + (correct ? -0.025 : 0.09)),
  );
  let dueAt = now;

  if (card.stage === "meaning") {
    if (correct) {
      stage = "context";
      stagePasses = 0;
      stabilityHours = Math.max(0.16, stabilityHours * (1.6 + quality));
      dueAt = now + intervalFromStability(card, 4 * 60 * 1_000);
    } else {
      stabilityHours = Math.max(0.015, stabilityHours * 0.48);
      dueAt = now + Math.max(50_000, stabilityHours * HOUR);
    }
  } else if (card.stage === "context") {
    if (correct) {
      stagePasses += 1;
      stabilityHours = Math.max(6, stabilityHours * (2 + quality));
      if (stagePasses >= 2) {
        stage = "expression";
        stagePasses = 0;
        dueAt = now + 8 * HOUR;
      } else {
        dueAt = now + intervalFromStability(card, 30 * 60 * 1_000);
      }
    } else if (consecutiveWrong >= 2) {
      stage = "meaning";
      stagePasses = 0;
      consecutiveWrong = 0;
      stabilityHours = Math.max(0.08, stabilityHours * 0.35);
      dueAt = now + 3 * 60 * 1_000;
    } else {
      stagePasses = 0;
      stabilityHours = Math.max(0.12, stabilityHours * 0.55);
      dueAt = now + 8 * 60 * 1_000;
    }
  } else if (card.stage === "expression") {
    if (correct) {
      stagePasses += 1;
      stabilityHours = Math.max(24, stabilityHours * (2.15 + quality));
      if (stagePasses >= 2) {
        stage = "mastered";
        stagePasses = 0;
        dueAt = now + 7 * DAY;
      } else {
        dueAt = now + 20 * HOUR;
      }
    } else if (consecutiveWrong >= 2) {
      stage = "context";
      stagePasses = 0;
      consecutiveWrong = 0;
      stabilityHours = Math.max(4, stabilityHours * 0.45);
      dueAt = now + 45 * 60 * 1_000;
    } else {
      stagePasses = 0;
      dueAt = now + 4 * HOUR;
    }
  } else {
    if (correct) {
      stabilityHours = Math.min(24 * 180, stabilityHours * (2.1 + quality));
      dueAt = now + Math.max(14 * DAY, stabilityHours * HOUR);
    } else {
      stage = "expression";
      stagePasses = 0;
      stabilityHours = Math.max(24, stabilityHours * 0.42);
      dueAt = now + DAY;
    }
  }

  return {
    ...card,
    stage,
    stagePasses,
    consecutiveWrong,
    stabilityHours,
    difficulty,
    dueAt,
    lastPracticedAt: now,
    reviews: card.reviews + 1,
    lapses: card.lapses + (correct ? 0 : 1),
    clozeIndex:
      card.stage === "context" && correct && card.clozes.length
        ? (card.clozeIndex + 1) % card.clozes.length
        : card.clozeIndex,
    history: [
      ...card.history.slice(-19),
      { at: now, stage: card.stage, score: grade.score, correct },
    ],
  };
}

export function formatDue(dueAt: number, now = Date.now()) {
  const difference = dueAt - now;
  if (difference <= 0) return "now";
  if (difference < HOUR) return `${Math.max(1, Math.round(difference / 60_000))}m`;
  if (difference < DAY) return `${Math.round(difference / HOUR)}h`;
  return `${Math.round(difference / DAY)}d`;
}

export function getStudyDay(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function updateStreak(lastStudyDay: string | null, current: number) {
  const today = getStudyDay();
  if (lastStudyDay === today) return current;
  if (!lastStudyDay) return 1;
  const elapsed =
    (new Date(`${today}T00:00:00Z`).getTime() -
      new Date(`${lastStudyDay}T00:00:00Z`).getTime()) /
    DAY;
  return elapsed === 1 ? current + 1 : 1;
}
