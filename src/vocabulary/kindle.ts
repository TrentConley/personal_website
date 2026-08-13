import initSqlJs, { type SqlValue } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { ClozePrompt } from "./types";

export type KindleEntry = {
  term: string;
  surface: string;
  context: string;
  timestamp: number | null;
};

export type KindleImport = {
  entries: KindleEntry[];
  totalRows: number;
  skippedNonEnglish: number;
  duplicates: number;
};

const identifier = (value: string) => `"${value.replace(/"/g, '""')}"`;

function columnNames(database: import("sql.js").Database, table: string) {
  const result = database.exec(`PRAGMA table_info(${identifier(table)})`)[0];
  return new Map(
    (result?.values ?? []).map((row) => [String(row[1]).toLowerCase(), String(row[1])]),
  );
}

function asText(value: SqlValue | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanTerm(value: string) {
  return value
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export async function readKindleVocabulary(file: File): Promise<KindleImport> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = new TextDecoder().decode(bytes.slice(0, 16));
  if (!signature.startsWith("SQLite format 3")) {
    throw new Error("That is not a Kindle vocab.db file.");
  }

  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  const database = new SQL.Database(bytes);

  try {
    const tableResult = database.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )[0];
    const tables = new Map(
      (tableResult?.values ?? []).map((row) => [String(row[0]).toLowerCase(), String(row[0])]),
    );
    const wordsTable = tables.get("words");
    if (!wordsTable) throw new Error("This database has no Kindle word list.");

    const wordColumns = columnNames(database, wordsTable);
    const wordColumn = wordColumns.get("word");
    if (!wordColumn) throw new Error("This Kindle word list has an unknown format.");

    const stemColumn = wordColumns.get("stem");
    const languageColumn = wordColumns.get("lang");
    const timestampColumn = wordColumns.get("timestamp");
    const idColumn = wordColumns.get("id");
    const lookupsTable = tables.get("lookups");
    const lookupColumns = lookupsTable ? columnNames(database, lookupsTable) : new Map();
    const usageColumn = lookupColumns.get("usage");
    const wordKeyColumn = lookupColumns.get("word_key");
    const lookupTimestampColumn = lookupColumns.get("timestamp");

    const optional = (column: string | undefined, alias: string) =>
      column ? `w.${identifier(column)} AS ${identifier(alias)}` : `NULL AS ${identifier(alias)}`;
    let usage = `NULL AS ${identifier("usage")}`;
    if (lookupsTable && usageColumn && wordKeyColumn && idColumn) {
      const ordering = lookupTimestampColumn
        ? ` ORDER BY l.${identifier(lookupTimestampColumn)} DESC`
        : "";
      usage = `(
        SELECT l.${identifier(usageColumn)}
        FROM ${identifier(lookupsTable)} l
        WHERE l.${identifier(wordKeyColumn)} = w.${identifier(idColumn)}${ordering}
        LIMIT 1
      ) AS ${identifier("usage")}`;
    }

    const order = timestampColumn ? ` ORDER BY w.${identifier(timestampColumn)} DESC` : "";
    const query = `
      SELECT
        w.${identifier(wordColumn)} AS ${identifier("word")},
        ${optional(stemColumn, "stem")},
        ${optional(languageColumn, "lang")},
        ${optional(timestampColumn, "timestamp")},
        ${usage}
      FROM ${identifier(wordsTable)} w${order}
    `;
    const result = database.exec(query)[0];
    const rows = result?.values ?? [];
    const entries: KindleEntry[] = [];
    const seen = new Set<string>();
    let skippedNonEnglish = 0;
    let duplicates = 0;

    for (const row of rows) {
      const surface = cleanTerm(asText(row[0]));
      const stem = cleanTerm(asText(row[1]));
      const language = asText(row[2]).toLowerCase();
      if (language && !/^en(?:[-_]|$)/.test(language)) {
        skippedNonEnglish += 1;
        continue;
      }
      const term = stem || surface;
      if (!term || term.length > 80) continue;
      if (seen.has(term)) {
        duplicates += 1;
        continue;
      }
      seen.add(term);
      entries.push({
        term,
        surface: surface || term,
        context: asText(row[4]).replace(/\s+/g, " "),
        timestamp: typeof row[3] === "number" ? row[3] : null,
      });
    }

    return { entries, totalRows: rows.length, skippedNonEnglish, duplicates };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("This")) throw error;
    throw new Error("I could not read this Kindle database.");
  } finally {
    database.close();
  }
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function kindleCloze(entry: KindleEntry): ClozePrompt | null {
  if (!entry.context) return null;
  const candidates = [entry.surface, entry.term]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let sentence = entry.context;
  let replaced = false;

  for (const candidate of candidates) {
    const expression = new RegExp(`(^|[^\\p{L}])(${escapePattern(candidate)})(?=$|[^\\p{L}])`, "iu");
    if (!expression.test(sentence)) continue;
    sentence = sentence.replace(expression, "$1___");
    replaced = true;
    break;
  }
  if (!replaced) return null;

  const blank = sentence.indexOf("___");
  if (sentence.length > 320 && blank >= 0) {
    const start = Math.max(0, blank - 135);
    const end = Math.min(sentence.length, blank + 180);
    sentence = `${start ? "…" : ""}${sentence.slice(start, end).trim()}${end < entry.context.length ? "…" : ""}`;
  }

  return { sentence, answer: entry.surface || entry.term, hint: "from your Kindle" };
}
