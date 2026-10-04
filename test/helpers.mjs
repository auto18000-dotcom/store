// Runs the Store's browser scripts in a bare vm context with just enough of a page around them. No dependencies:
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

/** A text node. */
class FakeText {
  constructor(text) {
    this.text = String(text);
  }

  get textContent() {
    return this.text;
  }
}

/** A small element tree: enough of the DOM for the handoff sheet to be built and read back. */
export class FakeNode extends FakeEl {
  constructor(tag) {
    super();
    this.tag = tag;
    this.children = [];
    this.className = '';
    this.id = '';
    this.open = false;
  }

  append(...nodes) {
    for (const node of nodes) this.children.push(typeof node === 'string' ? new FakeText(node) : node);
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  set textContent(value) {
    this.children = [new FakeText(value)];
  }

  get textContent() {
    return this.children.map((child) => child.textContent).join('');
  }

  /** Every element below this one, depth first. */
  all() {
    return this.children.flatMap((child) => (child instanceof FakeNode ? [child, ...child.all()] : []));
  }

  /** Supports 'tag', '#id' and '.class', which is all the scripts use on a built sheet. */
  querySelector(selector) {
    const test = selector.startsWith('#')
      ? (node) => node.id === selector.slice(1)
      : selector.startsWith('.')
        ? (node) => node.className.split(/\s+/).includes(selector.slice(1))
        : (node) => node.tag === selector;
    return this.all().find(test) || null;
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
    this.fire('close');
  }

  click() {
    return this.fire('click');
  }
}

/** Just enough document for journey-ui.js to load and build a dialog. */
export function fakeDocument() {
  const body = new FakeNode('body');
  return {
    body,
    createElement: (tag) => new FakeNode(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener() {},
  };
}

/** The whole text of a built element, one line per element that holds text of its own. */
export function linesOf(node) {
  const out = [];
  const walk = (current) => {
    const own = current.children.filter((child) => !(child instanceof FakeNode)).map((child) => child.textContent).join('');
    if (own.trim()) out.push(own.trim());
    for (const child of current.children) if (child instanceof FakeNode) walk(child);
  };
  walk(node);
  return out;
}

/**
 * A context to run scripts in. Options:
 *   location  what the page's address says (hostname, pathname, search)
 *   flags     names of the flags that are on, for a script that only reads them (omit to leave TourGuidFlags unset)
 *   journey   a stand-in for window.TourGuidJourney
 *   storage   a stand-in for localStorage (omit to leave it undefined, as when a browser blocks it)
 *   fetch     a stand-in for fetch
 *   document  a stand-in for document
 *   open      a stand-in for window.open
 */
export function makeContext({ location = {}, flags, journey, storage, fetch, document, open } = {}) {
  const ctx = {
    URL,
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
    location: { hostname: 'tourguid.net', pathname: '/store/', search: '', ...location },
  };
  ctx.window = ctx;
  if (flags) ctx.TourGuidFlags = { get: (name) => flags.includes(name) };
  if (journey) ctx.TourGuidJourney = journey;
  if (storage !== undefined) ctx.localStorage = storage;
  if (fetch) ctx.fetch = fetch;
  if (document) ctx.document = document;
  if (open) ctx.open = open;
  return vm.createContext(ctx);
}

/** Run one file of public/store in a context. */
export function run(ctx, file) {
  vm.runInContext(fs.readFileSync(path.join(store, file), 'utf8'), ctx, { filename: file });
  return ctx;
}

/** One file in a fresh context. */
export function load(file, options) {
  return run(makeContext(options), file);
}
