/**
 * db.js — Shared IndexedDB module for VocaTab
 * Wraps all database operations in a clean promise-based API.
 */

const DB_NAME = 'vocatab';
const DB_VERSION = 1;
const SENTENCES_STORE = 'sentences';
const PROGRESS_STORE = 'progress';

let _db = null;

/**
 * Open (or create) the VocaTab database.
 * Returns the same instance on subsequent calls.
 */
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(SENTENCES_STORE)) {
        const sentenceStore = db.createObjectStore(SENTENCES_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        sentenceStore.createIndex('dateAdded', 'dateAdded', { unique: false });
        sentenceStore.createIndex('foreignLang', 'foreignLang', { unique: false });
      }

      if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
        const progressStore = db.createObjectStore(PROGRESS_STORE, {
          keyPath: 'sentenceId',
        });
        progressStore.createIndex('lastShown', 'lastShown', { unique: false });
        progressStore.createIndex('difficulty', 'difficulty', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      resolve(_db);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/* ───────────────────────── Sentences CRUD ───────────────────────── */

/**
 * Add a single sentence and its initial progress record.
 * Returns the generated id.
 */
async function addSentence({ nativeLang, nativeText, foreignLang, foreignText, tags = [] }) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([SENTENCES_STORE, PROGRESS_STORE], 'readwrite');
    const sentenceStore = tx.objectStore(SENTENCES_STORE);

    const sentence = {
      nativeLang,
      nativeText: nativeText.trim(),
      foreignLang,
      foreignText: foreignText.trim(),
      dateAdded: new Date().toISOString(),
      tags,
    };

    const req = sentenceStore.add(sentence);

    req.onsuccess = () => {
      const id = req.result;
      // Create matching progress record
      const progressStore = tx.objectStore(PROGRESS_STORE);
      progressStore.add({
        sentenceId: id,
        timesShown: 0,
        timesCorrect: 0,
        timesSkipped: 0,
        lastShown: null,
        difficulty: 'unseen',
        easeFactor: 2.5,
      });
      resolve(id);
    };

    tx.oncomplete = () => {};
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Add multiple sentences in a single transaction.
 * Returns the count of successfully added sentences.
 */
async function addSentencesBulk(sentencesArray, nativeLang, foreignLang) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([SENTENCES_STORE, PROGRESS_STORE], 'readwrite');
    const sentenceStore = tx.objectStore(SENTENCES_STORE);
    const progressStore = tx.objectStore(PROGRESS_STORE);
    let count = 0;

    sentencesArray.forEach((s) => {
      const sentence = {
        nativeLang,
        nativeText: (s.native || s.native_text || s.nativeText || '').trim(),
        foreignLang,
        foreignText: (s.foreign || s.foreign_text || s.foreignText || '').trim(),
        dateAdded: new Date().toISOString(),
        tags: s.tags || [],
      };

      const req = sentenceStore.add(sentence);
      req.onsuccess = () => {
        const id = req.result;
        progressStore.add({
          sentenceId: id,
          timesShown: 0,
          timesCorrect: 0,
          timesSkipped: 0,
          lastShown: null,
          difficulty: 'unseen',
          easeFactor: 2.5,
        });
        count++;
      };
    });

    tx.oncomplete = () => resolve(count);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get all sentences, newest first.
 */
async function getAllSentences() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SENTENCES_STORE, 'readonly');
    const store = tx.objectStore(SENTENCES_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.reverse());
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get a single sentence by id.
 */
async function getSentence(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SENTENCES_STORE, 'readonly');
    const req = tx.objectStore(SENTENCES_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a sentence and its progress record.
 */
async function deleteSentence(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([SENTENCES_STORE, PROGRESS_STORE], 'readwrite');
    tx.objectStore(SENTENCES_STORE).delete(id);
    tx.objectStore(PROGRESS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get total sentence count.
 */
async function getSentenceCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SENTENCES_STORE, 'readonly');
    const req = tx.objectStore(SENTENCES_STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Pick a random sentence from the database.
 */
async function getRandomSentence() {
  const all = await getAllSentences();
  if (all.length === 0) return null;
  return all[Math.floor(Math.random() * all.length)];
}

/* ───────────────────────── Progress ───────────────────────── */

/**
 * Get the progress record for a sentence.
 */
async function getProgress(sentenceId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROGRESS_STORE, 'readonly');
    const req = tx.objectStore(PROGRESS_STORE).get(sentenceId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Record the result of a quiz attempt.
 * outcome: 'correct' | 'missed' | 'skipped'
 */
async function recordResult(sentenceId, outcome) {
  const db = await openDB();
  const progress = await getProgress(sentenceId);
  if (!progress) return;

  progress.timesShown += 1;
  progress.lastShown = new Date().toISOString();

  if (outcome === 'correct') {
    progress.timesCorrect += 1;
  } else if (outcome === 'skipped') {
    progress.timesSkipped += 1;
    progress.timesShown -= 1; // skips don't count as shown
  }

  // Simple difficulty bucketing
  if (progress.timesShown > 0) {
    const accuracy = progress.timesCorrect / progress.timesShown;
    if (accuracy >= 0.8) progress.difficulty = 'comfortable';
    else if (accuracy >= 0.4) progress.difficulty = 'learning';
    else progress.difficulty = 'struggling';
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(PROGRESS_STORE, 'readwrite');
    tx.objectStore(PROGRESS_STORE).put(progress);
    tx.oncomplete = () => resolve(progress);
    tx.onerror = () => reject(tx.error);
  });
}

/* ───────────────────────── Settings ───────────────────────── */

/**
 * Get all settings from chrome.storage.local.
 * Falls back to defaults.
 */
function getSettings() {
  const defaults = {
    nativeLang: 'English',
    foreignLang: 'Spanish',
    direction: 'random', // 'native-to-foreign', 'foreign-to-native', 'random'
    streak: 0,
    lastActiveDate: null,
  };

  // Support running outside of a Chrome extension context (for testing)
  if (typeof chrome === 'undefined' || !chrome.storage) {
    const stored = localStorage.getItem('vocatab_settings');
    return Promise.resolve(stored ? { ...defaults, ...JSON.parse(stored) } : defaults);
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(defaults, (result) => resolve(result));
  });
}

/**
 * Save settings to chrome.storage.local.
 */
function saveSettings(settings) {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    localStorage.setItem('vocatab_settings', JSON.stringify(settings));
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    chrome.storage.local.set(settings, () => resolve());
  });
}

/**
 * Update the streak: if the user hasn't been active today, increment.
 */
async function updateStreak() {
  const settings = await getSettings();
  const today = new Date().toISOString().slice(0, 10);

  if (settings.lastActiveDate === today) return settings;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (settings.lastActiveDate === yesterday) {
    settings.streak += 1;
  } else {
    settings.streak = 1;
  }

  settings.lastActiveDate = today;
  await saveSettings(settings);
  return settings;
}

// Export for module usage
if (typeof window !== 'undefined') {
  window.VocaDB = {
    openDB,
    addSentence,
    addSentencesBulk,
    getAllSentences,
    getSentence,
    deleteSentence,
    getSentenceCount,
    getRandomSentence,
    getProgress,
    recordResult,
    getSettings,
    saveSettings,
    updateStreak,
  };
}
