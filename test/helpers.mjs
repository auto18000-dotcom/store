// Runs one of the Store's browser scripts in a bare vm context with just enough of a page around it. No dependencies:
//   node --test test/*.test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const store = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'store');

/** An element with the few members the scripts touch. Properties set on it stay readable, so a test can look at them. */
export class FakeEl {
  constructor() {
    this.attrs = {};
    this.listeners = {};
    this.style = {};
    this.tabIndex = -1;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attrs[name];
    delete this[name];
  }

  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  /** Fire an event the way a browser would; returns it so a test can read defaultPrevented. */
  fire(type, init = {}) {
    const event = { type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...init };
    for (const fn of this.listeners[type] || []) fn(event);
    return event;
  }
}

/**
 * @param file     a file in public/store
 * @param location what the page's address says (hostname, pathname, search)
 * @param flags    names of the flags that are on, for a script that only reads them (omit to leave TourGuidFlags unset)
 * @param journey  a stand-in for window.TourGuidJourney
 * @param storage  a stand-in for localStorage (omit to leave it undefined, as when a browser blocks it)
 */
export function load(file, { location = {}, flags, journey, storage } = {}) {
  const ctx = {
    URL,
    URLSearchParams,
    console,
    location: { hostname: 'tourguid.net', pathname: '/store/', search: '', ...location },
  };
  ctx.window = ctx;
  if (flags) ctx.TourGuidFlags = { get: (name) => flags.includes(name) };
  if (journey) ctx.TourGuidJourney = journey;
  if (storage !== undefined) ctx.localStorage = storage;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(store, file), 'utf8'), ctx, { filename: file });
  return ctx;
}
