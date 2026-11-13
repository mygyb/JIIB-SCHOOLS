// Primary schools say "pupil", not "student". Rather than editing hundreds of labels across the app, this swaps the wording
// in what is shown on screen (text, placeholders, titles) while a primary school is signed in. Names typed by people,
// form values, e-mail addresses and code-like words (student-fees, studentId) are left alone.
const WORD = /(?<![\w@./-])(Students?|students?|STUDENTS?)(?![\w@/-])/g;
const swap = (match: string) => {
  const plural = /s$/i.test(match);
  const base = match === match.toUpperCase() && match.length > 1 ? 'PUPIL' : /^S/.test(match) ? 'Pupil' : 'pupil';
  return plural ? (base === 'PUPIL' ? 'PUPILS' : `${base}s`) : base;
};
export const toPupilWording = (text: string) => text.replace(WORD, swap);

const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE']);

function fixNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement;
    if (!parent || SKIP.has(parent.tagName) || parent.isContentEditable) return;
    const value = node.nodeValue ?? '';
    const next = toPupilWording(value);
    if (next !== value) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as Element;
  if (SKIP.has(element.tagName) && element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA') return;
  for (const name of ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value) { const next = toPupilWording(value); if (next !== value) element.setAttribute(name, next); }
  }
  element.childNodes.forEach(fixNode);
}

/** Starts swapping the wording for everything on the page, now and as it changes. Returns a function that stops it. */
export function startPupilWording(root: HTMLElement = document.body) {
  fixNode(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') fixNode(record.target);
      else if (record.type === 'attributes') fixNode(record.target);
      else record.addedNodes.forEach(fixNode);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
  return () => observer.disconnect();
}
