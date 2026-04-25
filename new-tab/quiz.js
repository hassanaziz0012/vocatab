/**
 * quiz.js — New Tab quiz logic for VocaTab
 */

(async function () {
  const DB = window.VocaDB;

  // DOM refs
  const quizContainer = document.getElementById('quiz-container');
  const emptyState = document.getElementById('empty-state');
  const langLabel = document.getElementById('lang-label');
  const promptText = document.getElementById('prompt-text');
  const answerSection = document.getElementById('answer-section');
  const answerText = document.getElementById('answer-text');
  const actionsReveal = document.getElementById('actions-reveal');
  const actionsGrade = document.getElementById('actions-grade');
  const btnReveal = document.getElementById('btn-reveal');
  const btnCorrect = document.getElementById('btn-correct');
  const btnMissed = document.getElementById('btn-missed');
  const skipLink = document.getElementById('skip-link');
  const streakBadge = document.getElementById('streak-badge');
  const streakCount = document.getElementById('streak-count');
  const sentenceCount = document.getElementById('sentence-count');
  const openOptions = document.getElementById('open-options');
  const footerOptions = document.getElementById('footer-options');

  let currentSentence = null;
  let currentDirection = null; // 'native-to-foreign' or 'foreign-to-native'

  // Wire up options links
  function getOptionsURL() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      return chrome.runtime.getURL('options/index.html');
    }
    return '../options/index.html';
  }

  openOptions.href = getOptionsURL();
  footerOptions.href = getOptionsURL();

  // Skip link — open about:blank or just a clean tab
  skipLink.addEventListener('click', (e) => {
    e.preventDefault();
    // In a real extension, chrome://newtab won't work; about:blank is safest
    window.location.href = 'about:blank';
  });

  // ─── Load quiz ───
  async function loadQuiz() {
    const count = await DB.getSentenceCount();

    if (count === 0) {
      quizContainer.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    // Update streak
    const settings = await DB.updateStreak();
    if (settings.streak > 0) {
      streakBadge.style.display = 'inline-flex';
      streakCount.textContent = settings.streak;
    }

    sentenceCount.textContent = `${count} sentence${count === 1 ? '' : 's'} in your deck`;

    await showNextCard(settings);
  }

  async function showNextCard(settings) {
    if (!settings) settings = await DB.getSettings();

    currentSentence = await DB.getRandomSentence();
    if (!currentSentence) return;

    // Decide direction
    if (settings.direction === 'random') {
      currentDirection = Math.random() < 0.5 ? 'native-to-foreign' : 'foreign-to-native';
    } else {
      currentDirection = settings.direction;
    }

    const isNativeToForeign = currentDirection === 'native-to-foreign';
    const showLang = isNativeToForeign
      ? (currentSentence.nativeLang || 'Native')
      : (currentSentence.foreignLang || 'Foreign');

    langLabel.textContent = `Translate from ${showLang}`;
    promptText.textContent = isNativeToForeign
      ? currentSentence.nativeText
      : currentSentence.foreignText;
    answerText.textContent = isNativeToForeign
      ? currentSentence.foreignText
      : currentSentence.nativeText;

    // Reset UI state
    answerSection.style.display = 'none';
    actionsReveal.style.display = 'flex';
    actionsGrade.style.display = 'none';

    // Re-trigger card animation
    const card = document.getElementById('card');
    card.style.animation = 'none';
    card.offsetHeight; // force reflow
    card.style.animation = '';
  }

  // ─── Reveal answer ───
  btnReveal.addEventListener('click', () => {
    answerSection.style.display = 'block';
    actionsReveal.style.display = 'none';
    actionsGrade.style.display = 'flex';
  });

  // ─── Grade: Got it ───
  btnCorrect.addEventListener('click', async () => {
    if (currentSentence) {
      await DB.recordResult(currentSentence.id, 'correct');
    }
    await showNextCard();
  });

  // ─── Grade: Missed it ───
  btnMissed.addEventListener('click', async () => {
    if (currentSentence) {
      await DB.recordResult(currentSentence.id, 'missed');
    }
    await showNextCard();
  });

  // ─── Keyboard shortcuts ───
  document.addEventListener('keydown', (e) => {
    // Space or Enter to reveal
    if ((e.key === ' ' || e.key === 'Enter') && actionsReveal.style.display !== 'none') {
      e.preventDefault();
      btnReveal.click();
      return;
    }
    // After reveal: 1 or ArrowRight = Got it, 2 or ArrowLeft = Missed it
    if (actionsGrade.style.display !== 'none') {
      if (e.key === '1' || e.key === 'ArrowRight') {
        btnCorrect.click();
      } else if (e.key === '2' || e.key === 'ArrowLeft') {
        btnMissed.click();
      }
    }
    // Escape = skip
    if (e.key === 'Escape') {
      skipLink.click();
    }
  });

  // Go
  loadQuiz();
})();
