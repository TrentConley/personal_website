import {
  type ClozePrompt,
  type EnrichedWord,
  type TutorGrade,
  type VocabularyCard,
} from "./types";

const builtInWords: Record<string, EnrichedWord> = {
  trenchant: {
    term: "trenchant",
    definition: "Vigorous, incisive, and sharply effective in expression or analysis.",
    partOfSpeech: "adjective",
    pronunciation: "/ˈtren(t)SH(ə)nt/",
    nuance: "Usually praises criticism or writing that cuts directly to the point.",
    synonyms: ["incisive", "penetrating", "sharp"],
    clozes: [
      { sentence: "Her ___ critique exposed the proposal's weakest assumption.", answer: "trenchant", hint: "incisive" },
      { sentence: "The essay is brief but ___, leaving no ambiguity about its argument.", answer: "trenchant", hint: "sharply effective" },
      { sentence: "His most ___ observation arrived almost as an aside.", answer: "trenchant", hint: "penetrating" },
    ],
  },
  quotidian: {
    term: "quotidian",
    definition: "Ordinary, everyday, or occurring daily.",
    partOfSpeech: "adjective",
    pronunciation: "/kwōˈtidēən/",
    nuance: "More literary than 'everyday'; often makes the ordinary feel worth noticing.",
    synonyms: ["everyday", "daily", "ordinary"],
    clozes: [
      { sentence: "The novel finds quiet beauty in ___ rituals like making coffee.", answer: "quotidian", hint: "everyday" },
      { sentence: "What began as a crisis eventually became a ___ inconvenience.", answer: "quotidian", hint: "ordinary" },
      { sentence: "She photographed the ___ details most people walked past.", answer: "quotidian", hint: "daily" },
    ],
  },
  liminal: {
    term: "liminal",
    definition: "Occupying a threshold or transitional state between two conditions.",
    partOfSpeech: "adjective",
    pronunciation: "/ˈlimənl/",
    nuance: "Useful for spaces, periods, or identities that feel suspended between states.",
    synonyms: ["transitional", "threshold", "in-between"],
    clozes: [
      { sentence: "Airports have a ___ quality: everyone is between one place and another.", answer: "liminal", hint: "in-between" },
      { sentence: "Dusk is a ___ hour, neither fully day nor night.", answer: "liminal", hint: "transitional" },
      { sentence: "The months after graduation felt strangely ___.", answer: "liminal", hint: "between states" },
    ],
  },
  pellucid: {
    term: "pellucid",
    definition: "Transparently clear, either literally or in style and meaning.",
    partOfSpeech: "adjective",
    pronunciation: "/pəˈlo͞osid/",
    nuance: "Can describe clear water or unusually lucid prose and explanations.",
    synonyms: ["lucid", "transparent", "clear"],
    clozes: [
      { sentence: "Her ___ explanation made the difficult proof feel inevitable.", answer: "pellucid", hint: "lucid" },
      { sentence: "The lake remained ___ even several meters from shore.", answer: "pellucid", hint: "transparent" },
      { sentence: "He turned a dense argument into ___ prose.", answer: "pellucid", hint: "clear" },
    ],
  },
  fastidious: {
    term: "fastidious",
    definition: "Very attentive to detail, accuracy, cleanliness, or propriety.",
    partOfSpeech: "adjective",
    pronunciation: "/faˈstidēəs/",
    nuance: "Can praise precision or imply that someone is excessively hard to please.",
    synonyms: ["meticulous", "exacting", "particular"],
    clozes: [
      { sentence: "The conservator was ___ about matching the original pigment.", answer: "fastidious", hint: "meticulous" },
      { sentence: "His ___ standards made the final edit unusually clean.", answer: "fastidious", hint: "very particular" },
      { sentence: "She is ___ about keeping raw data separate from derived results.", answer: "fastidious", hint: "exact" },
    ],
  },
};

function anonymousId() {
  const key = "vocabulary-tutor-anonymous-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  window.localStorage.setItem(key, value);
  return value;
}

async function callTutor<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/vocabulary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, anonymousId: anonymousId() }),
  });
  if (!response.ok) throw new Error(`Tutor unavailable (${response.status})`);
  return response.json() as Promise<T>;
}

type DictionaryResponse = Array<{
  word?: string;
  phonetic?: string;
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{
      definition?: string;
      example?: string;
      synonyms?: string[];
    }>;
  }>;
}>;

type DatamuseResponse = Array<{
  word?: string;
  tags?: string[];
  defs?: string[];
}>;

function blankExample(example: string, term: string) {
  const expression = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return expression.test(example) ? example.replace(expression, "___") : "";
}

async function dictionaryWord(term: string): Promise<EnrichedWord | null> {
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`,
    );
    if (!response.ok) return null;
    const entries = (await response.json()) as DictionaryResponse;
    const entry = entries[0];
    const meaning = entry?.meanings?.find(
      (item) => item.definitions?.some((definition) => definition.definition),
    );
    const definition = meaning?.definitions?.find((item) => item.definition);
    if (!definition?.definition) return null;
    const examples =
      meaning?.definitions
        ?.map((item) => (item.example ? blankExample(item.example, term) : ""))
        .filter(Boolean) ?? [];
    const generic = [
      `The editor chose the word “___” because it was more precise than the obvious alternative.`,
      `Her use of “___” changed the tone of the entire sentence.`,
      `In context, the best word for the idea was “___.”`,
    ];

    return {
      term,
      definition: definition.definition,
      partOfSpeech: meaning.partOfSpeech || "word",
      pronunciation: entry.phonetic || "",
      nuance: "Dictionary definition. The AI tutor can add a sharper usage note when configured.",
      synonyms: (definition.synonyms ?? []).slice(0, 5),
      clozes: [...examples, ...generic].slice(0, 3).map((sentence) => ({
        sentence,
        answer: term,
        hint: (definition.synonyms ?? [])[0] || meaning.partOfSpeech || "word",
      })),
    };
  } catch {
    return null;
  }
}

async function datamuseWord(term: string): Promise<EnrichedWord | null> {
  try {
    const response = await fetch(
      `https://api.datamuse.com/words?sp=${encodeURIComponent(term)}&md=dpr&ipa=1&max=1`,
    );
    if (!response.ok) return null;
    const [entry] = (await response.json()) as DatamuseResponse;
    if (!entry || entry.word?.toLowerCase() !== term.toLowerCase() || !entry.defs?.length) {
      return null;
    }

    const [rawPart = "", rawDefinition = ""] = entry.defs[0].split("\t");
    if (!rawDefinition) return null;
    const partNames: Record<string, string> = {
      n: "noun",
      v: "verb",
      adj: "adjective",
      adv: "adverb",
    };
    const part = partNames[rawPart] ?? (rawPart || "word");
    const ipa = entry.tags?.find((tag) => tag.startsWith("ipa_pron:"))?.slice(9) ?? "";
    const clozes = [
      `The editor chose “___” because it was more precise than the obvious alternative.`,
      `Her use of “___” changed the tone of the entire sentence.`,
      `In context, the best word for the idea was “___.”`,
    ].map((sentence) => ({ sentence, answer: term, hint: part }));

    return {
      term,
      definition: rawDefinition.trim(),
      partOfSpeech: part,
      pronunciation: ipa ? `/${ipa}/` : "",
      nuance: "A lexical definition; the AI tutor will add a finer usage distinction when available.",
      synonyms: [],
      clozes,
    };
  } catch {
    return null;
  }
}

export async function enrichWords(words: string[]) {
  const normalized = [...new Set(words.map((word) => word.trim().toLowerCase()))]
    .filter(Boolean)
    .slice(0, 24);
  try {
    return await callTutor<EnrichedWord[]>({ action: "enrich", words: normalized });
  } catch {
    const enriched = await Promise.all(
      normalized.map(async (term) =>
        builtInWords[term] ?? (await datamuseWord(term)) ?? dictionaryWord(term),
      ),
    );
    return enriched.filter((word): word is EnrichedWord => Boolean(word));
  }
}

const stopWords = new Set([
  "a", "an", "and", "as", "at", "be", "by", "for", "from", "in", "is",
  "it", "of", "on", "or", "that", "the", "to", "very", "with",
]);

function tokens(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s-]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !stopWords.has(token)),
  );
}

function quickMeaning(card: VocabularyCard, answer: string): TutorGrade {
  const reference = tokens(`${card.definition} ${card.synonyms.join(" ")}`);
  const response = tokens(answer);
  const hits = [...response].filter((token) => reference.has(token)).length;
  const coverage = hits / Math.max(2, Math.min(5, reference.size));
  const score = Math.min(92, Math.round(28 + coverage * 92 + Math.min(12, answer.length / 7)));
  return {
    score,
    verdict: score >= 70 ? "strong" : score >= 55 ? "close" : "miss",
    feedback:
      score >= 70
        ? "Your definition captures the central idea."
        : "You may be circling the word, but the defining idea is still missing.",
    idealAnswer: card.definition,
    source: "quick",
  };
}

function quickContext(card: VocabularyCard, answer: string): TutorGrade {
  const normalized = answer.trim().toLowerCase().replace(/[.,!?;:]$/, "");
  const accepted = new Set([card.term.toLowerCase(), card.clozes[card.clozeIndex]?.answer.toLowerCase()]);
  const correct = accepted.has(normalized);
  return {
    score: correct ? 100 : 20,
    verdict: correct ? "strong" : "miss",
    feedback: correct
      ? "Exactly. The meaning and grammar both fit."
      : `The sentence needs “${card.term}.”`,
    idealAnswer: card.term,
    source: "quick",
  };
}

function quickExpression(card: VocabularyCard, answer: string): TutorGrade {
  const containsWord = new RegExp(`\\b${card.term}(?:s|ed|ing|ly)?\\b`, "i").test(answer);
  const substantial = answer.trim().split(/\s+/).length >= 6;
  const score = containsWord && substantial ? 84 : containsWord ? 62 : 20;
  return {
    score,
    verdict: score >= 80 ? "strong" : score >= 55 ? "close" : "miss",
    feedback:
      score >= 80
        ? "The sentence is complete and the word is doing real work."
        : containsWord
          ? "Give the word enough context to prove you can use its meaning naturally."
          : `Use “${card.term}” in the sentence itself.`,
    idealAnswer: `Write a specific, natural sentence that makes “${card.term}” necessary.`,
    source: "quick",
  };
}

export async function gradeAnswer(card: VocabularyCard, answer: string) {
  const action =
    card.stage === "meaning"
      ? "grade_meaning"
      : card.stage === "context"
        ? "grade_context"
        : "grade_expression";
  try {
    return await callTutor<TutorGrade>({
      action,
      word: card.term,
      definition: card.definition,
      partOfSpeech: card.partOfSpeech,
      nuance: card.nuance,
      prompt: card.stage === "context" ? card.clozes[card.clozeIndex]?.sentence : undefined,
      answer,
    });
  } catch {
    if (card.stage === "meaning") return quickMeaning(card, answer);
    if (card.stage === "context") return quickContext(card, answer);
    return quickExpression(card, answer);
  }
}

export function createCard(word: EnrichedWord, now = Date.now()): VocabularyCard {
  return {
    id: crypto.randomUUID(),
    ...word,
    clozeIndex: 0,
    stage: "meaning",
    stagePasses: 0,
    consecutiveWrong: 0,
    stabilityHours: 0.08,
    difficulty: 0.5,
    dueAt: now,
    createdAt: now,
    lastPracticedAt: null,
    reviews: 0,
    lapses: 0,
    history: [],
  };
}

export const sampleWords = Object.keys(builtInWords);
