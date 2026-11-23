import { describe, expect, test } from 'bun:test';

import { SUPPORTED_LOCALES } from '@/lib/utils/locale-config';

// Spaces (channels and DMs, flag `chat`) read `spaces.*`. Every locale has
// its own string for every key, with the same placeholders as English.

type Catalog = { [key: string]: string | Catalog };
const flatten = (node: Catalog, prefix = ''): Record<string, string> =>
  Object.entries(node).reduce<Record<string, string>>((out, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? { ...out, [path]: value } : { ...out, ...flatten(value, path) };
  }, {});

const en = flatten(require('./en.json').spaces);
const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort();

describe('spaces strings', () => {
  for (const locale of SUPPORTED_LOCALES) {
    test(`${locale} has every key with the English placeholders`, () => {
      const strings = flatten(require(`./${locale}.json`).spaces);
      expect(Object.keys(strings).sort()).toEqual(Object.keys(en).sort());
      for (const [key, text] of Object.entries(en)) {
        expect(strings[key]).toBeTruthy();
        expect(placeholders(strings[key])).toEqual(placeholders(text));
      }
    });
  }
});
