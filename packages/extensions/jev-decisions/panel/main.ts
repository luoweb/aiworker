import { connectHost, HostRequestError, type HostRequestErrorCode, type JsonValue } from '@openchamber/sdk';
import {
  applyHostReady,
  mountBadge,
  mountBanner,
  mountButton,
  mountEmpty,
  mountProgress,
  mountSelect,
  mountSpinner,
  mountTextField,
} from '@openchamber/sdk/ui';

import {
  JEV_QUESTION_TYPES,
  ZEN_FREE_MODEL,
  ZEN_KEYED_MODEL,
  ZEN_ORIGIN,
  ZEN_PATH,
  prepareRequest,
  readDraft,
  readEndpointError,
  readResponse,
  type Draft,
  type DraftIssue,
  type JevAnswer,
  type JevRequest,
  type JevResponse,
  type JevQuestionType,
  type QuestionDraft,
} from './jev.ts';
import { resolveDictionary, type Dictionary, type MessageKey } from './i18n.ts';

const host = connectHost();
const root = document.querySelector('#root');
if (!root) throw new Error('Missing root');

const DRAFT_KEY = 'jev-decisions/draft';

const css = `
.jev{max-width:840px;margin:auto;padding:20px;display:flex;flex-direction:column;gap:18px}
.jev *{box-sizing:border-box}
.jev h2{margin:0;font-size:13px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:var(--oc-muted)}
.jev p{margin:0}
.jev-qs{display:flex;flex-direction:column;gap:10px;margin-top:8px}
.jev-q{border:1px solid var(--oc-border);border-radius:var(--oc-radius);padding:12px;display:flex;flex-direction:column;gap:10px}
.jev-q-head{display:flex;align-items:flex-end;gap:8px}
.jev-q-head>div{flex:1;min-width:0}
.jev-note{color:var(--oc-muted);font-size:12px;line-height:1.5}
.jev-foot{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}
.jev-foot>div:first-child{flex:1;min-width:220px}
.jev-foot .jev-ask{align-self:flex-end}
.jev-answer{border:1px solid var(--oc-border);border-radius:var(--oc-radius);padding:12px;display:flex;flex-direction:column;gap:10px}
.jev-answer-instr{color:var(--oc-muted);font-size:12px;line-height:1.5}
.jev-value{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;font:600 21px/1.25 var(--oc-mono);letter-spacing:-.03em}
.jev-legend{font:400 13px/1.5 var(--oc-font);letter-spacing:0;color:var(--oc-muted)}
.jev-bars{display:flex;flex-direction:column;gap:8px}
.jev-bar-caption{display:flex;justify-content:space-between;gap:10px;font-size:13px;line-height:1.5}
.jev-meta{display:flex;align-items:center;gap:10px;color:var(--oc-muted);font:11px var(--oc-mono)}
.jev-meta .jev-fill{flex:1}
`;

const applyPanelStyle = (): void => {
  if (document.getElementById('jev-style')) return;
  const style = document.createElement('style');
  style.id = 'jev-style';
  style.textContent = css;
  document.head.append(style);
};

let questionCounter = Math.floor(Math.random() * 1e6);
const nextQuestionId = (): string => {
  questionCounter += 1;
  return `draft-${questionCounter}`;
};

const newQuestion = (type: JevQuestionType = 'choice'): QuestionDraft => ({
  id: nextQuestionId(),
  type,
  instructions: '',
  criteria: '',
});

const defaultDraft = (): Draft => ({
  state: '',
  model: ZEN_FREE_MODEL,
  questions: [newQuestion()],
});

const toStored = (draft: Draft): JsonValue => ({
  state: draft.state,
  model: draft.model,
  questions: draft.questions.map((entry) => ({
    type: entry.type,
    instructions: entry.instructions,
    criteria: entry.criteria,
  })),
});

/** The draft is small but every keystroke rewrites it, so writes are paced. */
const createSaver = (read: () => Draft) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    void host.storage.set(DRAFT_KEY, toStored(read()));
  };
  return {
    save: (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, 400);
    },
    flush,
  };
};

const percent = (value: number): string => `${Math.round(value * 100)}%`;

const issueMessage = (issue: DraftIssue): MessageKey => {
  switch (issue.code) {
    case 'state-required':
      return 'error.stateRequired';
    case 'questions-required':
      return 'error.questionsRequired';
    case 'instructions-required':
      return 'error.instructionsRequired';
    case 'criteria-required':
      return 'error.criteriaRequired';
    case 'criteria-malformed':
      return 'error.criteriaMalformed';
  }
};

/** `HOST_REJECTED` is also what an unknown wire code becomes, so it covers the rest. */
const hostFailure = (code: HostRequestErrorCode): MessageKey => {
  switch (code) {
    case 'NOT_GRANTED':
      return 'error.notGranted';
    case 'DISCONNECTED':
      return 'error.disconnected';
    case 'HOST_TIMEOUT':
      return 'error.hostTimeout';
    case 'HOST_UNAVAILABLE':
      return 'error.hostUnavailable';
    default:
      return 'error.hostRejected';
  }
};

type Failure = { key: MessageKey; detail: string | null };
type Ask = { request: JevRequest; response: JevResponse };

/**
 * Two ways to the same endpoint, and the credential picks which. A saved Zen key
 * lives on the server and the host attaches it, so `request` is the only path
 * that can spend money. With no key the free model is all that is reachable,
 * and it is called from this frame.
 */
const askJev = async (
  request: JevRequest,
  connected: boolean,
): Promise<{ ok: true; body: string } | { ok: false; failure: Failure }> => {
  const body = JSON.stringify(request);
  if (connected) {
    try {
      const result = await host.request({ method: 'POST', path: ZEN_PATH, body });
      return { ok: true, body: result.body };
    } catch (error) {
      const key = error instanceof HostRequestError ? hostFailure(error.code) : 'error.hostRejected';
      return { ok: false, failure: { key, detail: null } };
    }
  }
  try {
    const response = await fetch(`${ZEN_ORIGIN}${ZEN_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return { ok: true, body: await response.text() };
  } catch {
    return { ok: false, failure: { key: 'error.unreachable', detail: null } };
  }
};

const buildPanel = (locale: string, initiallyConnected: boolean) => {
  const dictionary: Dictionary = resolveDictionary(locale);
  const say = (key: MessageKey): string => dictionary[key];

  let draft: Draft = defaultDraft();
  let connected = initiallyConnected;
  let lastAsk: Ask | null = null;

  applyPanelStyle();
  const page = document.createElement('main');
  page.className = 'jev';
  root.replaceChildren(page);

  const bannerSlot = document.createElement('div');
  page.append(bannerSlot);
  const showFailure = (failure: Failure | null): void => {
    bannerSlot.replaceChildren();
    if (!failure) return;
    mountBanner(bannerSlot, {
      tone: 'error',
      title: say('error.title'),
      body: [say(failure.key), failure.detail].filter(Boolean).join(' '),
    });
  };

  const { save, flush } = createSaver(() => draft);

  const stateField = mountTextField(page, {
    label: say('state.label'),
    value: draft.state,
    placeholder: say('state.placeholder'),
    helper: say('state.helper'),
    multiline: true,
    rows: 4,
    onChange: (value) => { draft.state = value; save(); },
  });

  const questionsSlot = document.createElement('section');
  const questionsTitle = document.createElement('h2');
  questionsTitle.textContent = say('questions.title');
  const questionsList = document.createElement('div');
  questionsList.className = 'jev-qs';
  questionsSlot.append(questionsTitle, questionsList);
  page.append(questionsSlot);

  const addSlot = document.createElement('div');
  mountButton(addSlot, {
    label: say('question.add'),
    variant: 'ghost',
    size: 'sm',
    onClick: () => { draft.questions.push(newQuestion()); renderQuestions(); save(); },
  });
  questionsSlot.append(addSlot);

  const footer = document.createElement('div');
  footer.className = 'jev-foot';
  const modelSlot = document.createElement('div');
  const modelSelect = mountSelect(modelSlot, {
    label: say('model.label'),
    value: draft.model,
    options: [],
    onChange: (id) => {
      if (id !== ZEN_KEYED_MODEL && id !== ZEN_FREE_MODEL) return;
      draft.model = id;
      save();
    },
  });
  const modelNote = document.createElement('p');
  modelNote.className = 'jev-note';
  const askSlot = document.createElement('div');
  askSlot.classList.add('jev-ask');
  const askButton = mountButton(askSlot, { label: say('ask.label'), onClick: () => { void run(); } });
  const spinnerSlot = document.createElement('div');
  const spinner = mountSpinner(spinnerSlot);
  spinnerSlot.hidden = true;
  footer.append(modelSlot, modelNote, askSlot, spinnerSlot);
  page.append(footer);

  const resultsTitle = document.createElement('h2');
  resultsTitle.textContent = say('result.title');
  const results = document.createElement('div');
  results.className = 'jev-qs';
  page.append(resultsTitle, results);

  const bar = (label: string, sublabel: string | null, value: number, leading: boolean): HTMLElement => {
    const row = document.createElement('div');
    const caption = document.createElement('div');
    caption.className = 'jev-bar-caption';
    const name = document.createElement('span');
    name.textContent = label;
    const amount = document.createElement('span');
    amount.textContent = percent(value);
    caption.append(name, amount);
    row.append(caption);
    if (sublabel) {
      const hint = document.createElement('p');
      hint.className = 'jev-note';
      hint.textContent = sublabel;
      row.append(hint);
    }
    mountProgress(row, { value: value * 100, tone: leading ? 'primary' : 'neutral', label });
    return row;
  };

  const renderAnswer = (question: JevRequest['questions'][string], answer: JevAnswer): HTMLElement => {
    const card = document.createElement('div');
    card.className = 'jev-answer';

    const instruction = document.createElement('p');
    instruction.className = 'jev-answer-instr';
    instruction.textContent = question.instructions;

    const value = document.createElement('div');
    value.className = 'jev-value';

    if (answer.type === 'noul') {
      value.append(document.createTextNode(answer.value.toFixed(2)));
      mountProgress(card, { value: answer.value * 100, tone: 'primary', label: say('state.label') });
    }

    if (answer.type === 'choice') {
      const description = question.type === 'choice' ? question.criteria[answer.choice] : undefined;
      mountBadge(value, {
        label: description ? `${answer.choice} · ${description}` : answer.choice,
        tone: 'primary',
      });
      const bars = document.createElement('div');
      bars.className = 'jev-bars';
      answer.probabilities.forEach((entry, index) => {
        const hint = question.type === 'choice' ? question.criteria[entry.label] : undefined;
        bars.append(bar(entry.label, hint ?? null, entry.value, index === 0));
      });
      card.append(bars);
    }

    if (answer.type === 'score') {
      value.append(document.createTextNode(answer.score.toFixed(2)));
      const nearest = answer.legend[String(Math.round(answer.score))];
      if (nearest) {
        const legend = document.createElement('span');
        legend.className = 'jev-legend';
        legend.textContent = nearest;
        value.append(legend);
      }
      const bars = document.createElement('div');
      bars.className = 'jev-bars';
      for (const entry of answer.probabilities) {
        bars.append(bar(answer.legend[entry.label] ?? entry.label, null, entry.value, false));
      }
      card.append(bars);
    }

    if (answer.confidence !== null) {
      const confidence = document.createElement('span');
      confidence.className = 'jev-legend';
      confidence.textContent = `${say('result.confidence')} ${percent(answer.confidence)}`;
      value.append(confidence);
    }

    card.append(instruction, value);
    return card;
  };

  const renderResults = (): void => {
    results.replaceChildren();
    if (!lastAsk) {
      mountEmpty(results, { title: say('result.emptyTitle'), body: say('result.emptyBody') });
      return;
    }
    const meta = document.createElement('div');
    meta.className = 'jev-meta';
    const input = document.createElement('span');
    input.textContent = `${lastAsk.response.inputTokens ?? 0} in`;
    const output = document.createElement('span');
    output.textContent = `${lastAsk.response.outputTokens ?? 0} out`;
    const fill = document.createElement('span');
    fill.className = 'jev-fill';
    const model = document.createElement('span');
    model.textContent = lastAsk.response.model;
    meta.append(input, output, fill, model);
    results.append(meta);

    for (const [key, question] of Object.entries(lastAsk.request.questions)) {
      const answer = lastAsk.response.answers[key];
      if (answer) results.append(renderAnswer(question, answer));
    }
  };

  const renderModel = (): void => {
    const options = connected
      ? [
        { id: ZEN_KEYED_MODEL, label: ZEN_KEYED_MODEL, hint: say('model.keyed') },
        { id: ZEN_FREE_MODEL, label: ZEN_FREE_MODEL, hint: say('model.free') },
      ]
      : [{ id: ZEN_FREE_MODEL, label: ZEN_FREE_MODEL, hint: say('model.free') }];
    modelSelect.update({ value: draft.model, options, disabled: !connected });
    modelNote.textContent = connected ? '' : say('model.helperFree');
  };

  function questionCard(entry: QuestionDraft): HTMLElement {
    const card = document.createElement('div');
    card.className = 'jev-q';

    const head = document.createElement('div');
    head.className = 'jev-q-head';
    const typeSlot = document.createElement('div');
    head.append(typeSlot);
    card.append(head);

    mountButton(head, {
      label: say('question.remove'),
      variant: 'ghost',
      size: 'xs',
      onClick: () => {
        draft.questions = draft.questions.filter((candidate) => candidate.id !== entry.id);
        card.remove();
        save();
      },
    });

    const typeSelect = mountSelect(typeSlot, {
      label: say('question.type'),
      value: entry.type,
      options: JEV_QUESTION_TYPES.map((type) => ({ id: type, label: say(`type.${type}`) })),
      onChange: (id) => {
        const type = JEV_QUESTION_TYPES.find((candidate) => candidate === id);
        if (!type) return;
        entry.type = type;
        criteriaSlot.hidden = type === 'noul';
        criteria.update({ helper: type === 'choice' ? say('question.criteriaChoiceHelper') : say('question.criteriaScoreHelper') });
        save();
      },
    });

    mountTextField(card, {
      label: say('question.instructions'),
      value: entry.instructions,
      placeholder: say('question.instructionsPlaceholder'),
      onChange: (value) => { entry.instructions = value; save(); },
    });

    const criteriaSlot = document.createElement('div');
    card.append(criteriaSlot);
    const criteria = mountTextField(criteriaSlot, {
      label: say('question.criteria'),
      value: entry.criteria,
      helper: entry.type === 'choice' ? say('question.criteriaChoiceHelper') : say('question.criteriaScoreHelper'),
      multiline: true,
      rows: 3,
      mono: true,
      onChange: (value) => { entry.criteria = value; save(); },
    });
    criteriaSlot.hidden = entry.type === 'noul';

    return card;
  }

  function renderQuestions(): void {
    questionsList.replaceChildren();
    for (const entry of draft.questions) questionsList.append(questionCard(entry));
  }

  async function run(): Promise<void> {
    const prepared = prepareRequest({
      model: connected ? draft.model : ZEN_FREE_MODEL,
      state: draft.state,
      drafts: draft.questions,
    });
    if (!prepared.ok) {
      showFailure({ key: issueMessage(prepared.issues[0] ?? { code: 'state-required' }), detail: null });
      return;
    }
    flush();
    showFailure(null);
    askButton.update({ loading: true });
    spinnerSlot.hidden = false;
    try {
      const sent = await askJev(prepared.request, connected);
      if (!sent.ok) {
        showFailure(sent.failure);
        return;
      }
      const read = readResponse(sent.body);
      if (!read.ok) {
        showFailure({
          key: read.code === 'not-json' ? 'error.notJson' : 'error.answersUnreadable',
          detail: readEndpointError(sent.body),
        });
        return;
      }
      // An answer the panel cannot place under a question is not an answer it
      // should show, so it is treated as an unreadable body rather than a blank.
      const keys = Object.keys(prepared.request.questions);
      if (keys.some((key) => read.response.answers[key] === undefined)) {
        showFailure({ key: 'error.answersUnreadable', detail: null });
        return;
      }
      lastAsk = { request: prepared.request, response: read.response };
      renderResults();
    } finally {
      askButton.update({ loading: false });
      spinnerSlot.hidden = true;
    }
  }

  const restore = async (): Promise<void> => {
    let stored: JsonValue | undefined;
    try {
      stored = await host.storage.get(DRAFT_KEY);
    } catch {
      return;
    }
    const restored = readDraft(stored, nextQuestionId);
    if (!restored) return;
    draft = restored;
    stateField.update({ value: draft.state });
    renderQuestions();
    renderModel();
  };

  renderQuestions();
  renderModel();
  renderResults();
  void restore();

  return {
    dispose: () => {
      flush();
      page.remove();
    },
    applyConnection: (next: { connected: boolean }) => {
      connected = next.connected;
      // Without a key the paid model is not reachable, so it is not offered.
      if (!connected) draft.model = ZEN_FREE_MODEL;
      renderModel();
    },
  };
};

let panel: ReturnType<typeof buildPanel> | null = null;
let activeLocale: string | null = null;

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  // `ready` is sent again after a reconnect. Rebuilding on a different locale
  // is the only way the copy follows a language switch while the panel is open.
  if (panel && activeLocale !== context.locale) {
    panel.dispose();
    panel = null;
  }
  activeLocale = context.locale;
  panel ??= buildPanel(context.locale, context.connection.connected);
});

host.onConnection((connection) => {
  panel?.applyConnection(connection);
});