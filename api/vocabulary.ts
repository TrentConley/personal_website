import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
};

type VercelResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => VercelResponse;
  json: (body: unknown) => VercelResponse;
};

const Cloze = z.object({
  sentence: z.string(),
  answer: z.string(),
  hint: z.string(),
});

const EnrichedWord = z.object({
  term: z.string(),
  definition: z.string(),
  partOfSpeech: z.string(),
  pronunciation: z.string(),
  nuance: z.string(),
  synonyms: z.array(z.string()).max(5),
  clozes: z.array(Cloze).length(3),
});

const EnrichedWords = z.object({ words: z.array(EnrichedWord) });

const Grade = z.object({
  score: z.number().min(0).max(100),
  verdict: z.enum(["strong", "close", "miss"]),
  feedback: z.string(),
  idealAnswer: z.string(),
  nextCloze: Cloze.nullable(),
});

const RequestBody = z.object({
  action: z.enum(["enrich", "grade_meaning", "grade_context", "grade_expression"]),
  anonymousId: z.string().max(100),
  words: z.array(z.string().max(80)).max(24).optional(),
  word: z.string().max(80).optional(),
  definition: z.string().max(800).optional(),
  partOfSpeech: z.string().max(80).optional(),
  nuance: z.string().max(800).optional(),
  prompt: z.string().max(800).optional(),
  answer: z.string().max(1_500).optional(),
});

const buckets = new Map<string, { start: number; count: number }>();

function rateLimited(request: VercelRequest) {
  const address = String(request.headers["x-forwarded-for"] || "unknown").split(",")[0];
  const now = Date.now();
  if (buckets.size > 5_000) buckets.clear();
  const bucket = buckets.get(address);
  if (!bucket || now - bucket.start > 60_000) {
    buckets.set(address, { start: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > 40;
}

const clean = (value: unknown) => JSON.stringify(value);

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }
  if (rateLimited(request)) return response.status(429).json({ error: "Slow down" });
  if (!process.env.OPENAI_API_KEY) {
    return response.status(503).json({ error: "AI tutor is not configured" });
  }

  const parsed = RequestBody.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Invalid request" });
  const input = parsed.data;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_VOCAB_MODEL || "gpt-5.6-luna";
  const safetyIdentifier = createHash("sha256")
    .update(input.anonymousId)
    .digest("hex")
    .slice(0, 32);

  try {
    if (input.action === "enrich") {
      const words = input.words?.map((word) => word.trim()).filter(Boolean) ?? [];
      if (!words.length) return response.status(400).json({ error: "No words supplied" });
      const result = await client.responses.parse({
        model,
        reasoning: { effort: "low" },
        safety_identifier: safetyIdentifier,
        input: [
          {
            role: "system",
            content:
              "You are a precise vocabulary editor. For every supplied English word, choose the most useful contemporary sense for an educated general reader. Definitions must be concise and non-circular. Give a short usage nuance, up to five close synonyms, and exactly three natural cloze sentences. Replace only the target word with ___. Each sentence must make the target uniquely recoverable from semantics and grammar. Preserve the supplied order. Do not invent words.",
          },
          { role: "user", content: clean({ words }) },
        ],
        text: { format: zodTextFormat(EnrichedWords, "vocabulary_words") },
      });
      if (!result.output_parsed) throw new Error("No structured output");
      return response.status(200).json(result.output_parsed.words);
    }

    const shared = {
      word: input.word,
      definition: input.definition,
      partOfSpeech: input.partOfSpeech,
      nuance: input.nuance,
      prompt: input.prompt,
      learnerAnswer: input.answer,
    };
    const instructions =
      input.action === "grade_meaning"
        ? "Grade whether the learner understands the target word's central meaning. Accept accurate paraphrases and relevant synonyms; do not demand matching wording. Score 70 or above only when the essential meaning is present. Briefly identify the strongest correct idea or the single most important missing distinction."
        : input.action === "grade_context"
          ? "Grade a cloze answer. Accept the target word or a grammatically valid inflection only when it preserves the target meaning. Score 80 or above only for a correct fit. Also generate one new natural cloze sentence for the same word, with only that word replaced by ___."
          : "Grade an original sentence for active command of the target word. The sentence must use the word (or a valid inflection), express its actual meaning, be grammatically sound, and sound natural rather than like a disguised definition. Score 80 or above only when all four are true. Give one specific coaching note.";

    const verdictRule =
      input.action === "grade_meaning"
        ? "Verdict must match score: strong >= 70, close 55-69, miss < 55."
        : "Verdict must match score: strong >= 80, close 55-79, miss < 55.";
    const result = await client.responses.parse({
      model,
      reasoning: { effort: "low" },
      safety_identifier: safetyIdentifier,
      input: [
        {
          role: "system",
          content: `${instructions} Return concise feedback under 25 words and a compact ideal answer. ${verdictRule} Set nextCloze to null unless grading context.`,
        },
        { role: "user", content: clean(shared) },
      ],
      text: { format: zodTextFormat(Grade, "vocabulary_grade") },
    });
    if (!result.output_parsed) throw new Error("No structured output");
    return response.status(200).json({ ...result.output_parsed, source: "ai" });
  } catch (error) {
    console.error("Vocabulary tutor failed", error);
    return response.status(502).json({ error: "Tutor request failed" });
  }
}
