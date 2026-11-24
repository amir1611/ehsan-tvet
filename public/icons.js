// Lucide 0.468.0. Local SVG assets; see assets/icons/LICENSE.
export function icon(name) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="/assets/icons/sprite.svg#${name}"></use></svg>`;
}

const symbols = {
  '↗': 'arrow-up-right', '←': 'arrow-left', '→': 'arrow-right',
  '↓': 'download', '▶': 'play', '✧': 'sparkles',
  '▦': 'layout-dashboard', '▤': 'file-text', '◇': 'graduation-cap',
  '✉': 'mail', '☺': 'users', '☰': 'list', '⚿': 'key-round',
  '↪': 'log-out', '✓': 'check', '×': 'x', '◉': 'eye',
};
const pattern = /([↗←→↓▶✧▦▤◇✉☺☰⚿↪✓×◉])/g;

// Handle both initial markup and CMS-generated labels without changing their text.
function enhance(root) {
  if (root.nodeType === Node.ELEMENT_NODE && root.closest('svg,script,style,textarea,option,input,.brand')) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = root.nodeType === Node.TEXT_NODE ? [root] : [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!node.parentElement || node.parentElement.closest('svg,script,style,textarea,option,input,.brand')) continue;
    if (!node.parentElement.closest('button,a,.play,.small-seal,.stepper')) continue;
    const text = node.textContent;
    const parts = text.split(pattern);
    if (parts.length === 1) {
      // Add actions use a proper plus icon; leave ordinary prose untouched.
      if (!/^\+\s+Tambah /.test(text) || !node.parentElement.closest('button')) continue;
      parts.splice(0, 1, '', '+', text.slice(1));
    }
    const fragment = document.createDocumentFragment();
    for (const part of parts) {
      const name = symbols[part] || (part === '+' ? 'plus' : null);
      if (name) {
        const template = document.createElement('template');
        template.innerHTML = icon(name);
        fragment.append(template.content);
      } else fragment.append(document.createTextNode(part));
    }
    node.replaceWith(fragment);
  }
}

enhance(document.body);
new MutationObserver(records => {
  for (const record of records) for (const node of record.addedNodes) enhance(node);
}).observe(document.body, {childList: true, subtree: true});
