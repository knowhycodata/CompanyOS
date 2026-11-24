import { afterAll, afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot, type Container } from 'react-dom/client';

import { defaultUiMessages } from '../../i18n';
import { SessionStarters } from './session-starters';

const browser = new Window({ url: 'http://localhost' });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  HTMLElement: browser.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, value });
}
const host = browser.document.createElement('div');
browser.document.body.append(host);
const root = createRoot(host as unknown as Container);

afterEach(() => act(() => root.render(null)));
afterAll(() => {
  act(() => root.unmount());
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  browser.happyDOM.abort();
});

test('each starting point hands editable text to the composer without submitting its form', () => {
  const picked: string[] = [];
  let submitted = false;
  act(() => root.render(
    <form onSubmit={(event) => { event.preventDefault(); submitted = true; }}>
      <SessionStarters onPick={(prompt) => picked.push(prompt)} />
    </form>,
  ));
  const buttons = host.querySelectorAll('button');
  expect(buttons).toHaveLength(4);
  expect(picked).toEqual([]);
  for (const button of buttons) act(() => button.click());
  const copy = defaultUiMessages.sessionStart;
  expect(picked).toEqual([copy.build.prompt, copy.research.prompt, copy.review.prompt, copy.plan.prompt]);
  expect(submitted).toBe(false);
});

test('starting points cannot change the draft while a session is being created', () => {
  const picked: string[] = [];
  act(() => root.render(<SessionStarters disabled onPick={(prompt) => picked.push(prompt)} />));
  for (const button of host.querySelectorAll('button')) {
    expect(button.disabled).toBe(true);
    act(() => button.click());
  }
  expect(picked).toEqual([]);
});
