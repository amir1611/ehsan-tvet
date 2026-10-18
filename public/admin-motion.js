// Fade-in entrances with staggered delays. Content stays visible if animation is unavailable.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const ease = 'cubic-bezier(.22,1,.36,1)';
function enter(elements, { y = 16, x = 0, delay = 0, step = 70, duration = 600 } = {}) {
  if (reduced.matches || document.hidden) return;
  [...elements].forEach((el, i) => {
    if (!el.animate) return;
    el.animate(
      [{ opacity: 0, transform: `translate(${x}px, ${y}px)` }, { opacity: 1, transform: 'translate(0, 0)' }],
      { duration, delay: delay + Math.min(i, 12) * step, easing: ease, fill: 'backwards' },
    );
  });
}
const $ = s => document.querySelector(s);
// Whole panel: sidebar slides in, then top bar, heading and content follow.
function enterPanel() {
  enter($('aside').children, { x: -14, y: 0, step: 45, duration: 500 });
  enter([$('.admin-top'), $('.admin-heading')], { y: -10, delay: 120, step: 90 });
}
new MutationObserver(() => { if (!$('#panel').hidden) enterPanel(); })
  .observe($('#panel'), { attributes: true, attributeFilter: ['hidden'] });
new MutationObserver(() => { if (!$('#login-view').hidden) enter($('#login-form').children, { step: 80 }); })
  .observe($('#login-view'), { attributes: true, attributeFilter: ['hidden'] });
if (!$('#login-view').hidden) enter($('#login-form').children, { step: 80 });
// Each time a tab or wizard step renders, content fades in one block after another.
const content = $('#admin-content');
new MutationObserver(() => {
  const blocks = content.querySelectorAll('.admin-stats .stat, .welcome-card, .admin-card, .admin-card > h2, .admin-actions, .stepper li, #wizard-form > *, .subtabs, #site-form > *, #user-form > *, #pw-form > *, .role-legend > *, .upload-box, .review, .pager');
  enter([...blocks].filter(el => !el.closest('.table-scroll')), { delay: 80, step: 55 });
  enter(content.querySelectorAll('.admin-table tbody tr'), { y: 10, delay: 200, step: 45, duration: 450 });
}).observe(content, { childList: true });
