import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyGrade,
  formatDue,
  getStudyDay,
  selectNextCard,
  updateStreak,
} from "../vocabulary/scheduler";
import {
  createCard,
  enrichWords,
  gradeAnswer,
  sampleWords,
} from "../vocabulary/tutor";
import {
  kindleCloze,
  readKindleVocabulary,
} from "../vocabulary/kindle";
import {
  stageMeta,
  type EnrichedWord,
  type TutorGrade,
  type VocabularyCard,
  type VocabularyStage,
  type VocabularyState,
} from "../vocabulary/types";

const STORAGE_KEY = "trent-lexicon-v1";

const emptyState: VocabularyState = {
  version: 1,
  cards: [],
  totalReviews: 0,
  currentStreakDays: 0,
  lastStudyDay: null,
};

const orderedStages: VocabularyStage[] = [
  "meaning",
  "context",
  "expression",
  "mastered",
];

function loadState(): VocabularyState {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyState;
    const parsed = JSON.parse(saved) as VocabularyState;
    if (parsed.version !== 1 || !Array.isArray(parsed.cards)) return emptyState;
    return parsed;
  } catch {
    return emptyState;
  }
}

function parseWords(value: string) {
  return [...new Set(value.split(/[\n,;]+/).map((word) => word.trim()).filter(Boolean))];
}

function learningProgress(cards: VocabularyCard[]) {
  if (!cards.length) return 0;
  const progress = cards.reduce((total, card) => {
    const stage = stageMeta[card.stage].index;
    const partial = card.stage === "context" || card.stage === "expression"
      ? Math.min(0.5, card.stagePasses * 0.5)
      : 0;
    return total + Math.min(3, stage + partial);
  }, 0);
  return Math.round((progress / (cards.length * 3)) * 100);
}

function cardTiming(card: VocabularyCard, now: number) {
  if (card.dueAt <= now) return `${stageMeta[card.stage].label} · ready now`;
  const due = formatDue(card.dueAt, now);
  if (card.stage === "expression" && card.stagePasses === 0) {
    return `Expression · unlocks in ${due}`;
  }
  if (card.stage === "context" && card.stagePasses === 1) {
    return `Context 1/2 · next in ${due}`;
  }
  if (card.stage === "expression" && card.stagePasses === 1) {
    return `Expression 1/2 · next in ${due}`;
  }
  if (card.stage === "mastered") return `Retained · check in ${due}`;
  return `${stageMeta[card.stage].label} · next in ${due}`;
}

function restMessage(card: VocabularyCard, now: number) {
  const due = formatDue(card.dueAt, now);
  if (card.stage === "expression" && card.stagePasses === 0) {
    return `Expression for “${card.term}” unlocks in ${due}.`;
  }
  if (card.stage === "context" && card.stagePasses === 1) {
    return `One more context recall for “${card.term}” arrives in ${due}.`;
  }
  return `“${card.term}” returns in ${due}.`;
}

async function enrichInBatches(
  terms: string[],
  onProgress: (completed: number, total: number) => void,
) {
  const prepared: EnrichedWord[] = [];
  const batchSize = 20;
  for (let index = 0; index < terms.length; index += batchSize) {
    const batch = terms.slice(index, index + batchSize);
    prepared.push(...await enrichWords(batch));
    onProgress(Math.min(index + batch.length, terms.length), terms.length);
  }
  return prepared;
}

function Wordmark() {
  return (
    <a className="vocab-mark" href="/" aria-label="Back to Trent Conley">
      TC
    </a>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

function StagePath({ cards }: { cards: VocabularyCard[] }) {
  const counts = useMemo(
    () =>
      Object.fromEntries(
        orderedStages.map((stage) => [
          stage,
          cards.filter((card) => card.stage === stage).length,
        ]),
      ) as Record<VocabularyStage, number>,
    [cards],
  );

  return (
    <ol className="vocab-path" aria-label="Learning stages">
      {orderedStages.map((stage) => (
        <li key={stage} className={counts[stage] ? "has-words" : ""}>
          <span>{stageMeta[stage].short}</span>
          <div>
            <strong>{stageMeta[stage].label}</strong>
            <small>{counts[stage]} {counts[stage] === 1 ? "word" : "words"}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

type ImportPanelProps = {
  compact?: boolean;
  existing: VocabularyCard[];
  onImport: (cards: VocabularyCard[]) => void;
  onClose?: () => void;
};

function ImportPanel({ compact = false, existing, onImport, onClose }: ImportPanelProps) {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [kindleOpen, setKindleOpen] = useState(false);
  const [kindleLoading, setKindleLoading] = useState(false);
  const [kindleStatus, setKindleStatus] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const kindleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (compact) inputRef.current?.focus();
  }, [compact]);

  async function submit() {
    if (loading) return;
    const known = new Set(existing.map((card) => card.term.toLowerCase()));
    const requested = parseWords(value).filter((word) => !known.has(word.toLowerCase()));
    if (!requested.length) {
      setStatus(value.trim() ? "Those words are already here." : "Add at least one word.");
      return;
    }

    setLoading(true);
    setStatus("");
    const words = await enrichInBatches(requested, (completed, total) => {
      if (total > 20) setStatus(`Preparing ${completed} of ${total}…`);
    });
    setLoading(false);
    if (!words.length) {
      setStatus("I couldn't find those words. Check the spelling and try again.");
      return;
    }
    onImport(words.map((word, index) => createCard(word, Date.now() + index)));
    setValue("");
    if (words.length < requested.length) {
      setStatus(`${words.length} added. ${requested.length - words.length} could not be found.`);
    } else if (compact) {
      onClose?.();
    }
  }

  async function importKindle(file: File | undefined) {
    if (!file || kindleLoading || loading) return;
    setKindleLoading(true);
    setKindleStatus("Reading vocab.db…");

    try {
      const imported = await readKindleVocabulary(file);
      const known = new Set(existing.map((card) => card.term.toLowerCase()));
      const entries = imported.entries.filter((entry) => !known.has(entry.term));
      if (!entries.length) {
        setKindleStatus(
          imported.entries.length
            ? "Those Kindle words are already here."
            : "No English vocabulary words were found.",
        );
        return;
      }

      const enriched = await enrichInBatches(
        entries.map((entry) => entry.term),
        (completed, total) => setKindleStatus(`Preparing ${completed} of ${total}…`),
      );
      const source = new Map(entries.map((entry) => [entry.term, entry] as const));
      const cards = enriched.map((word, index) => {
        const card = createCard(word, Date.now() + index);
        const original = source.get(word.term.toLowerCase());
        const cloze = original ? kindleCloze(original) : null;
        return cloze
          ? { ...card, clozes: [cloze, ...card.clozes].slice(0, 3) }
          : card;
      });
      if (!cards.length) {
        setKindleStatus("I found the words but could not prepare their definitions.");
        return;
      }

      onImport(cards);
      const ignored = imported.skippedNonEnglish + imported.duplicates;
      setKindleStatus(
        `${cards.length} imported${ignored ? ` · ${ignored} duplicates or non-English skipped` : ""}.`,
      );
      if (compact) onClose?.();
    } catch (error) {
      setKindleStatus(error instanceof Error ? error.message : "I could not read that file.");
    } finally {
      setKindleLoading(false);
      if (kindleInputRef.current) kindleInputRef.current.value = "";
    }
  }

  return (
    <section className={`vocab-import${compact ? " is-compact" : ""}`}>
      {compact ? (
        <div className="vocab-import__topline">
          <div>
            <span className="vocab-eyebrow">New material</span>
            <h2>Add words</h2>
          </div>
          <button className="vocab-icon-button" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
      ) : (
        <div className="vocab-import__intro">
          <span className="vocab-eyebrow">Vocabulary, made usable</span>
          <h1>Words should become instinct.</h1>
          <p>
            Learn the meaning. Recover it from context. Then use it naturally.
          </p>
        </div>
      )}

      <label className="vocab-word-input">
        <span>Words to learn</span>
        <textarea
          ref={inputRef}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setStatus("");
          }}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
          }}
          placeholder={compact ? "oneiric, taciturn, inchoate" : "Paste words, separated by commas or new lines…"}
          rows={compact ? 4 : 5}
        />
      </label>

      {!compact && (
        <div className="vocab-samples" aria-label="Sample words">
          <span>Try</span>
          {sampleWords.slice(0, 4).map((word) => (
            <button
              type="button"
              key={word}
              onClick={() =>
                setValue((current) =>
                  parseWords(current).includes(word)
                    ? current
                    : [current.trim(), word].filter(Boolean).join(", ")
                )
              }
            >
              {word}
            </button>
          ))}
        </div>
      )}

      <div className="vocab-import__action">
        <button className="vocab-primary" type="button" onClick={submit} disabled={loading || kindleLoading}>
          <span>{loading ? "Preparing your words…" : "Begin learning"}</span>
          {!loading && <ArrowIcon />}
        </button>
        {status && <p role="status">{status}</p>}
      </div>

      <div className={`vocab-kindle${kindleOpen ? " is-open" : ""}`}>
        <button
          className="vocab-kindle__toggle"
          type="button"
          onClick={() => setKindleOpen((open) => !open)}
          aria-expanded={kindleOpen}
        >
          <span>
            <small>Kindle Paperwhite</small>
            <strong>Import Vocabulary Builder</strong>
          </span>
          <i aria-hidden="true">{kindleOpen ? "−" : "+"}</i>
        </button>
        {kindleOpen && (
          <div className="vocab-kindle__body">
            <ol>
              <li>Connect your Kindle by USB.</li>
              <li>Choose <code>system/vocabulary/vocab.db</code>.</li>
            </ol>
            <p>On Mac, press <kbd>⌘</kbd><kbd>⇧</kbd><kbd>.</kbd> if the system folder is hidden.</p>
            <input
              ref={kindleInputRef}
              className="vocab-visually-hidden"
              type="file"
              accept=".db,application/x-sqlite3,application/vnd.sqlite3"
              onChange={(event) => importKindle(event.target.files?.[0])}
            />
            <button
              className="vocab-kindle__file"
              type="button"
              onClick={() => kindleInputRef.current?.click()}
              disabled={kindleLoading || loading}
            >
              {kindleLoading ? kindleStatus || "Reading…" : "Choose vocab.db"}
            </button>
            {!kindleLoading && kindleStatus && <p className="vocab-kindle__status" role="status">{kindleStatus}</p>}
            <small>
              The database stays in your browser. Some newer Kindles do not expose this file over USB.
            </small>
          </div>
        )}
      </div>

      {!compact && (
        <div className="vocab-method">
          {orderedStages.slice(0, 3).map((stage) => (
            <div key={stage}>
              <span>{stageMeta[stage].short}</span>
              <strong>{stageMeta[stage].label}</strong>
              <p>{stageMeta[stage].prompt}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ClozeSentence({ sentence }: { sentence: string }) {
  const [before, after = ""] = sentence.split("___");
  return (
    <p className="vocab-cloze">
      {before}
      <span aria-label="blank">&nbsp;</span>
      {after}
    </p>
  );
}

function ScoreDial({ score }: { score: number }) {
  return (
    <div className="vocab-score" style={{ "--score": score } as React.CSSProperties}>
      <div>
        <strong>{Math.round(score)}</strong>
        <span>/100</span>
      </div>
    </div>
  );
}

function ReviewCard({
  card,
  answer,
  setAnswer,
  result,
  loading,
  onSubmit,
  onContinue,
  onOverride,
}: {
  card: VocabularyCard;
  answer: string;
  setAnswer: (value: string) => void;
  result: TutorGrade | null;
  loading: boolean;
  onSubmit: () => void;
  onContinue: () => void;
  onOverride: () => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const stage = card.stage;
  const meta = stageMeta[stage];
  const cloze = card.clozes[card.clozeIndex] ?? card.clozes[0];
  const threshold = stage === "meaning" ? 70 : 80;
  const passed = result ? result.score >= threshold : false;

  useEffect(() => {
    inputRef.current?.focus();
  }, [card.id, result]);

  function keyboardSubmit(event: React.KeyboardEvent) {
    if (event.key === "Enter" && (stage === "context" || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (result) onContinue();
      else onSubmit();
    }
  }

  if (result) {
    return (
      <article className={`vocab-review vocab-feedback is-${result.verdict}`}>
        <div className="vocab-feedback__header">
          <ScoreDial score={result.score} />
          <div>
            <span className="vocab-eyebrow">
              {passed ? "That holds" : result.verdict === "close" ? "Nearly there" : "Not yet"} · goal {threshold}
            </span>
            <h2>{card.term}</h2>
          </div>
        </div>
        <p className="vocab-feedback__note">{result.feedback}</p>
        <div className="vocab-answer-comparison">
          <div>
            <span>Your answer</span>
            <p>{answer}</p>
          </div>
          <div>
            <span>{stage === "context" ? "Answer" : "A precise version"}</span>
            <p>{result.idealAnswer}</p>
          </div>
        </div>
        <div className="vocab-feedback__footer">
          <small>{result.source === "ai" ? "Read by the AI tutor" : "Quick local check"}</small>
          <div>
            {result.source === "quick" && !passed && (
              <button className="vocab-text-button" type="button" onClick={onOverride}>
                I knew this
              </button>
            )}
            <button className="vocab-primary" type="button" onClick={onContinue} autoFocus>
              <span>Continue</span>
              <ArrowIcon />
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="vocab-review">
      <div className="vocab-review__meta">
        <span>{meta.short} / {meta.label}</span>
        <span className="vocab-pass-goal"><b>≥ {threshold}</b> to advance</span>
      </div>

      <div className="vocab-review__prompt">
        {stage === "context" && cloze ? (
          <>
            <span className="vocab-eyebrow">Which word belongs here?</span>
            <ClozeSentence sentence={cloze.sentence} />
            <small>{cloze.hint}</small>
          </>
        ) : (
          <>
            <span className="vocab-eyebrow">{stage === "meaning" ? "What does this mean?" : "Put this word to work"}</span>
            <h1>{card.term}</h1>
            <p className="vocab-pronunciation">
              {card.partOfSpeech}{card.pronunciation ? ` · ${card.pronunciation}` : ""}
            </p>
            {stage !== "meaning" && (
              <p className="vocab-expression-cue">Write a sentence you might actually say or publish.</p>
            )}
          </>
        )}
      </div>

      <label className={`vocab-answer${stage === "context" ? " is-line" : ""}`}>
        <span>{stage === "meaning" ? "In your own words" : stage === "context" ? "Your answer" : "Your sentence"}</span>
        {stage === "context" ? (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={keyboardSubmit}
            autoComplete="off"
            spellCheck={false}
          />
        ) : (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={keyboardSubmit}
            rows={3}
          />
        )}
      </label>

      <div className="vocab-review__footer">
        <small>{stage === "context" ? "Enter" : "⌘ Enter"} to check</small>
        <button className="vocab-primary" type="button" onClick={onSubmit} disabled={!answer.trim() || loading}>
          <span>{loading ? "Reading your answer…" : "Check answer"}</span>
          {!loading && <ArrowIcon />}
        </button>
      </div>
    </article>
  );
}

function Library({
  cards,
  now,
  onClose,
  onAdd,
  onRemove,
}: {
  cards: VocabularyCard[];
  now: number;
  onClose: () => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const progress = learningProgress(cards);
  const counts = Object.fromEntries(
    orderedStages.map((stage) => [
      stage,
      cards.filter((card) => card.stage === stage).length,
    ]),
  ) as Record<VocabularyStage, number>;

  return (
    <div className="vocab-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="vocab-library" aria-label="Word library">
        <div className="vocab-library__header">
          <div>
            <span className="vocab-eyebrow">Your collection</span>
            <h2>{cards.length} {cards.length === 1 ? "word" : "words"}</h2>
          </div>
          <button className="vocab-icon-button" type="button" onClick={onClose} aria-label="Close library">×</button>
        </div>
        <div className="vocab-library__progress" aria-label={`${progress}% overall progress`}>
          <span><i style={{ width: `${progress}%` }} /></span>
          <strong>{progress}%</strong>
        </div>
        <div className="vocab-stage-summary">
          {orderedStages.map((stage) => (
            <div key={stage}>
              <strong>{counts[stage]}</strong>
              <span>{stageMeta[stage].label}</span>
              <small>
                {stage === "meaning"
                  ? "≥70"
                  : stage === "mastered"
                    ? "spaced"
                    : "2 × ≥80"}
              </small>
            </div>
          ))}
        </div>
        <button className="vocab-add-button" type="button" onClick={onAdd}>
          <span>+</span> Add words
        </button>
        <div className="vocab-library__groups">
          {orderedStages.map((stage) => {
            const group = cards.filter((card) => card.stage === stage);
            if (!group.length) return null;
            return (
              <section key={stage}>
                <h3><span>{stageMeta[stage].short}</span>{stageMeta[stage].label}</h3>
                {group.map((card) => (
                  <div className="vocab-library__word" key={card.id}>
                    <div>
                      <strong>{card.term}</strong>
                      <small>{card.partOfSpeech} · {cardTiming(card, now)}</small>
                    </div>
                    <button type="button" onClick={() => onRemove(card.id)} aria-label={`Remove ${card.term}`}>×</button>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

export function VocabularyPage() {
  const [state, setState] = useState<VocabularyState>(loadState);
  const [now, setNow] = useState(Date.now());
  const [currentId, setCurrentId] = useState<string | null>(() =>
    selectNextCard(loadState().cards, Date.now())?.id ?? null,
  );
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<TutorGrade | null>(null);
  const [grading, setGrading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [studyEarly, setStudyEarly] = useState(false);

  const current = state.cards.find((card) => card.id === currentId) ?? null;
  const dueCount = state.cards.filter((card) => card.dueAt <= now).length;
  const progress = learningProgress(state.cards);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    document.title = "Lexicon — Trent Conley";
    return () => {
      document.title = "Trent Conley | AI Engineer";
    };
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (adding) setAdding(false);
      else if (libraryOpen) setLibraryOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [adding, libraryOpen]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!current && state.cards.length) {
      setCurrentId(selectNextCard(state.cards, Date.now())?.id ?? null);
    }
  }, [current, state.cards]);

  function importCards(cards: VocabularyCard[]) {
    setState((previous) => ({ ...previous, cards: [...previous.cards, ...cards] }));
    if (!currentId && cards[0]) setCurrentId(cards[0].id);
  }

  async function submit() {
    if (!current || !answer.trim() || grading) return;
    setGrading(true);
    const grade = await gradeAnswer(current, answer.trim());
    setResult(grade);
    setGrading(false);
  }

  function overrideGrade() {
    if (!result) return;
    setResult({
      ...result,
      score: current?.stage === "meaning" ? 78 : 84,
      verdict: "strong",
      feedback: "Marked correct by you.",
    });
  }

  function continueStudy() {
    if (!current || !result) return;
    const timestamp = Date.now();
    let reviewed = current;
    if (result.nextCloze && current.stage === "context") {
      const clozes = [...current.clozes];
      clozes[(current.clozeIndex + 1) % Math.max(1, clozes.length)] = result.nextCloze;
      reviewed = { ...current, clozes };
    }
    const updated = applyGrade(reviewed, result, timestamp);
    const cards = state.cards.map((card) => (card.id === current.id ? updated : card));
    const next = selectNextCard(cards, timestamp, current.id);

    setState((previous) => ({
      ...previous,
      cards,
      totalReviews: previous.totalReviews + 1,
      currentStreakDays: updateStreak(previous.lastStudyDay, previous.currentStreakDays),
      lastStudyDay: getStudyDay(timestamp),
    }));
    setNow(timestamp);
    setCurrentId(next?.id ?? null);
    setAnswer("");
    setResult(null);
    setStudyEarly(false);
  }

  function removeCard(id: string) {
    const cards = state.cards.filter((card) => card.id !== id);
    setState((previous) => ({ ...previous, cards }));
    if (id === currentId) {
      setCurrentId(selectNextCard(cards, Date.now())?.id ?? null);
      setAnswer("");
      setResult(null);
    }
    if (!cards.length) setLibraryOpen(false);
  }

  const nextIsFuture = current ? current.dueAt > now : false;

  return (
    <main className="vocab-page">
      <header className="vocab-header">
        <div className="vocab-header__brand">
          <Wordmark />
          <div>
            <strong>Lexicon</strong>
            <span>active vocabulary</span>
          </div>
        </div>
        {state.cards.length > 0 && (
          <button
            className="vocab-library-button"
            type="button"
            onClick={() => setLibraryOpen(true)}
            aria-label="Open progress and word list"
          >
            <span>{dueCount ? `${dueCount} due` : `${progress}% progress`}</span>
            <i aria-hidden="true">{state.cards.length}</i>
          </button>
        )}
      </header>

      {!state.cards.length ? (
        <ImportPanel existing={state.cards} onImport={importCards} />
      ) : (
        <div className="vocab-shell">
          <aside className="vocab-sidebar">
            <StagePath cards={state.cards} />
            <div className="vocab-sidebar__stat">
              <span>{state.currentStreakDays}</span>
              <p>day rhythm</p>
            </div>
          </aside>

          <section className="vocab-study">
            {current && (!nextIsFuture || studyEarly) ? (
              <ReviewCard
                card={current}
                answer={answer}
                setAnswer={setAnswer}
                result={result}
                loading={grading}
                onSubmit={submit}
                onContinue={continueStudy}
                onOverride={overrideGrade}
              />
            ) : current ? (
              <div className="vocab-rest">
                <span className="vocab-eyebrow">Nothing due</span>
                <h1>Let it settle.</h1>
                <p>{restMessage(current, now)}</p>
                <button className="vocab-secondary" type="button" onClick={() => setStudyEarly(true)}>
                  Review early
                </button>
              </div>
            ) : null}
          </section>

          <footer className="vocab-mobile-progress">
            {orderedStages.slice(0, 3).map((stage) => (
              <span key={stage} className={current?.stage === stage ? "is-current" : ""}>
                {stageMeta[stage].short}
              </span>
            ))}
          </footer>
        </div>
      )}

      {libraryOpen && (
        <Library
          cards={state.cards}
          now={now}
          onClose={() => setLibraryOpen(false)}
          onAdd={() => setAdding(true)}
          onRemove={removeCard}
        />
      )}
      {adding && (
        <div className="vocab-overlay is-centered" role="presentation">
          <ImportPanel
            compact
            existing={state.cards}
            onImport={importCards}
            onClose={() => setAdding(false)}
          />
        </div>
      )}
    </main>
  );
}
