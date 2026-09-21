import { animate, inView, scroll, stagger } from 'https://cdn.jsdelivr.net/npm/motion@13.4.0/+esm';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOut = [0.16, 1, 0.3, 1];

function setReady(elements) {
  elements.forEach(element => {
    element.classList.add('motion-item');
    if (reduceMotion) element.classList.add('is-visible');
  });
}

function revealGroup(sectionSelector, itemSelector, options = {}) {
  const section = document.querySelector(sectionSelector);
  const elements = [...document.querySelectorAll(itemSelector)];
  if (!section || !elements.length) return;
  setReady(elements);
  if (reduceMotion) return;

  elements.forEach(element => {
    element.style.setProperty('--motion-from', options.fromX ? `${options.fromX}px 0` : `0 ${options.fromY ?? 16}px`);
    element.style.opacity = '0';
    element.style.translate = options.fromX ? `${options.fromX}px 0` : `0 ${options.fromY ?? 16}px`;
  });

  inView(section, () => {
    animate(
      elements,
      { opacity: [0, 1], translate: ['var(--motion-from, 0 16px)', '0 0'] },
      {
        duration: options.duration ?? 0.58,
        delay: stagger(options.stagger ?? 0.055, { startDelay: options.startDelay ?? 0.02 }),
        ease: easeOut
      }
    );
    elements.forEach(element => {
      element.classList.add('is-visible');
    });
  }, { margin: '0px 0px -10% 0px', amount: 0.12 });
}

function animateHero() {
  if (reduceMotion || document.querySelector('#landing')?.classList.contains('hidden')) return;
  const copy = [...document.querySelectorAll('.marketing-hero-copy > h1, .marketing-hero-copy > p, .marketing-hero-actions, .marketing-trust-line')];
  const visual = document.querySelector('.marketing-hero-visual');
  animate(copy, { opacity: [0, 1], y: [18, 0] }, { duration: 0.62, delay: stagger(0.065), ease: easeOut });
  if (visual) animate(visual, { opacity: [0, 1], y: [16, 0], scale: [0.985, 1] }, { duration: 0.82, delay: 0.13, ease: easeOut });
}

function installScrollProgress() {
  const indicator = document.querySelector('.marketing-scroll-progress');
  if (!indicator || reduceMotion) return;
  const progressAnimation = animate(indicator, { scaleX: [0, 1] }, { ease: 'linear' });
  scroll(progressAnimation);
}

function installHeroDrift() {
  const hero = document.querySelector('.marketing-hero');
  const copy = document.querySelector('.marketing-hero-copy');
  const visual = document.querySelector('.marketing-hero-visual');
  if (!hero || !copy || !visual || reduceMotion) return;
  scroll(animate(copy, { y: [0, -12] }, { ease: 'linear' }), { target: hero, offset: ['start start', 'end start'] });
  scroll(animate(visual, { y: [0, -22] }, { ease: 'linear' }), { target: hero, offset: ['start start', 'end start'] });
}

function installArrowMotion() {
  const switcher = document.querySelector('#classSwitcher');
  const arrow = document.querySelector('.class-switcher-arrow');
  if (!switcher || !arrow || reduceMotion) return;
  switcher.addEventListener('pointerenter', () => {
    animate(arrow, { rotate: [-2, 5, -2], y: [0, 2, 0] }, { duration: 0.38, ease: easeOut });
  });
  switcher.addEventListener('pointerdown', () => {
    animate(arrow, { scale: [1, 0.86, 1.04, 1] }, { duration: 0.34, ease: easeOut });
  });
}

function installCardLift() {
  if (reduceMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.querySelectorAll('.loop-step, .class-feature, .price-plan').forEach((card, index) => {
    card.addEventListener('pointerenter', () => {
      animate(card, { y: -5, rotate: index % 2 ? 0.25 : -0.25 }, { type: 'spring', stiffness: 440, damping: 30, mass: 0.65 });
    });
    card.addEventListener('pointerleave', () => {
      animate(card, { y: 0, rotate: 0 }, { type: 'spring', stiffness: 420, damping: 32, mass: 0.7 });
    });
  });
}

function animateProductView(event) {
  if (reduceMotion) return;
  const view = event.detail?.view;
  const page = view ? document.querySelector(`#${CSS.escape(view)}.page.active`) : null;
  if (!page) return;
  animate(page, { opacity: [0.82, 1], y: [9, 0] }, { duration: 0.3, ease: easeOut });
}

function animateMissExplanation() {
  if (reduceMotion) return;
  const panel = document.querySelector('#missExplanation:not([hidden])');
  if (!panel) return;
  const pieces = [...panel.querySelectorAll('.miss-explanation-head, .miss-answer-block, .miss-why-block, .miss-memory-hook, .miss-source-line, .miss-repeat-note:not([hidden]), .miss-actions')];
  const mark = panel.querySelector('.miss-mark');
  animate(panel, { opacity: [0.75, 1], y: [16, 0], scale: [0.99, 1] }, { duration: 0.42, ease: easeOut });
  animate(pieces, { opacity: [0, 1], y: [10, 0] }, { duration: 0.4, delay: stagger(0.045, { startDelay: 0.08 }), ease: easeOut });
  if (mark) animate(mark, { rotate: [-7, 2, -3], scale: [0.9, 1.06, 1] }, { duration: 0.46, ease: easeOut });
}

revealGroup('.marketing-statement', '.marketing-statement > p, .statement-path', { fromY: 18, stagger: 0.08 });
revealGroup('#how-it-works', '#how-it-works .marketing-section-heading, #how-it-works .loop-step, #how-it-works .loop-return', { fromY: 20, scale: 0.985 });
revealGroup('#anki-first', '#anki-first .anki-first-copy, #anki-first .export-demo-head, #anki-first .export-demo-card, #anki-first .export-demo-settings, #anki-first .anki-export-demo > button', { fromX: -18, stagger: 0.07 });
revealGroup('#made-for-class', '#made-for-class .marketing-section-heading, #made-for-class .subject-strip, #made-for-class .class-feature', { fromY: 20, scale: 0.985 });
revealGroup('#pricing', '#pricing .pricing-heading > div, #pricing .price-plan, #pricing .pricing-footnote', { fromY: 20, scale: 0.985, stagger: 0.075 });
revealGroup('.marketing-final-cta', '.marketing-final-cta > div, .marketing-final-cta .cta-companion, .marketing-final-cta .button', { fromY: 16, stagger: 0.085 });

animateHero();
installScrollProgress();
installHeroDrift();
installArrowMotion();
installCardLift();
window.addEventListener('syllabloom:landing-shown', animateHero);
window.addEventListener('syllabloom:view-changed', animateProductView);
window.addEventListener('syllabloom:miss-explained', animateMissExplanation);
