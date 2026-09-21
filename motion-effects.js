import { animate, hover, inView, scroll, stagger } from 'https://cdn.jsdelivr.net/npm/motion@13.4.0/+esm';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOut = [0.16, 1, 0.3, 1];
const easeIn = [0.4, 0, 1, 1];
const characterAnimations = new WeakMap();
let characterBaseTransforms = new WeakMap();

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

  const initialTransform = options.fromX
    ? `translate3d(${options.fromX}px, 0, 0)`
    : `translate3d(0, ${options.fromY ?? 14}px, 0)`;

  elements.forEach(element => {
    element.style.opacity = '0';
    element.style.transform = initialTransform;
  });

  inView(section, () => {
    animate(
      elements,
      { opacity: [0, 1], transform: [initialTransform, 'translate3d(0, 0, 0)'] },
      {
        duration: options.duration ?? 0.42,
        delay: stagger(options.stagger ?? 0.04, { startDelay: options.startDelay ?? 0.02 }),
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
  animate(copy, { opacity: [0, 1], transform: ['translate3d(0, 14px, 0)', 'translate3d(0, 0, 0)'] }, { duration: 0.46, delay: stagger(0.045), ease: easeOut });
  if (visual) animate(visual, { opacity: [0, 1], transform: ['translate3d(0, 12px, 0) scale(0.99)', 'translate3d(0, 0, 0) scale(1)'] }, { duration: 0.56, delay: 0.1, ease: easeOut });
}

function installScrollProgress() {
  const indicator = document.querySelector('.marketing-scroll-progress');
  if (!indicator || reduceMotion) return;
  const progressAnimation = animate(indicator, { scaleX: [0, 1] }, { ease: 'linear' });
  scroll(progressAnimation);
}

function installCardLift() {
  if (reduceMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.querySelectorAll('.loop-step, .class-feature, .price-plan').forEach((card, index) => {
    card.addEventListener('pointerenter', () => {
      animate(card, { transform: `translate3d(0, -4px, 0) rotate(${index % 2 ? 0.2 : -0.2}deg)` }, { type: 'spring', stiffness: 440, damping: 34, mass: 0.6 });
    });
    card.addEventListener('pointerleave', () => {
      animate(card, { transform: 'translate3d(0, 0, 0) rotate(0deg)' }, { type: 'spring', stiffness: 440, damping: 36, mass: 0.6 });
    });
  });
}

function installCharacterHover() {
  if (reduceMotion || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  document.querySelectorAll('.character-cutout').forEach((character, index) => {
    const target = character.closest(
      '.marketing-hero-visual, .loop-character-stage, .anki-export-demo, .feature-illustration, .pricing-note, .marketing-final-cta, .onboarding-character-stage, .character-story-panel, .page-character-action, .planner-boundary, .review-empty, .anki-export-bar, .study-card-stage, .account-dialog-art'
    ) || character.parentElement;
    if (!target) return;

    hover(target, () => {
      const baseTransform = characterBaseTransforms.get(character) || getComputedStyle(character).transform || 'none';
      characterBaseTransforms.set(character, baseTransform);
      characterAnimations.get(character)?.stop?.();
      const lean = index % 2 ? -2.2 : 2.2;
      const start = baseTransform === 'none' ? '' : `${baseTransform} `;
      const control = animate(
        character,
        { transform: `${start}translate3d(0, -7px, 0) rotate(${lean}deg) scale(1.025)` },
        { type: 'spring', stiffness: 360, damping: 25, mass: 0.58 }
      );
      characterAnimations.set(character, control);

      return () => {
        characterAnimations.get(character)?.stop?.();
        const reset = animate(
          character,
          { transform: baseTransform },
          { type: 'spring', stiffness: 420, damping: 31, mass: 0.56 }
        );
        characterAnimations.set(character, reset);
      };
    });
  });

  window.addEventListener('resize', () => {
    characterBaseTransforms = new WeakMap();
  }, { passive: true });
}

function openAuth(dialog) {
  if (reduceMotion || !dialog?.open) return;
  const shell = dialog.querySelector('.account-dialog-shell');
  const character = dialog.querySelector('.account-dialog-art img');
  const pieces = [...dialog.querySelectorAll('.account-kicker, .account-dialog-copy h1, .account-dialog-copy > p, .auth-trust-line, .clerk-auth-mount, .account-dialog-secondary')];
  if (shell) animate(shell, { opacity: [0, 1], transform: ['translate3d(0, 12px, 0) scale(0.985)', 'translate3d(0, 0, 0) scale(1)'] }, { duration: 0.3, ease: easeOut });
  if (character) {
    const baseTransform = getComputedStyle(character).transform || 'none';
    const start = baseTransform === 'none' ? '' : `${baseTransform} `;
    const control = animate(character, { opacity: [0, 1], transform: [`${start}translate3d(0, 12px, 0) rotate(-2deg) scale(0.98)`, baseTransform] }, { duration: 0.42, delay: 0.04, ease: easeOut });
    control.then(() => {
      character.style.removeProperty('opacity');
      character.style.removeProperty('transform');
    });
  }
  animate(pieces, { opacity: [0, 1] }, { duration: 0.26, delay: stagger(0.025, { startDelay: 0.05 }), ease: easeOut });
}

async function closeAuth(dialog) {
  if (reduceMotion || !dialog?.open) return;
  const shell = dialog.querySelector('.account-dialog-shell');
  if (!shell) return;
  const control = animate(shell, { opacity: [1, 0], transform: ['translate3d(0, 0, 0) scale(1)', 'translate3d(0, 6px, 0) scale(0.992)'] }, { duration: 0.15, ease: easeIn });
  await control;
  shell.style.removeProperty('opacity');
  shell.style.removeProperty('transform');
}

window.SyllabloomMotion = { openAuth, closeAuth };

function animateProductView(event) {
  if (reduceMotion) return;
  const view = event.detail?.view;
  const page = view ? document.querySelector(`#${CSS.escape(view)}.page.active`) : null;
  if (!page) return;
  animate(page, { opacity: [0.88, 1], transform: ['translate3d(0, 7px, 0)', 'translate3d(0, 0, 0)'] }, { duration: 0.24, ease: easeOut });
}

function animateMissExplanation() {
  if (reduceMotion) return;
  const panel = document.querySelector('#missExplanation:not([hidden])');
  if (!panel) return;
  const pieces = [...panel.querySelectorAll('.miss-explanation-head, .miss-answer-block, .miss-why-block, .miss-memory-hook, .miss-source-line, .miss-repeat-note:not([hidden]), .miss-actions')];
  const mark = panel.querySelector('.miss-mark');
  animate(panel, { opacity: [0.8, 1], transform: ['translate3d(0, 12px, 0) scale(0.992)', 'translate3d(0, 0, 0) scale(1)'] }, { duration: 0.32, ease: easeOut });
  animate(pieces, { opacity: [0, 1], transform: ['translate3d(0, 7px, 0)', 'translate3d(0, 0, 0)'] }, { duration: 0.28, delay: stagger(0.035, { startDelay: 0.06 }), ease: easeOut });
  if (mark) animate(mark, { transform: ['rotate(-6deg) scale(0.94)', 'rotate(-3deg) scale(1)'] }, { duration: 0.32, ease: easeOut });
}

revealGroup('.marketing-statement', '.marketing-statement > p, .statement-path', { fromY: 18, stagger: 0.08 });
revealGroup('#how-it-works', '#how-it-works .marketing-section-heading, #how-it-works .loop-step, #how-it-works .loop-return', { fromY: 20, scale: 0.985 });
revealGroup('#anki-first', '#anki-first .anki-first-copy, #anki-first .export-demo-head, #anki-first .export-demo-card, #anki-first .export-demo-settings, #anki-first .anki-export-demo > button', { fromX: -18, stagger: 0.07 });
revealGroup('#made-for-class', '#made-for-class .marketing-section-heading, #made-for-class .subject-strip, #made-for-class .class-feature', { fromY: 20, scale: 0.985 });
revealGroup('#pricing', '#pricing .pricing-heading > div, #pricing .price-plan, #pricing .pricing-footnote', { fromY: 20, scale: 0.985, stagger: 0.075 });
revealGroup('.marketing-final-cta', '.marketing-final-cta > div, .marketing-final-cta .cta-companion, .marketing-final-cta .button', { fromY: 16, stagger: 0.085 });

animateHero();
installScrollProgress();
installCardLift();
installCharacterHover();
window.addEventListener('syllabloom:landing-shown', animateHero);
window.addEventListener('syllabloom:view-changed', animateProductView);
window.addEventListener('syllabloom:miss-explained', animateMissExplanation);
