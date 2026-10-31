type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | ((event: never) => void) | undefined>;

/** Minimal hyperscript: enough for this UI, without pulling in a framework. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'class') {
      el.className = String(value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  el.append(
    ...children
      .filter((c) => c !== null && c !== undefined && c !== false)
      .map((c) => (typeof c === 'number' ? String(c) : (c as Node | string))),
  );
  return el;
}

export const clear = (el: Element): void => el.replaceChildren();
