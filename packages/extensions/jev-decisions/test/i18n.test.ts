import { describe, expect, test } from 'bun:test';

import { resolveDictionary, type MessageKey } from '../panel/i18n.ts';

/**
 * The host ships every locale at once, so an English string left standing in a
 * translated dictionary is a visible bug rather than a deferral. These are the
 * tags `HostReadyContext.locale` can carry.
 */
const HOST_LOCALES = ['en', 'de', 'fr', 'nl', 'zh-CN', 'zh-TW', 'uk', 'es', 'pt-BR', 'ko', 'pl', 'ja', 'tr'];

/** Deliberately not an English word, so it cannot survive as an untranslated stand-in. */
const SAMPLE: MessageKey = 'ask.label';

describe('resolveDictionary', () => {
  test('covers every locale the host ships', () => {
    for (const tag of HOST_LOCALES) {
      const dictionary = resolveDictionary(tag);
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(resolveDictionary('en')).sort());
    }
  });

  test('leaves no locale showing English for the sample key', () => {
    const english = resolveDictionary('en')[SAMPLE];
    for (const tag of HOST_LOCALES.filter((candidate) => candidate !== 'en')) {
      expect(resolveDictionary(tag)[SAMPLE]).not.toBe(english);
    }
  });

  test('matches a tag regardless of case and surrounding space', () => {
    expect(resolveDictionary('  zh-cn ')[SAMPLE]).toBe(resolveDictionary('zh-CN')[SAMPLE]);
  });

  test('falls back to English for a tag it does not ship, rather than showing nothing', () => {
    expect(resolveDictionary('xx-YY')).toBe(resolveDictionary('en'));
    expect(resolveDictionary('')).toBe(resolveDictionary('en'));
  });
});
