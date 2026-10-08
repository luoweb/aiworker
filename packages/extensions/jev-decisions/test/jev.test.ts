import { describe, expect, test } from 'bun:test';

import {
  prepareRequest,
  readChoiceCriteria,
  readDraft,
  readEndpointError,
  readResponse,
  readScoreCriteria,
  type QuestionDraft,
} from '../panel/jev.ts';

const draft = (patch: Partial<QuestionDraft> & Pick<QuestionDraft, 'instructions' | 'type'>): QuestionDraft => ({
  id: 'd1',
  criteria: '',
  ...patch,
});

/** The body a real request produced, so the builder is checked against the wire. */
const state = 'The order arrived three days late and the box was damaged.';

const mixedDrafts: QuestionDraft[] = [
  draft({ id: 'd1', type: 'choice', instructions: 'Which team handles this?', criteria: 'returns: refunds, exchanges or damage\nshipping: late or lost delivery\nbilling: charges, invoices or payment' }),
  draft({ id: 'd2', type: 'score', instructions: 'How angry is the customer?', criteria: 'calm\ndissatisfied but contained\nfurious' }),
  draft({ id: 'd3', type: 'noul', instructions: 'Does this need action today?' }),
];

describe('prepareRequest', () => {
  test('keys every question and leaves noul without criteria', () => {
    const prepared = prepareRequest({ model: 'jev-1.13-free', state, drafts: mixedDrafts });
    expect(prepared).toEqual({
      ok: true,
      request: {
        model: 'jev-1.13-free',
        state,
        questions: {
          q1: {
            key: 'q1',
            type: 'choice',
            instructions: 'Which team handles this?',
            criteria: {
              returns: 'refunds, exchanges or damage',
              shipping: 'late or lost delivery',
              billing: 'charges, invoices or payment',
            },
          },
          q2: { key: 'q2', type: 'score', instructions: 'How angry is the customer?', criteria: ['calm', 'dissatisfied but contained', 'furious'] },
          q3: { key: 'q3', type: 'noul', instructions: 'Does this need action today?' },
        },
      },
    });
  });

  test('trims the state and the text of every question', () => {
    const prepared = prepareRequest({
      model: 'm',
      state: `  ${state}  `,
      drafts: [draft({ type: 'noul', instructions: '  padded  ' })],
    });
    expect(prepared.ok && prepared.request.state).toBe(state);
    expect(prepared.ok && prepared.request.questions.q1.instructions).toBe('padded');
  });

  test('reports an empty state and an empty question list together', () => {
    const prepared = prepareRequest({ model: 'm', state: '   ', drafts: [] });
    expect(prepared.ok).toBe(false);
    expect(prepared.ok === false && prepared.issues).toEqual([
      { code: 'state-required' },
      { code: 'questions-required' },
    ]);
  });

  test('checks every question, so one unusable row cannot hide a later one', () => {
    const prepared = prepareRequest({
      model: 'm',
      state,
      drafts: [
        draft({ id: 'd1', type: 'noul', instructions: '' }),
        draft({ id: 'd2', type: 'score', instructions: 'How bad?', criteria: 'only one step' }),
        draft({ id: 'd3', type: 'noul', instructions: 'fine' }),
      ],
    });
    expect(prepared.ok === false && prepared.issues).toEqual([
      { code: 'instructions-required', questionId: 'd1' },
      { code: 'criteria-required', questionId: 'd2' },
    ]);
  });

  test('needs two score steps, since one point is not a scale', () => {
    expect(prepareRequest({ model: 'm', state, drafts: [draft({ type: 'score', instructions: 'q', criteria: 'only' })] }).ok).toBe(false);
    expect(prepareRequest({ model: 'm', state, drafts: [draft({ type: 'score', instructions: 'q', criteria: 'low\nhigh' })] }).ok).toBe(true);
  });

  test('reports empty choice criteria as missing rather than malformed', () => {
    const prepared = prepareRequest({ model: 'm', state, drafts: [draft({ type: 'choice', instructions: 'q' })] });
    expect(prepared.ok === false && prepared.issues).toEqual([{ code: 'criteria-required', questionId: 'd1' }]);
  });

  test('rejects a repeated choice key instead of dropping the option', () => {
    const prepared = prepareRequest({
      model: 'm',
      state,
      drafts: [draft({ type: 'choice', instructions: 'q', criteria: 'a: first\na: second' })],
    });
    expect(prepared.ok === false && prepared.issues).toEqual([{ code: 'criteria-malformed', questionId: 'd1' }]);
  });

  test('rejects a line with no description', () => {
    const prepared = prepareRequest({
      model: 'm',
      state,
      drafts: [draft({ type: 'choice', instructions: 'q', criteria: 'a: first\nlonely' })],
    });
    expect(prepared.ok === false && prepared.issues).toEqual([{ code: 'criteria-malformed', questionId: 'd1' }]);
  });
});

describe('criteria readers', () => {
  test('splits on the first colon so a description may hold more', () => {
    expect(readChoiceCriteria('time: before 9:00 or after 17:00\nteam: support')).toEqual({
      time: 'before 9:00 or after 17:00',
      team: 'support',
    });
  });

  test('drops blank lines and reads a score scale in order', () => {
    expect(readScoreCriteria('\n calm \n\nfurious\n')).toEqual(['calm', 'furious']);
  });
});

describe('readResponse', () => {
  test('reads the mixed payload the endpoint returned', () => {
    const read = readResponse(JSON.stringify({
      model: 'jev-1.13-free',
      answers: {
        department: {
          type: 'choice',
          choice: 'returns',
          confidence: 1,
          probabilities: { returns: 1, shipping: 0, billing: 0 },
        },
        frustration: {
          type: 'score',
          score: 1.24,
          confidence: 0.64,
          legend: { 0: 'calm', 1: 'dissatisfied but contained', 2: 'furious' },
          probabilities: { 0: 0, 1: 0.76, 2: 0.24 },
        },
        is_urgent: { type: 'noul', noul: 0.9 },
      },
      usage: { input_tokens: 442, output_tokens: 73 },
      cost: '0',
    }));

    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.response.model).toBe('jev-1.13-free');
    expect(read.response.inputTokens).toBe(442);
    expect(read.response.outputTokens).toBe(73);
    expect(read.response.answers.department).toEqual({
      type: 'choice',
      choice: 'returns',
      confidence: 1,
      probabilities: [
        { label: 'returns', value: 1 },
        { label: 'shipping', value: 0 },
        { label: 'billing', value: 0 },
      ],
    });
    expect(read.response.answers.frustration).toEqual({
      type: 'score',
      score: 1.24,
      confidence: 0.64,
      legend: { 0: 'calm', 1: 'dissatisfied but contained', 2: 'furious' },
      probabilities: [
        { label: '1', value: 0.76 },
        { label: '2', value: 0.24 },
        { label: '0', value: 0 },
      ],
    });
    expect(read.response.answers.is_urgent).toEqual({ type: 'noul', value: 0.9, confidence: null });
  });

  test('orders probabilities by weight rather than by key', () => {
    const read = readResponse(JSON.stringify({
      answers: { q1: { type: 'choice', choice: 'b', probabilities: { a: 0.1, b: 0.7, c: 0.2 } } },
    }));
    expect(read.ok && read.response.answers.q1.type === 'choice' && read.response.answers.q1.probabilities)
      .toEqual([{ label: 'b', value: 0.7 }, { label: 'c', value: 0.2 }, { label: 'a', value: 0.1 }]);
  });

  test('keeps the value when the breakdown is missing', () => {
    const read = readResponse(JSON.stringify({ answers: { q1: { type: 'choice', choice: 'returns' } } }));
    expect(read.ok && read.response.answers.q1).toEqual({
      type: 'choice',
      choice: 'returns',
      confidence: null,
      probabilities: [],
    });
  });

  test('keeps a score without its legend', () => {
    const read = readResponse(JSON.stringify({ answers: { q1: { type: 'score', score: 0.5 } } }));
    expect(read.ok && read.response.answers.q1).toEqual({
      type: 'score',
      score: 0.5,
      confidence: null,
      legend: {},
      probabilities: [],
    });
  });

  test('refuses a body that is not the answers it expects', () => {
    expect(readResponse('<html>gateway timeout</html>')).toEqual({ ok: false, code: 'not-json' });
    expect(readResponse('null')).toEqual({ ok: false, code: 'not-json' });
    expect(readResponse('[]')).toEqual({ ok: false, code: 'not-json' });
    expect(readResponse('{"model":"jev-1.13-free"}')).toEqual({ ok: false, code: 'answers-unreadable' });
    expect(readResponse('{"answers":{"q1":{"type":"choice"}}}')).toEqual({ ok: false, code: 'answers-unreadable' });
    expect(readResponse('{"answers":{"q1":{"type":"unknown"}}}')).toEqual({ ok: false, code: 'answers-unreadable' });
  });

  test('treats an error body as unreadable answers, which is what it is', () => {
    const body = JSON.stringify({ type: 'error', error: { type: 'AuthError', message: 'Invalid API key.' } });
    expect(readResponse(body)).toEqual({ ok: false, code: 'answers-unreadable' });
    expect(readEndpointError(body)).toBe('Invalid API key.');
  });

  test('reports no endpoint message when the body has none', () => {
    expect(readEndpointError('not json')).toBeNull();
    expect(readEndpointError('{}')).toBeNull();
  });
});

describe('readDraft', () => {
  let counter = 0;
  const freshId = (): string => {
    counter += 1;
    return `fresh-${counter}`;
  };

  test('gives every restored row a fresh id, since ids are not stored', () => {
    const restored = readDraft({
      state: 'the situation',
      model: 'jev-1.13',
      questions: [
        { type: 'choice', instructions: 'a', criteria: 'x: 1\ny: 2' },
        { type: 'noul', instructions: 'b', criteria: '' },
      ],
    }, freshId);
    expect(restored).toEqual({
      state: 'the situation',
      model: 'jev-1.13',
      questions: [
        { id: 'fresh-1', type: 'choice', instructions: 'a', criteria: 'x: 1\ny: 2' },
        { id: 'fresh-2', type: 'noul', instructions: 'b', criteria: '' },
      ],
    });
  });

  test('falls back to the free model for a stored model it does not know', () => {
    const restored = readDraft({ model: 'something-else', questions: [] }, freshId);
    expect(restored?.model).toBe('jev-1.13-free');
  });

  test('refuses a row whose type or text is not what the panel draws', () => {
    expect(readDraft({ questions: [{ type: 'guess', instructions: 'a', criteria: '' }] }, freshId)).toBeNull();
    expect(readDraft({ questions: [{ type: 'noul', instructions: 7, criteria: '' }] }, freshId)).toBeNull();
    expect(readDraft({ questions: [{ type: 'noul', instructions: 'a' }] }, freshId)).toBeNull();
    expect(readDraft({ questions: ['not a row'] }, freshId)).toBeNull();
  });

  test('refuses anything that is not a stored object', () => {
    expect(readDraft(undefined, freshId)).toBeNull();
    expect(readDraft('state', freshId)).toBeNull();
    expect(readDraft([{ type: 'noul' }], freshId)).toBeNull();
  });

  test('reads an empty draft rather than refusing it, so the panel opens on it', () => {
    expect(readDraft({}, freshId)).toEqual({ state: '', model: 'jev-1.13-free', questions: [] });
  });
});