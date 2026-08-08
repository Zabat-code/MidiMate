// ============================================================
// src/onboarding.js - First-run tutorial (3-4 steps)
// ============================================================

import { t } from './i18.js';

const ONBOARDED_KEY = 'piano-app-onboarded-v1';

const STEPS = [
  { icon: '🎹', titleKey: 'onboardingTitle1', bodyKey: 'onboardingBody1' },
  { icon: '📂', titleKey: 'onboardingTitle2', bodyKey: 'onboardingBody2' },
  { icon: '🎯', titleKey: 'onboardingTitle3', bodyKey: 'onboardingBody3' },
  { icon: '⚙️', titleKey: 'onboardingTitle4', bodyKey: 'onboardingBody4' }
];

export function initOnboarding() {
  let alreadySeen = false;
  try {
    alreadySeen = !!localStorage.getItem(ONBOARDED_KEY);
  } catch (e) {
    // If localStorage is unavailable, we don't block onboarding,
    // it will just show each time (better than breaking startup).
  }
  if (alreadySeen) return;

  const modal = document.getElementById('onboardingModal');
  const titleEl = document.getElementById('onboardingTitle');
  const bodyEl = document.getElementById('onboardingBody');
  const iconEl = document.getElementById('onboardingIcon');
  const dotsEl = document.getElementById('onboardingDots');
  const nextBtn = document.getElementById('onboardingNext');
  const skipBtn = document.getElementById('onboardingSkip');
  if (!modal || !titleEl || !bodyEl || !nextBtn) return;

  let step = 0;

  function render() {
    const s = STEPS[step];
    iconEl.textContent = s.icon;
    titleEl.textContent = t(s.titleKey);
    bodyEl.textContent = t(s.bodyKey);
    nextBtn.textContent = step === STEPS.length - 1 ? t('onboardingStart') : t('onboardingNext');
    if (dotsEl) {
      dotsEl.innerHTML = STEPS.map((_, i) => `<span class="onboarding-dot${i === step ? ' active' : ''}"></span>`).join('');
    }
  }

  function finish() {
    try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch (e) {}
    modal.classList.remove('open');
  }

  nextBtn.addEventListener('click', () => {
    if (step < STEPS.length - 1) {
      step++;
      render();
    } else {
      finish();
    }
  });

  skipBtn?.addEventListener('click', finish);

  render();
  modal.classList.add('open');
}
