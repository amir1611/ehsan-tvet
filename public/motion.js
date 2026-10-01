// Motion enhances the page; content remains visible if animation is unavailable.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const activeAnimations = new Set();
function animate(element, frames, options) {
  if (reduced.matches || document.hidden || !element.animate) return;
  const animation = element.animate(frames, options);
  activeAnimations.add(animation);
  animation.finished.catch(() => {}).finally(() => activeAnimations.delete(animation));
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) activeAnimations.forEach(animation => animation.finish());
});
reduced.addEventListener('change', () => {
  if (reduced.matches) activeAnimations.forEach(animation => animation.cancel());
});
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    animate(entry.target, [{ opacity: 0, transform: 'translateY(25px)' }, { opacity: 1, transform: 'translateY(0)' }], {
      duration: 750, easing: 'cubic-bezier(.22,1,.36,1)',
    });
    observer.unobserve(entry.target);
  });
}, { threshold: 0.12 });
document.querySelectorAll('.section-top, .about-photo, .about-copy, .campus figure, .faq-items, .contact form').forEach(element => observer.observe(element));
// A short opening sequence runs once, without delaying content or navigation.
document.querySelectorAll('.hero-copy > *, .hero-visual').forEach((element, index) => {
  animate(element, [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], {
    duration: 650, delay: Math.min(index * 65, 325), easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards',
  });
});
const progress = document.querySelector('.reading-progress');
const header = document.querySelector('header');
let scheduled = false;
function updateScroll() {
  const distance = document.documentElement.scrollHeight - innerHeight;
  progress.style.transform = `scaleX(${distance > 0 ? Math.min(1, scrollY / distance) : 0})`;
  header.classList.toggle('scrolled', scrollY > 20);
  scheduled = false;
}
addEventListener('scroll', () => {
  if (!scheduled) { requestAnimationFrame(updateScroll); scheduled = true; }
}, { passive: true });
addEventListener('resize', updateScroll);
updateScroll();
const dock = document.querySelector('.mobile-dock');
new IntersectionObserver(entries => {
  entries.forEach(entry => {
    const hidden = entry.isIntersecting;
    dock.classList.toggle('dock-hidden', hidden);
    dock.inert = hidden;
  });
}, { threshold: 0.05 }).observe(document.querySelector('#hubungi'));
const navigation = document.querySelector('#navigation');
const menu = document.querySelector('.menu');
function closeMenu() {
  navigation.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', 'Buka menu');
}
addEventListener('keydown', event => {
  if (event.key === 'Escape' && navigation.classList.contains('open')) { closeMenu(); menu.focus(); }
});
document.addEventListener('click', event => {
  if (!header.contains(event.target)) closeMenu();
});
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
const sectionObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    navigation.querySelectorAll('a').forEach(link => {
      const current = link.hash === `#${entry.target.id}`;
      link.classList.toggle('current', current);
      if (current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  });
}, { rootMargin: '-15% 0px -55% 0px' });
document.querySelectorAll('#program, #tentang, #kampus, #soalan').forEach(section => sectionObserver.observe(section));
// Native details keep keyboard behavior while their content gains a short reveal.
document.querySelectorAll('.faq details').forEach(detail => {
  detail.addEventListener('toggle', () => {
    if (detail.open) animate(detail.querySelector('p'), [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 280, easing: 'ease-out' });
  });
});
document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.classList.contains('active'))));
