import { reject } from './validation.js';

/** Parses bytes only after bounding them; detects duplicate decoded keys before JSON.parse. */
export function parseBoundedJson(bytes: Uint8Array, maxBytes: number, maxDepth: number): unknown {
  if (bytes.byteLength > maxBytes) reject('response_limit_exceeded');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    reject('response_malformed');
  }
  let pos = 0;
  const space = () => {
    while (/[\t\n\r ]/.test(text[pos] ?? '!')) pos++;
  };
  const string = (): string => {
    const start = pos++;
    while (pos < text.length) {
      const c = text[pos++];
      if (c === '\\') {
        pos++;
        continue;
      }
      if (c === '"') {
        try {
          return JSON.parse(text.slice(start, pos)) as string;
        } catch {
          reject('response_malformed');
        }
      }
    }
    reject('response_malformed');
  };
  function value(depth: number): void {
    if (depth > maxDepth) reject('response_limit_exceeded');
    space();
    const c = text[pos];
    if (c === '{' || c === '[') {
      pos++;
      space();
      const close = c === '{' ? '}' : ']';
      const keys = new Set<string>();
      if (text[pos] === close) {
        pos++;
        return;
      }
      for (;;) {
        if (c === '{') {
          if (text[pos] !== '"') reject('response_malformed');
          const key = string();
          if (keys.has(key) || ['__proto__', 'constructor', 'prototype'].includes(key))
            reject('response_malformed');
          keys.add(key);
          space();
          if (text[pos++] !== ':') reject('response_malformed');
        }
        value(depth + 1);
        space();
        if (text[pos] === close) {
          pos++;
          return;
        }
        if (text[pos++] !== ',') reject('response_malformed');
        space();
      }
    }
    if (c === '"') {
      string();
      return;
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      text.slice(pos),
    );
    if (!match) reject('response_malformed');
    pos += match[0].length;
  }
  value(0);
  space();
  if (pos !== text.length) reject('response_malformed');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    reject('response_malformed');
  }
}
