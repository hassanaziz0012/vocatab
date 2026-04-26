/**
 * options.js — Options page logic for VocaTab
 */
(async function () {
  const DB = window.VocaDB;
  const PAGE_SIZE = 20;
  let currentPage = 1;

  // DOM refs
  const nativeLangInput = document.getElementById('native-lang');
  const foreignLangInput = document.getElementById('foreign-lang');
  const directionSelect = document.getElementById('direction');
  const saveSettingsBtn = document.getElementById('save-settings');

  const addForm = document.getElementById('add-form');
  const nativeTextInput = document.getElementById('native-text');
  const foreignTextInput = document.getElementById('foreign-text');
  const addFeedback = document.getElementById('add-feedback');

  const importBtn = document.getElementById('import-btn');
  const fileInput = document.getElementById('file-input');
  const importZone = document.getElementById('import-zone');
  const importProgress = document.getElementById('import-progress');
  const importProgressFill = document.getElementById('import-progress-fill');
  const importFeedback = document.getElementById('import-feedback');

  const ankiImportBtn = document.getElementById('anki-import-btn');
  const ankiFileInput = document.getElementById('anki-file-input');
  const ankiImportZone = document.getElementById('anki-import-zone');
  const ankiProgress = document.getElementById('anki-progress');
  const ankiProgressFill = document.getElementById('anki-progress-fill');
  const ankiFeedback = document.getElementById('anki-feedback');
  const ankiSwapBtn = document.getElementById('anki-swap-btn');
  const field1Label = document.getElementById('field-1-label');
  const field2Label = document.getElementById('field-2-label');

  const sentenceList = document.getElementById('sentence-list');
  const emptyListMsg = document.getElementById('empty-list-msg');
  const totalCount = document.getElementById('total-count');
  const pagination = document.getElementById('pagination');
  const prevPageBtn = document.getElementById('prev-page');
  const nextPageBtn = document.getElementById('next-page');
  const pageInfo = document.getElementById('page-info');
  const toast = document.getElementById('toast');

  // ─── Init settings ───
  const settings = await DB.getSettings();
  nativeLangInput.value = settings.nativeLang || '';
  foreignLangInput.value = settings.foreignLang || '';
  directionSelect.value = settings.direction || 'random';

  // ─── Save settings ───
  saveSettingsBtn.addEventListener('click', async () => {
    await DB.saveSettings({
      nativeLang: nativeLangInput.value.trim() || 'English',
      foreignLang: foreignLangInput.value.trim() || 'Spanish',
      direction: directionSelect.value,
    });
    showToast('Settings saved ✓');
  });

  // ─── Add sentence ───
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const native = nativeTextInput.value.trim();
    const foreign = foreignTextInput.value.trim();
    if (!native || !foreign) {
      showFeedback(addFeedback, 'Both fields are required.', 'error');
      return;
    }
    const s = await DB.getSettings();
    await DB.addSentence({
      nativeLang: s.nativeLang,
      nativeText: native,
      foreignLang: s.foreignLang,
      foreignText: foreign,
    });
    nativeTextInput.value = '';
    foreignTextInput.value = '';
    showFeedback(addFeedback, 'Sentence added!', 'success');
    await renderList();
  });

  // ─── File import ───
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });

  // Drag & drop
  importZone.addEventListener('dragover', (e) => { e.preventDefault(); importZone.classList.add('drag-over'); });
  importZone.addEventListener('dragleave', () => importZone.classList.remove('drag-over'));
  importZone.addEventListener('drop', (e) => {
    e.preventDefault();
    importZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  async function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'csv' && ext !== 'json') {
      showFeedback(importFeedback, 'Only .csv and .json files are supported.', 'error');
      return;
    }
    importProgress.style.display = 'block';
    importProgressFill.style.width = '30%';

    const text = await file.text();
    let sentences = [];
    let errors = [];

    try {
      if (ext === 'json') {
        sentences = parseJSON(text, errors);
      } else {
        sentences = parseCSV(text, errors);
      }
    } catch (err) {
      showFeedback(importFeedback, `Parse error: ${err.message}`, 'error');
      importProgress.style.display = 'none';
      return;
    }

    importProgressFill.style.width = '60%';

    if (sentences.length === 0) {
      showFeedback(importFeedback, errors.length ? errors.join('<br>') : 'No valid sentences found in file.', 'error');
      importProgress.style.display = 'none';
      return;
    }

    const s = await DB.getSettings();
    const count = await DB.addSentencesBulk(sentences, s.nativeLang, s.foreignLang);

    importProgressFill.style.width = '100%';
    setTimeout(() => { importProgress.style.display = 'none'; importProgressFill.style.width = '0%'; }, 600);

    let msg = `Imported ${count} sentence${count === 1 ? '' : 's'} successfully!`;
    if (errors.length) msg += `<br><br>⚠ ${errors.length} row(s) skipped:<br>` + errors.slice(0, 5).join('<br>');
    showFeedback(importFeedback, msg, errors.length ? 'warning' : 'success');
    fileInput.value = '';
    await renderList();
  }

  function parseJSON(text, errors) {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('JSON must be an array of objects.');
    const valid = [];
    data.forEach((item, i) => {
      const native = (item.native || item.native_text || item.nativeText || '').trim();
      const foreign = (item.foreign || item.foreign_text || item.foreignText || '').trim();
      if (!native || !foreign) { errors.push(`Row ${i + 1}: missing native or foreign text`); return; }
      valid.push({ native, foreign });
    });
    return valid;
  }

  function parseCSV(text, errors) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const valid = [];
    // Check for header
    let start = 0;
    const first = lines[0].toLowerCase();
    if (first.includes('native') || first.includes('foreign') || first.includes('text')) start = 1;

    for (let i = start; i < lines.length; i++) {
      const parts = parseCSVLine(lines[i]);
      if (parts.length < 2 || !parts[0].trim() || !parts[1].trim()) {
        errors.push(`Row ${i + 1}: missing or malformed data`);
        continue;
      }
      valid.push({ native: parts[0].trim(), foreign: parts[1].trim() });
    }
    return valid;
  }

  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else current += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { result.push(current); current = ''; }
        else current += ch;
      }
    }
    result.push(current);
    return result;
  }

  // ─── Anki deck import ───
  let ankiFieldsSwapped = false;

  ankiSwapBtn.addEventListener('click', () => {
    ankiFieldsSwapped = !ankiFieldsSwapped;
    if (ankiFieldsSwapped) {
      field1Label.innerHTML = 'Field 1 (Front) → <strong>Native</strong>';
      field2Label.innerHTML = 'Field 2 (Back) → <strong>Foreign</strong>';
    } else {
      field1Label.innerHTML = 'Field 1 (Front) → <strong>Foreign</strong>';
      field2Label.innerHTML = 'Field 2 (Back) → <strong>Native</strong>';
    }
  });

  ankiImportBtn.addEventListener('click', () => ankiFileInput.click());
  ankiFileInput.addEventListener('change', () => {
    if (ankiFileInput.files.length) handleAnkiFile(ankiFileInput.files[0]);
  });

  // Drag & drop for Anki zone
  ankiImportZone.addEventListener('dragover', (e) => { e.preventDefault(); ankiImportZone.classList.add('drag-over'); });
  ankiImportZone.addEventListener('dragleave', () => ankiImportZone.classList.remove('drag-over'));
  ankiImportZone.addEventListener('drop', (e) => {
    e.preventDefault();
    ankiImportZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleAnkiFile(e.dataTransfer.files[0]);
  });

  async function handleAnkiFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'apkg') {
      showFeedback(ankiFeedback, 'Only <strong>.apkg</strong> files are supported.', 'error');
      return;
    }

    ankiProgress.style.display = 'block';
    ankiProgressFill.style.width = '10%';

    try {
      // 1. Read file as ArrayBuffer
      const buffer = await file.arrayBuffer();
      ankiProgressFill.style.width = '20%';

      // 2. Unzip with JSZip
      const zip = await JSZip.loadAsync(buffer);
      ankiProgressFill.style.width = '35%';

      // 3. Find the SQLite database file
      //    Modern Anki (2.1.50+) uses collection.anki21b (Zstd-compressed SQLite)
      //    Older versions use collection.anki21 or collection.anki2 (plain SQLite)
      let dbBytes;
      const anki21b = zip.file('collection.anki21b');
      const anki21 = zip.file('collection.anki21');
      const anki2 = zip.file('collection.anki2');

      if (anki21b) {
        // Modern format: Zstd-compressed SQLite — decompress with fzstd
        console.log('[VocaTab] Found collection.anki21b (modern Zstd-compressed format)');
        const compressed = new Uint8Array(await anki21b.async('arraybuffer'));
        dbBytes = fzstd.decompress(compressed);
      } else if (anki21) {
        console.log('[VocaTab] Found collection.anki21 (legacy format)');
        dbBytes = new Uint8Array(await anki21.async('arraybuffer'));
      } else if (anki2) {
        console.log('[VocaTab] Found collection.anki2 (legacy format)');
        dbBytes = new Uint8Array(await anki2.async('arraybuffer'));
      } else {
        showFeedback(ankiFeedback, 'Could not find a valid Anki collection database inside this file.', 'error');
        ankiProgress.style.display = 'none';
        return;
      }

      ankiProgressFill.style.width = '50%';

      // 4. Open the SQLite database with sql.js
      const SQL = await initSqlJs({
        locateFile: (filename) => {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            return chrome.runtime.getURL(`lib/${filename}`);
          }
          return `../lib/${filename}`;
        },
      });
      const db = new SQL.Database(dbBytes);
      ankiProgressFill.style.width = '65%';

      // 5. Query all notes
      let results;
      try {
        results = db.exec('SELECT flds FROM notes');
      } catch (queryErr) {
        showFeedback(ankiFeedback, `Failed to read notes from the Anki database: ${queryErr.message}`, 'error');
        db.close();
        ankiProgress.style.display = 'none';
        return;
      }

      if (!results.length || !results[0].values.length) {
        showFeedback(ankiFeedback, 'No notes found in this Anki deck.', 'error');
        db.close();
        ankiProgress.style.display = 'none';
        return;
      }

      ankiProgressFill.style.width = '75%';

      // 6. Parse fields and build sentence pairs
      const SEPARATOR = '\x1f';
      const sentences = [];
      const errors = [];

      // Debug: log first 5 raw field values to help diagnose structure
      console.log('[VocaTab Anki Import] First 5 raw notes:');
      results[0].values.slice(0, 5).forEach((row, i) => {
        const flds = row[0];
        const fields = flds.split(SEPARATOR);
        console.log(`  Note ${i + 1} (${fields.length} fields):`, fields);
      });

      results[0].values.forEach((row, i) => {
        const flds = row[0];
        const fields = flds.split(SEPARATOR);

        if (fields.length < 2) {
          errors.push(`Note ${i + 1}: fewer than 2 fields`);
          return;
        }

        // Strip HTML tags from field content
        const field1 = stripHtml(fields[0]).trim();
        const field2 = stripHtml(fields[1]).trim();

        if (!field1 || !field2) {
          errors.push(`Note ${i + 1}: empty field after stripping HTML`);
          return;
        }

        if (ankiFieldsSwapped) {
          sentences.push({ native: field1, foreign: field2 });
        } else {
          sentences.push({ native: field2, foreign: field1 });
        }
      });

      db.close();
      ankiProgressFill.style.width = '85%';

      if (sentences.length === 0) {
        showFeedback(ankiFeedback, errors.length ? errors.join('<br>') : 'No valid sentence pairs found in this deck.', 'error');
        ankiProgress.style.display = 'none';
        return;
      }

      // 7. Bulk insert
      const s = await DB.getSettings();
      const count = await DB.addSentencesBulk(sentences, s.nativeLang, s.foreignLang);

      ankiProgressFill.style.width = '100%';
      setTimeout(() => { ankiProgress.style.display = 'none'; ankiProgressFill.style.width = '0%'; }, 600);

      let msg = `Imported ${count} card${count === 1 ? '' : 's'} from Anki deck successfully!`;
      if (errors.length) msg += `<br><br>⚠ ${errors.length} note(s) skipped:<br>` + errors.slice(0, 5).join('<br>');
      showFeedback(ankiFeedback, msg, errors.length ? 'warning' : 'success');
      ankiFileInput.value = '';
      await renderList();

    } catch (err) {
      showFeedback(ankiFeedback, `Error processing Anki deck: ${err.message}`, 'error');
      ankiProgress.style.display = 'none';
    }
  }

  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  // ─── Render sentence list ───
  async function renderList() {
    const all = await DB.getAllSentences();
    totalCount.textContent = all.length;

    if (all.length === 0) {
      emptyListMsg.style.display = 'block';
      pagination.style.display = 'none';
      sentenceList.querySelectorAll('.sentence-item').forEach(el => el.remove());
      return;
    }

    emptyListMsg.style.display = 'none';
    const totalPages = Math.ceil(all.length / PAGE_SIZE);
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const page = all.slice(start, start + PAGE_SIZE);

    sentenceList.querySelectorAll('.sentence-item').forEach(el => el.remove());

    page.forEach((s) => {
      const item = document.createElement('div');
      item.className = 'sentence-item';
      item.innerHTML = `
        <div class="sentence-texts">
          <div class="sentence-native">${escapeHtml(s.nativeText)}</div>
          <div class="sentence-foreign">${escapeHtml(s.foreignText)}</div>
        </div>
        <button class="btn-delete" data-id="${s.id}" title="Delete sentence">✕</button>
      `;
      sentenceList.appendChild(item);
    });

    // Pagination
    if (totalPages > 1) {
      pagination.style.display = 'flex';
      pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
      prevPageBtn.disabled = currentPage <= 1;
      nextPageBtn.disabled = currentPage >= totalPages;
    } else {
      pagination.style.display = 'none';
    }
  }

  // Delete handler (delegated)
  sentenceList.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-delete');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    await DB.deleteSentence(id);
    showToast('Sentence deleted');
    await renderList();
  });

  prevPageBtn.addEventListener('click', () => { currentPage--; renderList(); });
  nextPageBtn.addEventListener('click', () => { currentPage++; renderList(); });

  // ─── Helpers ───
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showFeedback(el, msg, type) {
    el.innerHTML = msg;
    el.className = `feedback ${type}`;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 8000);
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.style.display = 'block';
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, 2500);
  }

  // Initial render
  await renderList();
})();
