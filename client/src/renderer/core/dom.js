export function $(selector) {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

export function optional(selector) {
  return document.querySelector(selector);
}
