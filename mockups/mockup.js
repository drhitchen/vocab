/*
 * Shared behavior for the design mockups. Plain JavaScript, no build step,
 * works from file://. Markup hooks are data-* attributes so each design can
 * style the same structure differently.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'vocab-mockup-theme';
  var BUCKETS = ['New', 'Learning', 'Familiar', 'Known', 'Mastered'];
  var MW = 'https://www.merriam-webster.com/dictionary/';

  var WORDS = [
    { word: 'ablate', pos: 'v', type: 'common', bucket: 0,
      defs: ['To wear away or remove material from a surface through heat, friction, or erosion.'],
      ex: 'The spacecraft\'s heat shield was designed to ablate slowly during reentry.',
      next: 'Due now', correct: 0, total: 0 },
    { word: 'abolish', pos: 'v', type: 'common', bucket: 1,
      defs: ['To formally put an end to a law, system, or long-standing practice.'],
      ex: 'The council voted to abolish the outdated parking fee.',
      next: 'Tomorrow', correct: 2, total: 3 },
    { word: 'abrasive', pos: 'adj', type: 'common', bucket: 2,
      defs: ['Rough enough to scrape a surface, or harsh and unpleasant in manner.'],
      ex: 'His abrasive tone made even small suggestions feel like attacks.',
      next: 'Oct 20', correct: 5, total: 6 },
    { word: 'anti-', pos: 'prefix', type: 'prefix', bucket: 0,
      defs: ['Against, opposed to, or working to prevent something.'],
      ex: 'The anti-corrosion coating kept the bridge rails bright for decades.',
      next: 'Due now', correct: 0, total: 0 },
    { word: 'ephemeral', pos: 'adj', type: 'common', bucket: 3,
      defs: ['Lasting for only a very short time.'],
      ex: 'The beauty of cherry blossoms is ephemeral, gone within a week.',
      next: 'Oct 24', correct: 7, total: 8 },
    { word: 'laconic', pos: 'adj', type: 'common', bucket: 4,
      defs: ['Using very few words, often to the point of seeming blunt.'],
      ex: 'Her laconic reply, a single nod, ended the debate.',
      next: 'Oct 31', correct: 11, total: 11 },
    { word: 'mellifluous', pos: 'adj', type: 'common', bucket: 3,
      defs: ['Smooth and sweet sounding, pleasant to hear.'],
      ex: 'The radio host\'s mellifluous voice made the weather report soothing.',
      next: 'Oct 22', correct: 6, total: 7 },
    { word: 'novel', pos: 'n/adj', type: 'common', bucket: 1,
      defs: ['A long fictional story published as a book.', 'Strikingly new and unlike anything seen before.'],
      ex: 'The engineers proposed a novel way to cool the data center.',
      next: 'Tomorrow', correct: 1, total: 2 },
    { word: 'perfunctory', pos: 'adj', type: 'common', bucket: 0,
      defs: ['Done quickly and with little care, only because it is expected.'],
      ex: 'He gave the contract a perfunctory glance before signing.',
      next: 'Due now', correct: 0, total: 0 },
    { word: 'Rosetta Stone', pos: 'n', type: 'proper', bucket: 2,
      defs: ['An ancient slab whose parallel texts let scholars decipher Egyptian hieroglyphs.'],
      ex: 'The old spreadsheet became the Rosetta Stone for decoding the legacy database.',
      next: 'Oct 21', correct: 4, total: 5 },
    { word: 'tip of the iceberg', pos: 'phrase', type: 'phrase', bucket: 1,
      defs: ['A small visible part of a much larger hidden problem.'],
      ex: 'The first audit finding was only the tip of the iceberg.',
      next: 'Tomorrow', correct: 3, total: 4 }
  ];

  var DECK_WORDS = ['ephemeral', 'laconic', 'perfunctory', 'mellifluous', 'abolish'];
  var deck = DECK_WORDS.map(function (name) {
    return WORDS.filter(function (w) { return w.word === name; })[0];
  });
  var cardIndex = 0;
  var root = document.documentElement;

  var SWITCHER_PAGES = [
    ['index.html', 'All'],
    ['1-editorial.html', '1 Editorial'],
    ['2-focus.html', '2 Focus'],
    ['3-playful.html', '3 Playful']
  ];

  var ICON_SUN = '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var ICON_MOON = '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  // ---- Helpers ------------------------------------------------------------

  function qs(selector, scope) { return (scope || document).querySelector(selector); }
  function qsa(selector, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(selector)); }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c];
    });
  }

  // ---- Theme (applied immediately to avoid a flash) -------------------------

  function readTheme() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function applyTheme(theme, persist) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* storage unavailable */ }
    }
    qsa('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode');
      btn.setAttribute('title', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode');
    });
    qsa('[data-theme-label]').forEach(function (el) {
      el.textContent = theme === 'dark' ? 'Dark mode' : 'Light mode';
    });
  }

  var media = window.matchMedia('(prefers-color-scheme: dark)');
  applyTheme(readTheme() || (media.matches ? 'dark' : 'light'), false);
  media.addEventListener('change', function (e) {
    if (!readTheme()) applyTheme(e.matches ? 'dark' : 'light', false);
  });

  // ---- Rendering ------------------------------------------------------------

  function renderRows() {
    var tpl = qs('template[data-row-template]');
    var host = qs('[data-rows]');
    if (!tpl || !host) return;

    host.insertAdjacentHTML('beforeend', WORDS.map(function (w) {
      var first = w.defs[0];
      var values = {
        word: esc(w.word),
        pos: esc(w.pos),
        type: esc(w.type),
        bucket: esc(BUCKETS[w.bucket]),
        bi: w.bucket,
        def: esc(first.length > 80 ? first.slice(0, 77) + '\u2026' : first),
        defsHtml: w.defs.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join(''),
        exHtml: '<li>' + esc(w.ex) + '</li>',
        next: esc(w.next),
        attempts: w.total ? w.correct + '/' + w.total : 'none yet',
        mw: MW + encodeURIComponent(w.word)
      };
      return tpl.innerHTML.replace(/\{\{(\w+)\}\}/g, function (m, key) {
        return values[key] != null ? values[key] : '';
      });
    }).join(''));

    var open = Number(host.getAttribute('data-expand'));
    var rows = qsa('[data-row]', host);
    if (rows[open]) rows[open].setAttribute('aria-expanded', 'true');
    updateResults();
  }

  function renderCard() {
    var w = deck[cardIndex];
    var fields = { word: w.word, pos: w.pos, def: w.defs[0], ex: w.ex, count: cardIndex + 1, total: deck.length };
    qsa('[data-field]').forEach(function (el) {
      var key = el.getAttribute('data-field');
      if (key in fields) el.textContent = fields[key];
    });
    qsa('[data-progress]').forEach(function (el) {
      el.style.setProperty('--p', (cardIndex / deck.length * 100) + '%');
    });
  }

  // ---- Screens ----------------------------------------------------------------

  function showScreen(name) {
    var screens = qsa('[data-screen]');
    if (!screens.length) return;
    if (!screens.some(function (s) { return s.getAttribute('data-screen') === name; })) {
      name = screens[0].getAttribute('data-screen');
    }
    screens.forEach(function (s) { s.hidden = s.getAttribute('data-screen') !== name; });
    qsa('[data-nav]').forEach(function (btn) {
      var active = btn.getAttribute('data-nav').split(' ').indexOf(name) !== -1;
      if (active) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
    });
    if (window.history && history.replaceState) history.replaceState(null, '', '#' + name);
    window.scrollTo(0, 0);
    updateSwitcherLinks();
  }

  function currentScreen() {
    var visible = qsa('[data-screen]').filter(function (s) { return !s.hidden; })[0];
    return visible ? visible.getAttribute('data-screen') : '';
  }

  // ---- Study controls ---------------------------------------------------------

  function selectedSize() {
    var opt = qs('[data-name="size"] [data-option][aria-pressed="true"]');
    return opt ? Number(opt.getAttribute('data-value')) : 10;
  }

  function activeBuckets() {
    return qsa('[data-name="buckets"] [data-option][aria-pressed="true"]');
  }

  function updateStudyLabels() {
    var size = selectedSize();
    var on = activeBuckets();
    var noun = size === 1 ? 'word' : 'words';
    var label = on.length
      ? 'Select ' + size + ' from ' + on.map(function (o) { return o.getAttribute('data-label'); }).join(' + ') + ' \u2192'
      : 'Select ' + size + ' ' + noun + ' & start \u2192';
    qsa('[data-start-label]').forEach(function (el) { el.textContent = label; });
    qsa('[data-size-label]').forEach(function (el) { el.textContent = size + ' ' + noun; });

    var total = on.reduce(function (sum, o) { return sum + Number(o.getAttribute('data-count') || 0); }, 0);
    qsa('[data-summary]').forEach(function (el) {
      el.textContent = on.length
        ? fmt(total) + ' words in ' + on.length + ' selected bucket' + (on.length === 1 ? '' : 's')
        : el.getAttribute('data-default');
    });
    qsa('[data-clear-buckets]').forEach(function (el) { el.hidden = on.length === 0; });
  }

  function pick(option) {
    var group = option.closest('[data-pick]');
    if (group.getAttribute('data-pick') === 'multi') {
      option.setAttribute('aria-pressed', option.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    } else {
      qsa('[data-option]', group).forEach(function (o) {
        o.setAttribute('aria-pressed', o === option ? 'true' : 'false');
      });
    }
    updateStudyLabels();
  }

  // ---- Flashcards -------------------------------------------------------------

  function setFlipped(flipped) {
    qsa('[data-card]').forEach(function (card) { card.classList.toggle('is-flipped', flipped); });
  }

  function toggleFlip() {
    var card = qs('[data-card]');
    if (card) setFlipped(!card.classList.contains('is-flipped'));
  }

  function startSession() {
    cardIndex = 0;
    setFlipped(false);
    renderCard();
    showScreen('session');
  }

  function answer() {
    cardIndex = (cardIndex + 1) % deck.length;
    setFlipped(false);
    renderCard();
  }

  // ---- Browse -----------------------------------------------------------------

  function updateResults() {
    var input = qs('[data-search]');
    var query = input ? input.value.trim().toLowerCase() : '';
    var rows = qsa('[data-row]');
    var shown = 0;
    rows.forEach(function (row) {
      var match = !query || row.textContent.toLowerCase().indexOf(query) !== -1;
      row.hidden = !match;
      if (match) shown++;
    });
    qsa('[data-result-count]').forEach(function (el) {
      el.textContent = query ? fmt(shown) : fmt(2105);
    });
    qsa('[data-empty]').forEach(function (el) { el.hidden = shown !== 0; });
    qsa('[data-empty-query]').forEach(function (el) { el.textContent = input ? input.value.trim() : ''; });
    qsa('[data-search-clear]').forEach(function (el) { el.hidden = !query; });
  }

  function updateSelection() {
    var checks = qsa('[data-check]');
    var count = 0;
    checks.forEach(function (check) {
      var row = check.closest('[data-row]');
      if (check.checked) count++;
      if (row) {
        if (check.checked) row.setAttribute('data-selected', ''); else row.removeAttribute('data-selected');
      }
    });
    qsa('[data-selected-count]').forEach(function (el) { el.textContent = count; });
    qsa('[data-selection]').forEach(function (el) { el.hidden = count === 0; });
    qsa('[data-pagination]').forEach(function (el) { el.hidden = count > 0; });
  }

  function setAllChecks(checked) {
    qsa('[data-row]').forEach(function (row) {
      var check = qs('[data-check]', row);
      if (check && (!checked || !row.hidden)) check.checked = checked;
    });
    updateSelection();
  }

  // ---- Page switcher ----------------------------------------------------------

  function addSwitcher() {
    var file = location.pathname.split('/').pop() || 'index.html';
    if (file === 'index.html') return;
    var nav = document.createElement('nav');
    nav.className = 'mockup-switcher';
    nav.setAttribute('aria-label', 'Mockups');
    nav.innerHTML = SWITCHER_PAGES.map(function (p) {
      return '<a href="' + p[0] + '"' + (p[0] === file ? ' aria-current="page"' : '') + '>' + p[1] + '</a>';
    }).join('');
    document.body.appendChild(nav);
  }

  function updateSwitcherLinks() {
    qsa('.mockup-switcher a').forEach(function (a) {
      a.setAttribute('href', a.getAttribute('href').split('#')[0] + location.hash);
    });
  }

  // ---- Events -----------------------------------------------------------------

  function onClick(e) {
    var t = e.target;
    var el;

    if (t.closest('[data-theme-toggle]')) {
      applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
    } else if ((el = t.closest('[data-nav]'))) {
      showScreen(el.getAttribute('data-nav').split(' ')[0]);
    } else if (t.closest('[data-start]') || t.closest('[data-study-selected]')) {
      startSession();
    } else if ((el = t.closest('[data-option]'))) {
      pick(el);
    } else if (t.closest('[data-clear-buckets]')) {
      qsa('[data-name="buckets"] [data-option]').forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
      updateStudyLabels();
    } else if (t.closest('[data-flip]')) {
      toggleFlip();
    } else if (t.closest('[data-answer]')) {
      answer();
    } else if (t.closest('[data-search-clear]')) {
      qs('[data-search]').value = '';
      updateResults();
      qs('[data-search]').focus();
    } else if (t.closest('[data-select-all]')) {
      setAllChecks(true);
    } else if (t.closest('[data-clear-selection]')) {
      setAllChecks(false);
    } else if ((el = t.closest('[data-row-head]')) && !t.closest('input, a, label')) {
      var row = el.closest('[data-row]');
      row.setAttribute('aria-expanded', row.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    }
  }

  function onKeydown(e) {
    var screen = currentScreen();
    var tag = e.target && e.target.tagName;
    var typing = /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(tag || '');

    if (screen === 'session') {
      if (e.code === 'Escape') { showScreen('study'); return; }
      var onFlip = e.target.matches && e.target.matches('[data-flip]');
      if ((e.code === 'Space' && !typing) || (e.code === 'Enter' && onFlip)) {
        e.preventDefault();
        toggleFlip();
      }
    }
  }

  function init() {
    qsa('[data-theme-toggle]').forEach(function (btn) { btn.insertAdjacentHTML('beforeend', ICON_SUN + ICON_MOON); });
    applyTheme(root.dataset.theme, false);
    renderRows();
    renderCard();
    updateStudyLabels();
    updateSelection();
    addSwitcher();

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('change', function (e) {
      if (e.target.matches('[data-check]')) updateSelection();
    });
    document.addEventListener('input', function (e) {
      if (e.target.matches('[data-search]')) updateResults();
    });

    showScreen(location.hash.slice(1));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
