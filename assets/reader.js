// Makes every word found in window.DICT tappable and shows its Russian translation in a popup.
// The tokenizer and key normalisation must stay in sync with tools/story.mjs.
(function () {
  'use strict';

  var DICT = new Map(Object.entries(window.DICT || {}));
  var WORD = /\p{L}+(?:['’-]\p{L}+)*/gu;

  function lookup(token) {
    var key = token.toLowerCase().replace(/’/g, "'");
    if (DICT.has(key)) return DICT.get(key);
    // Possessive: "mouse's" -> "mouse".
    if (key.slice(-2) === "'s" && DICT.has(key.slice(0, -2))) return DICT.get(key.slice(0, -2));
    return null;
  }

  // Hyphenated compounds missing from the dictionary fall back to their parts.
  function pieces(token) {
    return lookup(token) !== null || token.indexOf('-') < 0 ? [token] : token.split(/(-)/);
  }

  function wrap(node) {
    var text = node.nodeValue;
    var frag = document.createDocumentFragment();
    var last = 0;
    var m;
    WORD.lastIndex = 0;
    while ((m = WORD.exec(text))) {
      var at = m.index;
      pieces(m[0]).forEach(function (piece) {
        if (piece !== '-' && lookup(piece) !== null) {
          if (at > last) frag.appendChild(document.createTextNode(text.slice(last, at)));
          var span = document.createElement('span');
          span.className = 'w';
          span.textContent = piece;
          frag.appendChild(span);
          last = at + piece.length;
        }
        at += piece.length;
      });
    }
    if (last === 0) return;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  var FONT_STEP = .1, FONT_MIN = .8, FONT_MAX = 1.6;
  var fontScale = parseFloat(localStorage.getItem('fontScale')) || 1;
  document.querySelectorAll('.fontctl-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      fontScale = Math.min(FONT_MAX, Math.max(FONT_MIN, fontScale + parseFloat(btn.dataset.font) * FONT_STEP));
      document.documentElement.style.fontSize = (fontScale * 100) + '%';
      try { localStorage.setItem('fontScale', fontScale.toFixed(2)); } catch (e) {}
    });
  });

  document.querySelectorAll('[data-words]').forEach(function (root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(wrap);
  });

  var page = document.querySelector('main') || document.body;
  var pop = document.createElement('div');
  pop.className = 'pop';
  pop.hidden = true;
  pop.innerHTML = '<div class="pop-en"></div><div class="pop-ru" lang="ru"></div>';
  page.appendChild(pop);
  var en = pop.firstChild;
  var ru = pop.lastChild;
  var active = null;

  function hide() {
    if (active) active.classList.remove('on');
    active = null;
    pop.hidden = true;
  }

  function show(word) {
    if (active) active.classList.remove('on');
    active = word;
    word.classList.add('on');
    en.textContent = word.textContent;
    ru.textContent = lookup(word.textContent);
    pop.hidden = false;

    // Measure at the origin so the previous position doesn't squeeze the width.
    pop.style.left = pop.style.top = '0px';
    var gap = 10, edge = 12;
    var r = word.getClientRects()[0]; // first line if the word is split across lines
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var cx = r.left + r.width / 2;
    var left = Math.max(edge, Math.min(cx - w / 2, document.documentElement.clientWidth - w - edge));
    var below = r.top < h + gap + edge;
    pop.classList.toggle('below', below);
    pop.style.left = left + window.scrollX + 'px';
    pop.style.top = (below ? r.bottom + gap : r.top - h - gap) + window.scrollY + 'px';
    pop.style.setProperty('--ax', Math.max(14, Math.min(cx - left, w - 14)) + 'px');
  }

  document.addEventListener('click', function (e) {
    var word = e.target.closest && e.target.closest('.w');
    if (word && word !== active) show(word);
    else hide();
  });
  // iOS only dispatches clicks on plain text when an ancestor below <body> has a click listener.
  page.addEventListener('click', function () {});

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hide();
  });

  // Mobile browsers fire resize while scrolling (toolbar collapse), so only react to width changes.
  var width = window.innerWidth;
  window.addEventListener('resize', function () {
    if (window.innerWidth === width) return;
    width = window.innerWidth;
    if (active) show(active);
  });
})();
