export function enhanceProgrammeDropdown(select) {
  const wrapper = document.createElement('div');
  wrapper.className = 'programme-dropdown';
  select.before(wrapper);
  wrapper.append(select);
  select.hidden = true;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'programme-dropdown-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', 'Program yang diminati');
  trigger.setAttribute('aria-controls', 'programme-options');
  const text = document.createElement('span');
  trigger.append(text);
  const list = document.createElement('div');
  list.id = 'programme-options';
  list.className = 'programme-dropdown-options';
  list.role = 'listbox';
  list.setAttribute('aria-label', 'Program yang diminati');
  list.hidden = true;
  wrapper.append(trigger, list);
  let search = '';
  let lastKey = 0;

  function close(restoreFocus = false) {
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }
  function refresh() {
    text.textContent = select.selectedOptions[0]?.textContent || '';
    trigger.disabled = select.disabled;
    list.replaceChildren();
    for (const option of select.options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.role = 'option';
      item.tabIndex = -1;
      item.disabled = option.disabled;
      item.textContent = option.textContent;
      item.setAttribute('aria-selected', String(option.selected));
      item.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('input', {bubbles: true}));
        select.dispatchEvent(new Event('change', {bubbles: true}));
        close(true);
      });
      list.append(item);
    }
  }
  function open(last = false) {
    refresh();
    list.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const options = [...list.children].filter(option => !option.disabled);
    const selected = options.find(option => option.getAttribute('aria-selected') === 'true');
    (last ? options.at(-1) : selected || options[0])?.focus();
  }
  trigger.addEventListener('click', () => list.hidden ? open() : close());
  trigger.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      open(event.key === 'ArrowUp');
    }
  });
  list.addEventListener('keydown', event => {
    const options = [...list.children].filter(option => !option.disabled);
    const index = options.indexOf(document.activeElement);
    const positions = {ArrowDown: (index + 1) % options.length, ArrowUp: (index - 1 + options.length) % options.length, Home: 0, End: options.length - 1};
    if (event.key in positions) {
      event.preventDefault();
      options[positions[event.key]]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      close();
      // Return to the trigger so the browser advances through the form normally.
      trigger.focus();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== ' ') {
      event.preventDefault();
      search = Date.now() - lastKey > 600 ? event.key : search + event.key;
      lastKey = Date.now();
      options.find(option => option.textContent.toLocaleLowerCase().startsWith(search.toLocaleLowerCase()))?.focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!wrapper.contains(event.target)) close();
  });
  wrapper.addEventListener('focusout', () => {
    queueMicrotask(() => { if (!wrapper.contains(document.activeElement)) close(); });
  });
  select.addEventListener('change', refresh);
  select.form?.addEventListener('reset', () => queueMicrotask(refresh));
  new MutationObserver(refresh).observe(select, {childList: true, subtree: true});
  refresh();
}
