/**
 * QA #77: text fields follow the language being typed. A Hebrew page used to keep an English entry right-to-left.
 *
 * Every text input / textarea without an explicit `dir` gets `dir="auto"` (the browser picks the direction from the
 * first strong letter, live while typing). While a field is empty, CSS keeps the page direction so the placeholder
 * still sits on the right side in Hebrew (see index.css, `[data-autodir]`).
 */
const TEXT = ':is([type="text"], [type="search"], [type="email"], [type="url"], :not([type]))';
// QA #117: fields written with dir="auto" in JSX were skipped, so while empty they fell back to left-to-right and a
// Hebrew placeholder sat on the left. They get the same marker (page direction while empty) as unmarked fields.
const SELECTOR = [
  'textarea:not([dir])', `input:not([dir])${TEXT}`,
  'textarea[dir="auto"]:not([data-autodir])', `input[dir="auto"]:not([data-autodir])${TEXT}`,
].join(', ');

function mark(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
    el.setAttribute('dir', 'auto');
    el.setAttribute('data-autodir', '');
    // An empty field is detected with :placeholder-shown, which needs a placeholder: an invisible one does.
    if (!el.hasAttribute('placeholder')) el.setAttribute('placeholder', ' ');
  });
}

export function installAutoDir() {
  if (typeof document === 'undefined') return;
  const run = () => mark(document);
  run();
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; run(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
}
