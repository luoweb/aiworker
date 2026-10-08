/**
 * The slice of the Jev System One contract this panel uses: a draft becomes a
 * request body, and a response body becomes values the panel can draw. No
 * network and no DOM here, so both directions can be checked on their own.
 */
import { isJsonValue, type JsonValue } from '@openchamber/sdk';

/** OpenCode Zen's System One endpoint. The free model needs no credential. */
export const ZEN_ORIGIN = 'https://opencode.ai';
export const ZEN_PATH = '/zen/v1/systemone';
export const ZEN_FREE_MODEL = 'jev-1.13-free';
export const ZEN_KEYED_MODEL = 'jev-1.13';

export const JEV_QUESTION_TYPES = ['noul', 'choice', 'score'] as const;

export type JevQuestionType = (typeof JEV_QUESTION_TYPES)[number];

export type QuestionDraft = {
  id: string;
  type: JevQuestionType;
  instructions: string;
  /**
   * One criterion per line, read according to `type`: `choice` wants
   * `key: description`, `score` wants the line itself as one step of the scale,
   * and `noul` never reads it.
   */
  criteria: string;
};

export type Question =
  | { key: string; type: 'noul'; instructions: string }
  | { key: string; type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { key: string; type: 'score'; instructions: string; criteria: string[] };

export type JevRequest = {
  model: string;
  state: string;
  questions: Record<string, Question>;
};

export type DraftIssue =
  | { code: 'state-required' }
  | { code: 'questions-required' }
  | { code: 'instructions-required'; questionId: string }
  | { code: 'criteria-required'; questionId: string }
  | { code: 'criteria-malformed'; questionId: string };

export type PrepareResult =
  | { ok: true; request: JevRequest }
  | { ok: false; issues: DraftIssue[] };

const lines = (text: string): string[] =>
  text.split('\n').map((line) => line.trim()).filter(Boolean);

/** `key: description`, split on the first colon so a description may hold more. */
const readChoiceLine = (line: string): readonly [string, string] | null => {
  const at = line.indexOf(':');
  if (at < 1) return null;
  const key = line.slice(0, at).trim();
  const description = line.slice(at + 1).trim();
  return key && description ? [key, description] : null;
};

/** One score step per line, lowest first. Jev reads the index as the position. */
export const readScoreCriteria = (text: string): string[] => lines(text);

/**
 * Keys become the option names Jev returns, so a duplicate would silently drop
 * an option. `null` marks a line that cannot be used, which keeps a short map
 * from ever looking like a complete one.
 */
export const readChoiceCriteria = (text: string): Record<string, string> | null => {
  const criteria: Record<string, string> = {};
  for (const line of lines(text)) {
    const pair = readChoiceLine(line);
    if (!pair || pair[0] in criteria) return null;
    criteria[pair[0]] = pair[1];
  }
  return criteria;
};

const questionKey = (index: number): string => `q${index + 1}`;

/**
 * Every question is checked before anything is returned, so one unusable row
 * cannot send a partial request and report it as a complete one.
 */
export const prepareRequest = (input: {
  model: string;
  state: string;
  drafts: readonly QuestionDraft[];
}): PrepareResult => {
  const issues: DraftIssue[] = [];
  const state = input.state.trim();
  if (!state) issues.push({ code: 'state-required' });
  if (input.drafts.length === 0) issues.push({ code: 'questions-required' });

  const questions: Record<string, Question> = {};
  input.drafts.forEach((draft, index) => {
    const instructions = draft.instructions.trim();
    if (!instructions) {
      issues.push({ code: 'instructions-required', questionId: draft.id });
      return;
    }
    const key = questionKey(index);
    if (draft.type === 'noul') {
      questions[key] = { key, type: 'noul', instructions };
      return;
    }
    if (draft.type === 'score') {
      const criteria = readScoreCriteria(draft.criteria);
      if (criteria.length < 2) {
        issues.push({ code: 'criteria-required', questionId: draft.id });
        return;
      }
      questions[key] = { key, type: 'score', instructions, criteria };
      return;
    }
    if (lines(draft.criteria).length === 0) {
      issues.push({ code: 'criteria-required', questionId: draft.id });
      return;
    }
    const criteria = readChoiceCriteria(draft.criteria);
    if (!criteria || Object.keys(criteria).length < 2) {
      issues.push({ code: 'criteria-malformed', questionId: draft.id });
      return;
    }
    questions[key] = { key, type: 'choice', instructions, criteria };
  });

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, request: { model: input.model, state, questions } };
};

export type JevProbability = { label: string; value: number };

export type JevAnswer =
  | { type: 'noul'; value: number; confidence: number | null }
  | { type: 'choice'; choice: string; confidence: number | null; probabilities: JevProbability[] }
  | {
    type: 'score';
    score: number;
    confidence: number | null;
    legend: Record<string, string>;
    probabilities: JevProbability[];
  };

export type JevResponse = {
  model: string;
  answers: Record<string, JevAnswer>;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type ReadFailure = 'not-json' | 'answers-unreadable';

export type ReadResult =
  | { ok: true; response: JevResponse }
  | { ok: false; code: ReadFailure };

export type Draft = {
  state: string;
  model: string;
  questions: QuestionDraft[];
};

/** A JSON object as the endpoint sent it, before any field has been proven. */
type Wire = Record<string, JsonValue>;

const readText = (value: JsonValue | undefined): string | null =>
  value !== undefined && String(value) === value ? value : null;

/** Round-tripped through `String` so `"5"`, `true` and `null` do not read as 5. */
const readNumber = (value: JsonValue | undefined): number | null => {
  if (value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && String(numeric) === String(value) ? numeric : null;
};

/** False for anything that is not a plain JSON object, arrays included. */
const isWire = (value: JsonValue | undefined): value is Wire => (
  value !== undefined && !Array.isArray(value) && Object(value) === value
);

/**
 * The body is parsed once, here, and everything below reads named fields off a
 * `JsonValue`. A body that is not JSON, or is JSON of another shape, becomes a
 * failure rather than an answer with holes in it.
 */
const readWire = (raw: string): Wire | null => {
  let parsed: JsonValue = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isJsonValue(parsed) && isWire(parsed) ? parsed : null;
};

/** Highest first, which is the order a person reads them in. */
const readProbabilities = (value: JsonValue | undefined): JevProbability[] => {
  const entries: JevProbability[] = [];
  if (!isWire(value)) return entries;
  for (const [label, weight] of Object.entries(value)) {
    const number = readNumber(weight);
    if (number !== null) entries.push({ label, value: number });
  }
  return entries.sort((left, right) => right.value - left.value);
};

/**
 * `probabilities` and `legend` are drawn when present and skipped when not: the
 * value itself is the answer, and a missing breakdown is not a broken response.
 */
const readAnswer = (value: JsonValue | undefined): JevAnswer | null => {
  if (!isWire(value)) return null;
  const confidence = readNumber(value.confidence);
  const kind = readText(value.type);
  if (kind === 'noul') {
    const noul = readNumber(value.noul);
    return noul === null ? null : { type: 'noul', value: noul, confidence };
  }
  if (kind === 'choice') {
    const choice = readText(value.choice);
    return choice === null
      ? null
      : { type: 'choice', choice, confidence, probabilities: readProbabilities(value.probabilities) };
  }
  if (kind === 'score') {
    const score = readNumber(value.score);
    if (score === null) return null;
    const legend: Record<string, string> = {};
    if (isWire(value.legend)) {
      for (const [label, text] of Object.entries(value.legend)) {
        const read = readText(text);
        if (read !== null) legend[label] = read;
      }
    }
    return {
      type: 'score',
      score,
      confidence,
      legend,
      probabilities: readProbabilities(value.probabilities),
    };
  }
  return null;
};

export const readResponse = (raw: string): ReadResult => {
  const root = readWire(raw);
  if (!root) return { ok: false, code: 'not-json' };
  if (!isWire(root.answers)) return { ok: false, code: 'answers-unreadable' };
  const answers: Record<string, JevAnswer> = {};
  for (const [key, value] of Object.entries(root.answers)) {
    const answer = readAnswer(value);
    if (!answer) return { ok: false, code: 'answers-unreadable' };
    answers[key] = answer;
  }
  return {
    ok: true,
    response: {
      model: readText(root.model) ?? '',
      answers,
      inputTokens: isWire(root.usage) ? readNumber(root.usage.input_tokens) : null,
      outputTokens: isWire(root.usage) ? readNumber(root.usage.output_tokens) : null,
    },
  };
};

/**
 * A stored draft is read back field by field. Anything in a shape this panel does
 * not draw is dropped rather than passed through, so a hand-edited or older file
 * cannot send something nobody saw on screen. Ids are handed out on the way in,
 * which is why they are not part of what gets stored.
 */
export const readDraft = (raw: JsonValue | undefined, freshId: () => string): Draft | null => {
  if (!isWire(raw)) return null;
  const questions: QuestionDraft[] = [];
  for (const row of Array.isArray(raw.questions) ? raw.questions : []) {
    if (!isWire(row)) return null;
    const type = JEV_QUESTION_TYPES.find((candidate) => candidate === readText(row.type));
    const instructions = readText(row.instructions);
    const criteria = readText(row.criteria);
    if (!type || instructions === null || criteria === null) return null;
    questions.push({ id: freshId(), type, instructions, criteria });
  }
  return {
    state: readText(raw.state) ?? '',
    model: readText(raw.model) === ZEN_KEYED_MODEL ? ZEN_KEYED_MODEL : ZEN_FREE_MODEL,
    questions,
  };
};

/**
 * What the endpoint says when it refuses. Its own words are better than ours, so
 * they are read out when present and the panel keeps its own copy otherwise.
 */
export const readEndpointError = (raw: string): string | null => {
  const root = readWire(raw);
  if (!root) return null;
  const nested = isWire(root.error) ? root.error.message : undefined;
  return readText(nested) ?? readText(root.message);
};
