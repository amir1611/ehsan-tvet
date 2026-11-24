import {icon} from './icons.js';

function enhance(root) {
  const inputs = root.nodeType === Node.ELEMENT_NODE
    ? [...(root.matches('input[type="password"]') ? [root] : []), ...root.querySelectorAll('input[type="password"]')]
    : [];
  for (const input of inputs) {
    if (input.closest('.password-field')) continue;
    const wrapper = document.createElement('div');
    wrapper.className = 'password-field';
    input.before(wrapper);
    wrapper.append(input);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'password-toggle';
    toggle.setAttribute('aria-label', 'Show password');
    toggle.setAttribute('aria-pressed', 'false');
    toggle.innerHTML = icon('eye');
    toggle.addEventListener('click', () => {
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
      toggle.setAttribute('aria-pressed', String(visible));
      toggle.innerHTML = icon(visible ? 'eye-off' : 'eye');
    });
    wrapper.append(toggle);
    input.form?.addEventListener('reset',()=>{input.type='password';toggle.setAttribute('aria-pressed','false');toggle.setAttribute('aria-label','Show password');toggle.innerHTML=icon('eye')});
  }
}

enhance(document.body);
new MutationObserver(records => {
  for (const record of records) for (const node of record.addedNodes) enhance(node);
}).observe(document.body, {childList: true, subtree: true});
