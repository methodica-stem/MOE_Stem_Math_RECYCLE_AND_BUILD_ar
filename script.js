'use strict';
/* ===================================================================
   script.js — lomda engine (starter from the stem-lomda-builder skill)

   Distilled from the approved Flickering Lights lomda. Screens are plain
   HTML; this file reads what each screen declares and runs it:

     <section class="screen" data-screen="N" data-sid="q1" data-type="question" ...>

   data-type selects the behaviour (opening, explain, video, tiles, hub,
   question, applet, finish). Almost every screen needs NO code here. When
   one really does, add an entry to HOOKS below, keyed by its data-sid.

   QA contract — the QA system reads the page through these. Do not
   rename them, wrap this file in a function, or make it a module:
     goTo, TOTAL_SCREENS, window.lomdaState, LOMDA_SCREEN_CHANGED,
     LOMDA_COMPLETE, DEV_READY / DEV_GOTO.

   Learner-facing Hebrew lives in index.html, not here, so the translation
   export finds every string in one place.
   =================================================================== */

const TOTAL_SCREENS = 20;              // must equal the number of <section class="screen">
window.TOTAL_SCREENS = TOTAL_SCREENS;
let currentScreen = 1;
let finalStage = false;   // true while the end-of-lomda score pop-up or the dark screen is up (see "The end of the lomda")

window.lomdaState = {
  score: 0,             // running grade, 0-100
  questionScores: {},   // sid -> points earned
  DONE: {}              // screen number -> true once resolved (resume lock)
};

/* Per-screen extras, keyed by data-sid. Both functions are optional.
   enter(screen, n)            runs every time the screen is entered
   resolved(screen, n, outcome) runs once a question is answered
                               ('correct' | 'partial' | 'wrong2')
   Example:
   HOOKS['q7'] = { resolved: function (screen) { screen.querySelector('.teacher').hidden = false; } };
*/
const HOOKS = {};

/* ---------------- Small helpers ---------------- */
function screenEl(n) { return document.querySelector('.screen[data-screen="' + n + '"]'); }
function screenOf(el) { return el && el.closest ? el.closest('.screen') : null; }
function screenNum(el) { return parseInt(el.getAttribute('data-screen'), 10); }
function sidOf(el) { return el.getAttribute('data-sid') || ('s' + screenNum(el)); }
function announce(msg) {
  const el = document.getElementById('a11y-status');
  if (el) { el.textContent = ''; setTimeout(function () { el.textContent = msg; }, 30); }
}
function uiText(key) {
  // Engine strings (screen-reader announcements) live once in index.html, #ui-text.
  const el = document.querySelector('#ui-text [data-key="' + key + '"]');
  return el ? el.textContent : '';
}

/* ---------------- Canvas scaling ----------------
   The design is a fixed 1920x1080 stage. A QA host embeds the page in an
   iframe whose size is not always settled when this first runs, and a parent
   resizing the iframe does not always fire 'resize' inside it — so scale on
   every signal available and re-run a few times during the first seconds. */
function scaleApp() {
  const app = document.getElementById('app');
  if (!app || !window.innerWidth || !window.innerHeight) return;
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  app.style.transform = 'scale(' + scale + ')';
  app.style.left = ((window.innerWidth - 1920 * scale) / 2) + 'px';
  app.style.top = ((window.innerHeight - 1080 * scale) / 2) + 'px';
}
function appScale() { return Math.min(window.innerWidth / 1920, window.innerHeight / 1080) || 1; }
window.addEventListener('resize', scaleApp);
window.addEventListener('load', scaleApp);
document.addEventListener('visibilitychange', function () { if (!document.hidden) scaleApp(); });
requestAnimationFrame(scaleApp);
[100, 300, 800, 1500, 3000].forEach(function (ms) { setTimeout(scaleApp, ms); });
if (window.ResizeObserver) new ResizeObserver(scaleApp).observe(document.documentElement);

/* ---------------- Navigation ---------------- */
function goTo(n) {
  if (n < 1 || n > TOTAL_SCREENS) return;
  leaveFinalStage();
  pauseAllMedia();
  closeAllOverlays();
  // a screen already left plays its gradual reveal only once ("seen")
  document.querySelectorAll('.screen.active').forEach(function (s) { s.classList.add('seen'); });
  document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
  const target = screenEl(n);
  if (target) target.classList.add('active');
  currentScreen = n;
  resetScreenState(n);
  notifyScreenChanged(n);
  schedulePreload(n + 1);
  schedulePreload(n - 1);
}

/* The forward arrow is the gate. While it is hidden the learner cannot move
   on — the keyboard path (ArrowLeft) goes through here too, so it is gated. */
function advanceScreen() {
  const s = screenEl(currentScreen);
  const arrow = s && s.querySelector('.nav-next');
  if (arrow && arrow.classList.contains('hidden')) return;
  goTo(currentScreen + 1);
}
function goBack() { goTo(currentScreen - 1); }

function revealForwardNav(n) {
  const s = screenEl(n);
  const arrow = s && s.querySelector('.nav-next');
  if (arrow) { arrow.classList.remove('hidden'); arrow.classList.add('blink'); }
}
function hideForwardNav(n) {
  const s = screenEl(n);
  const arrow = s && s.querySelector('.nav-next');
  if (arrow) { arrow.classList.add('hidden'); arrow.classList.remove('blink'); }
}

function pauseAllMedia() {
  document.querySelectorAll('video, audio').forEach(function (m) { try { m.pause(); } catch (e) {} });
}

/* Warm the neighbouring screens' images while the learner reads this one.
   All screens live in the DOM at once; their <img loading="lazy"> only start
   fetching when the screen is shown, so without this every image pops in. */
const preloaded = {};
function preloadScreenImages(n) {
  if (preloaded[n]) return;
  preloaded[n] = true;
  const s = screenEl(n);
  if (!s) return;
  s.querySelectorAll('img[src]').forEach(function (img) { (new Image()).src = img.getAttribute('src'); });
}
function schedulePreload(n) {
  const run = function () { preloadScreenImages(n); };
  if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 2000 }); else setTimeout(run, 500);
}

/* ---------------- QA / dev bridge ----------------
   index_dev.html and the QA system embed this page in an iframe and talk to
   it only through postMessage (file:// blocks direct access between frames). */
function notifyScreenChanged(n) {
  try { window.parent.postMessage({ type: 'LOMDA_SCREEN_CHANGED', screen: n }, '*'); } catch (e) {}
}
let handshakeAcked = false;
function announceReady() {
  if (handshakeAcked) return;
  try {
    if (window.parent && window.parent !== window) {
      const screens = Array.prototype.map.call(document.querySelectorAll('.screen'), function (s) {
        return { n: screenNum(s), sid: s.getAttribute('data-sid') || '', type: s.getAttribute('data-type') || '' };
      });
      window.parent.postMessage({ type: 'DEV_READY', total: TOTAL_SCREENS, screens: screens }, '*');
    }
  } catch (e) {}
}
/* One "ready" message can be lost if the host attaches its listener late, so
   re-announce until the host answers with a DEV_GOTO (or 20 tries pass). */
let handshakeTries = 0;
const handshakeTimer = setInterval(function () {
  announceReady();
  if (handshakeAcked || ++handshakeTries > 20) clearInterval(handshakeTimer);
}, 400);
window.addEventListener('load', announceReady);

window.addEventListener('message', function (e) {
  const d = e.data;
  if (!d || typeof d !== 'object') return;
  if (d.type === 'DEV_GOTO' && typeof d.screen === 'number') {
    handshakeAcked = true;
    goTo(d.screen);
  } else if (d.type === 'APPLET_STARTED') {
    onAppletStarted(e.source);
  }
});

/* Some hosts switch screens by toggling .active themselves instead of calling
   goTo(). Catch that and run the normal entry logic. */
(function () {
  const app = document.getElementById('app');
  if (!app || typeof MutationObserver === 'undefined') return;
  new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      const el = m.target;
      if (!el.classList || !el.classList.contains('screen') || !el.classList.contains('active')) return;
      const n = screenNum(el);
      if (isNaN(n) || n === currentScreen) return;
      leaveFinalStage();
      currentScreen = n;
      resetScreenState(n);
      notifyScreenChanged(n);
    });
  }).observe(app, { subtree: true, attributes: true, attributeFilter: ['class'] });
})();

/* ---------------- Screen entry ---------------- */
const ENTER = {
  opening: function () {},
  explain: enterExplain,
  video: enterVideo,
  tiles: enterTiles,
  hub: enterExplain,       // a guided hub moves on through its own button; a final hub may show the arrow
  question: enterQuestion,
  applet: enterApplet,
  finish: enterFinish
};

function resetScreenState(n) {
  const s = screenEl(n);
  if (!s) return;
  closePops();
  updateStepper(s);
  const type = s.getAttribute('data-type') || 'explain';
  (ENTER[type] || enterExplain)(s, n);
  const hook = HOOKS[sidOf(s)];
  if (hook && hook.enter) hook.enter(s, n);
  s.focus({ preventScroll: true });
}

/* Explanation screens: the arrow appears at once, or after data-arrow-delay seconds. */
const arrowTimers = {};
function enterExplain(s, n) {
  narrationEnter(s, n);
  // a short silent animation (screen 15 letter-intro, 3 s) plays from the start on every entry, alongside the
  // narration, and stops on its last frame: no controls, no replay, no loop (developer, 2026-10-21)
  const anim = s.querySelector('.screen-anim');
  if (anim) { try { anim.muted = true; anim.currentTime = 0; } catch (e) {} anim.play().catch(function () {}); }
  if (!s.querySelector('.nav-next')) return;
  if (s.querySelector('.poll')) {                 // a poll gates the screen: the arrow waits for a choice
    if (window.lomdaState.DONE[n]) revealForwardNav(n); else hideForwardNav(n);
    return;
  }
  const delay = parseFloat(s.getAttribute('data-arrow-delay') || '0');
  if (!delay || window.lomdaState.DONE[n]) { revealForwardNav(n); return; }
  hideForwardNav(n);
  clearTimeout(arrowTimers[n]);
  arrowTimers[n] = setTimeout(function () { window.lomdaState.DONE[n] = true; revealForwardNav(n); }, delay * 1000);
}

/* ===================================================================
   Narration (developer's recordings, 2026-10-18)
     <audio class="narration" src="assets/audio/screenN.mp3"></audio>
     <button class="narr-btn" …></button>
     <p class="reveal" data-at="3.1">…</p>      ← appears at that second of the voice
   First visit: the voice starts with the screen and each paragraph rises when
   the narrator reaches it. data-arrow-delay is the recording's length, so the
   arrow opens when the voice ends even if the browser blocked the sound; the
   recording's own end opens it too. Coming back: nothing plays by itself;
   the speaker button plays, pauses and replays.
   =================================================================== */
function narrationEnter(s, n) {
  const a = s.querySelector('audio.narration');
  if (!a) return;
  const btn = s.querySelector('.narr-btn');
  if (!a._wired) {
    a._wired = true;
    const sync = function () { if (btn) { btn.classList.toggle('playing', !a.paused); btn.setAttribute('aria-pressed', String(!a.paused)); } };
    a.addEventListener('play', sync);
    a.addEventListener('pause', sync);
    a.addEventListener('ended', function () {
      sync();
      if (s.querySelector('.poll')) return;               // a poll screen waits for its choice
      window.lomdaState.DONE[n] = true;
      clearTimeout(arrowTimers[n]);
      revealForwardNav(n);
    });
    if (btn) btn.addEventListener('click', function () {
      if (a.paused) { if (a.ended) a.currentTime = 0; a.play().catch(function () {}); } else a.pause();
    });
  }
  try { a.pause(); a.currentTime = 0; } catch (e) {}
  if (!s.classList.contains('seen')) a.play().catch(function () {});   // first visit only
}
/* reveal timings from the narration: data-at seconds -> animation delay */
document.querySelectorAll('.reveal[data-at]').forEach(function (el) { el.style.animationDelay = el.getAttribute('data-at') + 's'; });

/* ===================================================================
   Feedback popup (one, shared, outside every screen)
   showFeedback(type, { title, body }) — type is the outcome:
   retry | retryPartial | correct | partial | wrong2.
   The popup also gets the class fb-<sid>, so a screen can move it in CSS:
     #feedback-popup.fb-q3 { left: 340px; bottom: 185px; }
   =================================================================== */
function showFeedback(type, cfg) {
  const popup = document.getElementById('feedback-popup');
  const s = screenEl(currentScreen);
  // the question is settled (final feedback): the hint has done its job and must not sit under the panel (developer, 2026-11-12)
  if (type === 'correct' || type === 'partial' || type === 'wrong2') closePops();
  popup.className = 'show ' + type + (s ? ' fb-' + sidOf(s) : '');
  // a popup the learner dragged comes back where they left it (same screen, same message)
  const pos = fbDragged[currentScreen + ':' + type];
  popup.style.left = pos ? pos[0] + 'px' : '';
  popup.style.top = pos ? pos[1] + 'px' : '';
  popup.style.bottom = pos ? 'auto' : '';
  // "התשובה שלי" in the final wrong feedback; the right answer shows first
  const mine = document.getElementById('fb-mine');
  const withMine = !!s && (type === 'wrong2' || type === 'partial') && myAnswerOn(s);
  mine.hidden = !withMine;
  if (withMine) answerView(s, 'right');
  document.getElementById('fb-title').textContent = (cfg && cfg.title) || '';
  const body = document.getElementById('fb-body');
  body.innerHTML = '';
  ((cfg && cfg.body) || []).forEach(function (line) {
    if (line && line.nodeType === 1) { body.appendChild(line.cloneNode(true)); return; }
    const p = document.createElement('p');
    p.textContent = line;
    body.appendChild(p);
  });
  openOverlayFocus(popup);
}
function hideFeedback() {
  const popup = document.getElementById('feedback-popup');
  if (popup.classList.contains('show')) { popup.classList.remove('show'); returnOverlayFocus(); }
}

/* Every feedback can be dragged aside with a mouse or a finger, when it covers
   the question (developer, 2026-10-21). It stays inside the stage. */
const fbDragged = {};   // 'screen:type' -> [left, top] in stage px
let fbDrag = null;
document.getElementById('feedback-popup').addEventListener('pointerdown', function (e) {
  if (e.button > 0 || e.target.closest('button')) return;
  const p = this;
  fbDrag = { x: e.clientX, y: e.clientY, left: p.offsetLeft, top: p.offsetTop, moved: false };
  try { p.setPointerCapture(e.pointerId); } catch (err) {}
});
document.getElementById('feedback-popup').addEventListener('pointermove', function (e) {
  if (!fbDrag) return;
  const k = appScale(), dx = (e.clientX - fbDrag.x) / k, dy = (e.clientY - fbDrag.y) / k;
  if (!fbDrag.moved && Math.hypot(dx, dy) < 4) return;
  fbDrag.moved = true;
  this.classList.add('dragging');
  const left = Math.max(0, Math.min(1920 - this.offsetWidth, fbDrag.left + dx));
  const top = Math.max(0, Math.min(1080 - this.offsetHeight, fbDrag.top + dy));
  this.style.left = left + 'px'; this.style.top = top + 'px'; this.style.bottom = 'auto';
  const type = ['retry', 'retryPartial', 'correct', 'partial', 'wrong2'].filter(function (t) { return this.classList.contains(t); }, this)[0];
  fbDragged[currentScreen + ':' + type] = [left, top];
});
function fbDragEnd() {
  if (!fbDrag) return;
  fbDrag = null;
  document.getElementById('feedback-popup').classList.remove('dragging');
}
document.getElementById('feedback-popup').addEventListener('pointerup', fbDragEnd);
document.getElementById('feedback-popup').addEventListener('pointercancel', fbDragEnd);

/* "התשובה שלי" / "התשובה הנכונה" (developer, 2026-10-21): after a final wrong
   answer the right answer shows at once (green); the button in the feedback
   swaps to the learner's own answer (wrong parts red, right parts green) and
   back. Not on a screen with data-no-my-answer (Q6a). */
function myAnswerOn(s) {
  const st = qEnsure(s);
  return st.done && st.mine !== undefined && !s.hasAttribute('data-no-my-answer');
}
/* the learner's answer, kept at the final check */
function answerTake(s) {
  const kind = qConfig(s).kind;
  if (kind === 'input') return inputEls(s).map(function (i) { return i.value; });
  if (kind === 'draw') return drawValue(s);
  if (kind === 'dnd') return Array.prototype.map.call(s.querySelectorAll('.dnd-slot'), function (sl) {
    const c = sl.querySelector('.dnd-chip'); return c ? c.getAttribute('data-chip') : '';
  });
  return Array.prototype.map.call(s.querySelectorAll('.q-opt.selected'), function (o) { return o.getAttribute('data-id'); });
}
/* show 'mine' or 'right' */
function answerView(s, which) {
  const kind = qConfig(s).kind, st = qEnsure(s), mine = which === 'mine';
  st.view = which;
  if (kind === 'input') {
    const els = inputEls(s);
    els.forEach(function (i, k) { i.disabled = true; i.value = mine ? st.mine[k] : numFormat(numNorm(i.getAttribute('data-answer'))); });
    const marks = inputMarks(s);
    els.forEach(function (i, k) { i.classList.toggle('correct', !mine || marks[k]); i.classList.toggle('wrong', mine && !marks[k]); });
  } else if (kind === 'draw') {
    const c = drawChart(s);
    c.classList.add('locked');
    drawSet(s, mine ? st.mine : drawAnswer(s));
    c.classList.toggle('correct', !mine);
    c.classList.toggle('wrong', mine);
  } else if (kind === 'dnd') {
    if (mine) { dndArrange(s, st.mine); dndMark(s, false); } else { dndRevealCorrect(s); dndMark(s, true); }
    dndLock(s);
  } else {
    s.querySelectorAll('.q-opt').forEach(function (o) {
      const right = o.hasAttribute('data-correct'), on = mine && st.mine.indexOf(o.getAttribute('data-id')) !== -1;
      o.classList.toggle('selected', on);
      o.setAttribute('aria-checked', String(on));
      o.classList.toggle('correct', mine ? on && right : right);
      o.classList.toggle('wrong', on && !right);
    });
  }
  document.getElementById('fb-mine').textContent = mine ? 'الإجابة الصحيحة' : 'إجابتي';
}
document.getElementById('fb-mine').addEventListener('click', function () {
  const s = screenEl(currentScreen);
  if (s && myAnswerOn(s)) answerView(s, qEnsure(s).view === 'mine' ? 'right' : 'mine');
});

/* Feedback text is written in the screen itself:
     <div class="fb-src" hidden>
       <div data-fb="correct"><p class="fb-t">צדקת!</p><p>הסבר…</p></div>
     </div>
   Read it into { correct: {title, body:[<p>…]}, … }. */
function readFeedback(s) {
  const out = {};
  s.querySelectorAll('.fb-src [data-fb]').forEach(function (box) {
    const t = box.querySelector('.fb-t');
    out[box.getAttribute('data-fb')] = {
      title: t ? t.textContent.trim() : '',
      body: Array.prototype.filter.call(box.children, function (c) { return c !== t; })
    };
  });
  return out;
}

/* ---------------- Overlays + focus (a11y) ---------------- */
let lastFocusedBeforeOverlay = null;
function openOverlayFocus(el) {
  if (!el) return;
  if (!lastFocusedBeforeOverlay) lastFocusedBeforeOverlay = document.activeElement;
  el.focus({ preventScroll: true });
}
function returnOverlayFocus() {
  const el = lastFocusedBeforeOverlay;
  lastFocusedBeforeOverlay = null;
  if (el && typeof el.focus === 'function' && document.contains(el)) el.focus({ preventScroll: true });
}
function getOpenDialog() {
  const ids = ['img-zoom-modal', 'reopen-popup', 'feedback-popup'];
  for (let i = 0; i < ids.length; i++) {
    const el = document.getElementById(ids[i]);
    if (el && el.classList.contains('show')) return el;
  }
  return null;
}
function getFocusable(container) {
  return Array.prototype.slice
    .call(container.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), iframe'))
    .filter(function (el) { return el.tagName === 'IFRAME' || el.offsetParent !== null; });
}
function closeAllOverlays() {
  ['feedback-popup', 'img-zoom-modal', 'reopen-popup'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
  });
  const body = document.getElementById('reopen-popup-body');
  if (body) body.innerHTML = '';
  document.querySelectorAll('.reopen-btn.is-open').forEach(function (b) { b.classList.remove('is-open'); });
  document.querySelectorAll('.term.is-open').forEach(function (t) { showTerm(t, false); });
  closePops();
  returnOverlayFocus();
}

document.addEventListener('keydown', function (e) {
  const dialog = getOpenDialog();
  // Keep Tab inside an open dialog (feedback is non-modal on purpose: the
  // learner re-picks an answer while the retry message stays up).
  if (dialog && dialog.id !== 'feedback-popup' && e.key === 'Tab') {
    const f = getFocusable(dialog);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    if (f.indexOf(document.activeElement) === -1) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    return;
  }
  if (e.key === 'Escape') { closeAllOverlays(); return; }
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (!dialog && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !(document.activeElement && document.activeElement.getAttribute('role') === 'slider') && !(e.target.closest && e.target.closest('[role="slider"]'))) {
    if (e.key === 'ArrowLeft') advanceScreen();   // RTL: forward is on the left
    if (e.key === 'ArrowRight') goBack();
  }
  if (e.key === 'Enter' || e.key === ' ') {
    // div/span widgets with role=button/radio/checkbox get no native Enter/Space.
    const el = document.activeElement;
    const role = el && el.getAttribute && el.getAttribute('role');
    if (el && el.tagName !== 'BUTTON' && (role === 'button' || role === 'radio' || role === 'checkbox')) {
      e.preventDefault();
      el.click();
    }
  }
});

/* ---------------- Delegated clicks ----------------
   Markup declares intent with data-action / classes; no inline onclick. */
document.addEventListener('click', function (e) {
  const t = e.target;
  let el;
  if ((el = t.closest('.nav-next'))) { advanceScreen(); return; }
  if ((el = t.closest('.nav-prev'))) { goBack(); return; }
  if ((el = t.closest('[data-action="next"]'))) { goTo(currentScreen + 1); return; }
  if ((el = t.closest('[data-action="finish"]'))) { finishLomda(); return; }
  if ((el = t.closest('.play-btn-big'))) { playVideo(screenOf(el)); return; }
  if ((el = t.closest('.q-opt'))) { qSelect(el); return; }
  if ((el = t.closest('.btn-check'))) { checkAnswer(screenOf(el)); return; }
  if ((el = t.closest('.tile'))) { revealTile(el); return; }
  if ((el = t.closest('.reopen-btn'))) { toggleReopen(el); return; }
  if ((el = t.closest('[data-zoom-src]'))) { openZoom(el); return; }
  if ((el = t.closest('[data-zoom-close]'))) { closeZoom(); return; }
  if ((el = t.closest('.term'))) { toggleTerm(el); return; }
  if ((el = t.closest('.dnd-chip'))) { dndChipClick(el); return; }
  if ((el = t.closest('.dnd-slot'))) { dndSlotClick(el); return; }
  if ((el = t.closest('.dnd-bank'))) { dndBankClick(); return; }
  if ((el = t.closest('.poll-opt'))) { pollChoose(el); return; }
  if ((el = t.closest('.pop-toggle'))) { togglePop(el); return; }
  if ((el = t.closest('.pop-close'))) { closePops(); return; }
  if ((el = t.closest('.hear-btn'))) { hearOpen(screenOf(el)); return; }
  if ((el = t.closest('.hear-back'))) { hearBack(screenOf(el)); return; }
  if (!t.closest('.pop')) closePops();
});

/* ===================================================================
   Video screens
   <div class="video-wrap">
     <video class="video-el" playsinline preload="metadata" ...><source src="assets/videos/x.mp4#t=0.001" type="video/mp4"></video>
     <div class="vcap-src" data-clear-after="21.5" hidden>
       <span data-t="0.4">first caption line</span>
       <span data-t="3.2">second caption line</span>
     </div>
     <div class="video-caption hidden"><p></p></div>
     <button class="play-btn-big" type="button" aria-label="…"></button>
   </div>
   The control bar (.vctrls) is cloned from #vctrls-tpl, so its labels exist
   once. A <video data-pending-asset> has no file yet: "playing" it unlocks
   the arrow after 1.5 s, so gating can be tested before the video arrives.
   =================================================================== */
const videoStarted = {};
const videoEnded = {};
const captionsOn = {};

function enterVideo(s, n) {
  if (videoStarted[n]) return;          // resume lock: keep the arrow if already earned
  const big = s.querySelector('.play-btn-big');
  if (big) big.classList.remove('hidden');
  hideForwardNav(n);
}

function readCues(wrap) {
  const src = wrap.querySelector('.vcap-src');
  if (!src) return [];
  const spans = Array.prototype.slice.call(src.querySelectorAll('span[data-t]'));
  const clear = parseFloat(src.getAttribute('data-clear-after') || 'Infinity');
  return spans.map(function (sp, i) {
    const start = parseFloat(sp.getAttribute('data-t'));
    const end = sp.hasAttribute('data-end') ? parseFloat(sp.getAttribute('data-end'))
      : (i + 1 < spans.length ? parseFloat(spans[i + 1].getAttribute('data-t')) : clear);
    return { start: start, end: end, el: sp };
  });
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function initVideo(wrap) {
  const s = screenOf(wrap), n = screenNum(s);
  const video = wrap.querySelector('video');
  if (!video) return;
  const tpl = document.getElementById('vctrls-tpl');
  if (tpl && !wrap.querySelector('.vctrls')) wrap.appendChild(tpl.content.cloneNode(true));
  const bar = wrap.querySelector('.vctrls');
  const cues = readCues(wrap);
  const capEl = wrap.querySelector('.video-caption');
  const capText = capEl && capEl.querySelector('p');
  captionsOn[n] = true;

  video.addEventListener('timeupdate', function () {
    if (capEl && capText) {
      const t = video.currentTime;
      const cue = captionsOn[n] && cues.find(function (c) { return t >= c.start && t < c.end; });
      if (cue) { capText.textContent = cue.el.textContent; capEl.classList.remove('hidden'); }
      else capEl.classList.add('hidden');
    }
    // Unlock a little before the real end: in some embeds 'ended' fires late or never.
    if (!videoEnded[n] && video.duration && video.duration - video.currentTime <= 0.25) onVideoEnded(n);   // the arrow opens at the end (developer, 2026-10-18); 0.25 s covers embeds where "ended" never fires
  });
  video.addEventListener('ended', function () { onVideoEnded(n); });
  if (!bar) return;

  const playBtn = bar.querySelector('[data-play]');
  const curEl = bar.querySelector('[data-cur]');
  const durEl = bar.querySelector('[data-dur]');
  const seek = bar.querySelector('[data-seek]');
  const ccBtn = bar.querySelector('[data-cc]');
  const muteBtn = bar.querySelector('[data-mute]');
  const vol = bar.querySelector('[data-vol]');
  const fullBtn = bar.querySelector('[data-full]');
  let seeking = false;

  function syncPlay() { playBtn.textContent = video.paused ? '▶' : '⏸'; }
  video.addEventListener('play', syncPlay);
  video.addEventListener('pause', syncPlay);
  playBtn.addEventListener('click', function () { if (video.paused) playVideo(s); else video.pause(); });
  video.addEventListener('loadedmetadata', function () { durEl.textContent = formatTime(video.duration); });
  video.addEventListener('timeupdate', function () {
    curEl.textContent = formatTime(video.currentTime);
    if (!seeking && video.duration) seek.value = String(Math.round(video.currentTime / video.duration * 1000));
  });
  seek.addEventListener('input', function () {
    seeking = true;
    if (video.duration) curEl.textContent = formatTime(seek.value / 1000 * video.duration);
  });
  seek.addEventListener('change', function () {
    if (video.duration) video.currentTime = seek.value / 1000 * video.duration;
    seeking = false;
  });
  if (!cues.length && ccBtn) ccBtn.hidden = true;
  if (ccBtn) ccBtn.addEventListener('click', function () {
    captionsOn[n] = !captionsOn[n];
    ccBtn.classList.toggle('is-off', !captionsOn[n]);
    ccBtn.setAttribute('aria-pressed', String(captionsOn[n]));
  });
  function syncMute() {
    const muted = video.muted || video.volume === 0;
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-pressed', String(muted));
  }
  muteBtn.addEventListener('click', function () {
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 1;
    vol.value = video.muted ? '0' : String(Math.round(video.volume * 100));
    syncMute();
  });
  vol.addEventListener('input', function () {
    video.volume = vol.value / 100;
    video.muted = video.volume === 0;
    syncMute();
  });
  syncMute();
  // Fullscreen only ever from the learner's own click, never automatically.
  fullBtn.addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    else if (wrap.requestFullscreen) wrap.requestFullscreen().catch(function () {});
  });
  document.addEventListener('fullscreenchange', function () {
    fullBtn.setAttribute('aria-pressed', String(document.fullscreenElement === wrap));
  });
}

function playVideo(s) {
  if (!s) return;
  const n = screenNum(s);
  const video = s.querySelector('.video-wrap video');
  const big = s.querySelector('.play-btn-big');
  videoStarted[n] = true;
  if (big) big.classList.add('hidden');
  if (!video) return;
  if (video.hasAttribute('data-pending-asset')) {
    setTimeout(function () { onVideoEnded(n); }, 1500);
    return;
  }
  video.play().catch(function () {});
}

function onVideoEnded(n) {
  if (videoEnded[n]) return;
  videoEnded[n] = true;
  window.lomdaState.DONE[n] = true;
  revealForwardNav(n);
}

/* ===================================================================
   Reveal tiles — click every tile; the arrow appears when all were seen.
   <div class="tiles" data-mode="grayscale-once|card-flip">
     <div class="tile" data-tile-id="noa" role="button" tabindex="0" aria-label="…">
       …tile face…
       <div class="tile-content" hidden>the text this tile reveals</div>
     </div>
   </div>
   <div class="tiles-board" aria-live="polite"></div>   (grayscale-once only)
   =================================================================== */
const tilesSeen = {};
function enterTiles(s, n) {
  if (!tilesSeen[n]) tilesSeen[n] = new Set();
  if (window.lomdaState.DONE[n]) { revealForwardNav(n); return; }
  hideForwardNav(n);
}
function revealTile(tile) {
  const s = screenOf(tile), n = screenNum(s);
  const group = tile.closest('.tiles');
  const mode = (group && group.getAttribute('data-mode')) || 'grayscale-once';
  if (!tilesSeen[n]) tilesSeen[n] = new Set();
  const content = tile.querySelector('.tile-content');
  if (mode === 'card-flip') {
    tile.classList.toggle('flipped');
  } else {
    const board = s.querySelector('.tiles-board');
    if (board && content) { board.innerHTML = content.innerHTML; board.classList.remove('empty'); }
    s.querySelectorAll('.tile.current').forEach(function (t) { t.classList.remove('current'); });
    tile.classList.add('viewed', 'current');
    if (group) group.classList.add('started');
  }
  tilesSeen[n].add(tile.getAttribute('data-tile-id'));
  if (tilesSeen[n].size >= s.querySelectorAll('.tile').length) {
    window.lomdaState.DONE[n] = true;
    revealForwardNav(n);
  }
}

/* ===================================================================
   Questions — single choice, multiple choice, drag and drop.
   Declared on the section:
     data-type="question" data-kind="single|multi|dnd" data-weight="10"
   Correct options carry data-correct; drop slots carry data-accept.
   Two attempts:
     1st wrong  -> retry message, nothing turns red, the check button hides
                   until the answer changes.
     correct, or 2nd wrong -> final feedback, answer revealed, arrow appears.
   Marks are given once; coming back shows the final state again.
   =================================================================== */
const QCONFIG = {};   // screen number -> { kind, key, weight, feedback } (read by the Arabic QA tools too)
const qState = {};    // screen number -> { attempts, done, outcome, lastWrong }

function qConfig(s) {
  const n = screenNum(s);
  if (!QCONFIG[n]) {
    QCONFIG[n] = {
      kind: s.getAttribute('data-kind') || 'single',
      key: sidOf(s),
      weight: parseFloat(s.getAttribute('data-weight') || '0'),
      maxAttempts: parseInt(s.getAttribute('data-attempts') || '2', 10),
      feedback: readFeedback(s)
    };
  }
  return QCONFIG[n];
}
function qEnsure(s) {
  const n = screenNum(s);
  if (!qState[n]) qState[n] = { attempts: 0, done: false, outcome: null, lastWrong: null };
  return qState[n];
}
function checkBtn(s) { return s.querySelector('.btn-check'); }
function setCheckable(s, can) {
  const b = checkBtn(s);
  if (!b) return;
  b.disabled = !can;   // a disabled check button is hidden by CSS, never shown faded
}

function enterQuestion(s, n) {
  const cfg = qConfig(s), st = qEnsure(s);
  if (st.done) {
    renderFinal(s, cfg, st);
    setCheckable(s, false);
    showFeedback(st.outcome, cfg.feedback[st.outcome]);
    hearMoreSchedule(s, 0);
    helpBlink(s, false);
    questionArrow(s, n);
    return;
  }
  hearMoreHide(s);
  helpBlink(s, cfg.maxAttempts === 1);
  hideForwardNav(n);
  if (cfg.kind === 'dnd') dndReset(s);
  else if (cfg.kind === 'input') inputReset(s);
  else if (cfg.kind === 'draw') drawReset(s);
  else s.querySelectorAll('.q-opt').forEach(function (o) {
    o.classList.remove('selected', 'correct', 'wrong');
    o.setAttribute('aria-checked', 'false');
  });
  st.attempts = 0;
  st.lastWrong = null;
  setCheckable(s, false);
}

function qSelect(opt) {
  const s = screenOf(opt), cfg = qConfig(s), st = qEnsure(s);
  if (st.done) return;
  if (cfg.kind === 'single') {
    s.querySelectorAll('.q-opt').forEach(function (o) {
      const on = o === opt;
      o.classList.toggle('selected', on);
      o.setAttribute('aria-checked', String(on));
    });
  } else {
    const on = !opt.classList.contains('selected');
    opt.classList.toggle('selected', on);
    opt.setAttribute('aria-checked', String(on));
  }
  updateCheckable(s);
}

function answerSnapshot(s) {
  const cfg = qConfig(s);
  if (cfg.kind === 'input') return JSON.stringify(inputValues(s));
  if (cfg.kind === 'draw') return String(drawValue(s));
  if (cfg.kind === 'dnd') {
    return JSON.stringify(Array.prototype.map.call(s.querySelectorAll('.dnd-slot'), function (slot) {
      const c = slot.querySelector('.dnd-chip');
      return c ? c.getAttribute('data-chip') : '';
    }));
  }
  return JSON.stringify(Array.prototype.map.call(s.querySelectorAll('.q-opt.selected'), function (o) {
    return o.getAttribute('data-id');
  }).sort());
}
function hasAnswer(s) {
  const kind = qConfig(s).kind;
  if (kind === 'input') return inputValues(s).every(function (v) { return v !== ''; });
  if (kind === 'draw') return drawValue(s) > 0;
  if (kind === 'dnd') {
    return Array.prototype.every.call(s.querySelectorAll('.dnd-slot'), function (sl) { return !!sl.querySelector('.dnd-chip'); });
  }
  return !!s.querySelector('.q-opt.selected');
}
function updateCheckable(s) {
  const st = qEnsure(s);
  const moved = qConfig(s).kind !== 'dnd' || !dndSwapMode(s) || st.touched;    // swap mode starts full
  const can = !st.done && moved && hasAnswer(s) && answerSnapshot(s) !== st.lastWrong;
  setCheckable(s, can);
  // once the answer changes, the "נסו שוב" message goes away and only "צדקתי?" shows (developer, 2026-10-17).
  // Focus stays where the learner is (they may be typing), so the popup is closed without moving focus.
  const popup = document.getElementById('feedback-popup');
  if (st.lastWrong && answerSnapshot(s) !== st.lastWrong && (popup.classList.contains('retry') || popup.classList.contains('retryPartial')) && popup.classList.contains('show')) {
    popup.classList.remove('show');
    lastFocusedBeforeOverlay = null;
  }
}

/* -> 'correct' | 'partialClean' (only right picks, not all) | 'partialMixed' (some right + wrong) | 'wrong' */
function grade(s) {
  const cfg = qConfig(s);
  if (cfg.kind === 'input') return inputMarks(s).every(Boolean) ? 'correct' : 'wrong';
  if (cfg.kind === 'draw') return drawValue(s) === drawAnswer(s) ? 'correct' : 'wrong';
  if (cfg.kind === 'dnd') {
    const slots = s.querySelectorAll('.dnd-slot');
    let right = 0;
    slots.forEach(function (sl) { if (dndSlotRight(sl)) right++; });
    return right === slots.length ? 'correct' : (right > 0 ? 'partialMixed' : 'wrong');
  }
  let rightPicked = 0, wrongPicked = 0, rightTotal = 0;
  s.querySelectorAll('.q-opt').forEach(function (o) {
    const isRight = o.hasAttribute('data-correct'), on = o.classList.contains('selected');
    if (isRight) rightTotal++;
    if (on && isRight) rightPicked++;
    if (on && !isRight) wrongPicked++;
  });
  if (rightPicked === rightTotal && wrongPicked === 0) return 'correct';
  if (rightPicked > 0 && wrongPicked === 0) return 'partialClean';
  if (rightPicked > 0) return 'partialMixed';
  return 'wrong';
}

function checkAnswer(s) {
  if (!s) return;
  const n = screenNum(s), cfg = qConfig(s), st = qEnsure(s);
  if (st.done || !hasAnswer(s)) return;
  st.attempts++;
  const g = grade(s);
  const fb = cfg.feedback;

  if (g !== 'correct' && st.attempts < cfg.maxAttempts) {
    st.lastWrong = answerSnapshot(s);
    setCheckable(s, false);
    // data-partial-hint="any": the "on the right track" hint also when a wrong pick is mixed in
    const anyHint = s.getAttribute('data-partial-hint') === 'any';
    const type = ((g === 'partialClean' || (anyHint && g === 'partialMixed')) && fb.retryPartial) ? 'retryPartial' : 'retry';
    if (cfg.kind === 'dnd' && s.hasAttribute('data-mark-attempts')) dndMark(s, false);
    showFeedback(type, fb[type]);
    helpBlink(s, true);
    return;
  }

  let outcome = 'correct';
  if (g !== 'correct') outcome = (cfg.kind === 'multi' && fb.partial && g !== 'wrong') ? 'partial' : 'wrong2';
  st.done = true;
  st.outcome = outcome;
  if (outcome !== 'correct') st.mine = answerTake(s);   // for "התשובה שלי"
  helpBlink(s, false);
  hideForwardNav(n);
  window.lomdaState.DONE[n] = true;
  recordScore(cfg.key, outcome === 'correct' ? cfg.weight : 0);
  setCheckable(s, false);
  // the right answer shows at once with the feedback, and the arrow with it
  // (developer, 2026-10-21 — replaces the 3 s reveal of Q2/Q7)
  renderFinal(s, cfg, st);
  showFeedback(outcome, fb[outcome]);
  const hook = HOOKS[cfg.key];
  if (hook && hook.resolved) hook.resolved(s, n, outcome);
  // the child pops up 3 s after the feedback, or data-hear-delay seconds (developer 2026-11-08: Q5 too)
  hearMoreSchedule(s, parseFloat(s.getAttribute('data-hear-delay') || '3') * 1000);
  // the forward arrow 3 s after the feedback (developer, 2026-10-21); Q2/Q8 wait for "אני רוצה לשמוע!" as before
  if (s.hasAttribute('data-arrow-after-hear')) questionArrow(s, n);
  else setTimeout(function () { if (currentScreen === n) questionArrow(s, n); }, 3000);
}

/* A question with data-arrow-after-hear keeps its forward arrow closed until
   the learner opens the child's explanation ("אני רוצה לשמוע!") once. */
const heardOnce = {};
function questionArrow(s, n) {
  if (s.hasAttribute('data-arrow-after-hear') && !heardOnce[n]) { hideForwardNav(n); return; }
  revealForwardNav(n);
}

/* Mark the final state: right answers green; wrong picks marked wrong. */
function renderFinal(s, cfg, st, justChecked) {
  if (st.outcome !== 'correct' && myAnswerOn(s)) { answerView(s, 'right'); return; }
  if (cfg.kind === 'input') { inputFinal(s, st.outcome === 'correct', justChecked); return; }
  if (cfg.kind === 'draw') { drawFinal(s, st.outcome === 'correct', justChecked); return; }
  if (cfg.kind === 'dnd') {
    if (st.outcome === 'correct') { dndMark(s, true); dndLock(s); return; }
    dndMark(s, false);
    dndLock(s);
    const reveal = function () { dndRevealCorrect(s); dndMark(s, true); };
    const delay = parseFloat(s.getAttribute('data-reveal-delay') || '2') * 1000;
    if (justChecked) setTimeout(reveal, delay); else reveal();
    return;
  }
  s.querySelectorAll('.q-opt').forEach(function (o) {
    const isRight = o.hasAttribute('data-correct'), on = o.classList.contains('selected');
    o.classList.remove('correct', 'wrong');
    if (isRight) o.classList.add('correct');
    else if (on) o.classList.add('wrong');
  });
}

/* ===================================================================
   Drag and drop — chips into slots. Pointer Events, so it works with a
   mouse, a finger and a pen; click-to-pick / click-to-place doubles as the
   keyboard path (Enter on a chip, then Enter on a slot).

   Bank mode (default): chips start in a bank and are dragged into slots.
     <div class="dnd-bank"> <button class="dnd-chip" type="button" data-chip="c1">word</button> … </div>
     … <span class="dnd-slot" data-accept="c1" role="button" tabindex="0" aria-label="…"></span> …
   Swap mode (data-dnd-mode="swap" on the section): the chips start INSIDE
   the slots, shuffled, and the learner swaps them into order. No bank.
   data-accept may list several chip ids (interchangeable answers): "c1 c4".
   Every chip remembers where it started, so a reset puts it back there.
   =================================================================== */
let dndPicked = null;     // chip chosen by click/keyboard, waiting for a slot
let dndDrag = null;       // { chip, ghost, startX, startY, moved }

function dndBank(s) { return s.querySelector('.dnd-bank'); }
function dndSwapMode(s) { return s.getAttribute('data-dnd-mode') === 'swap'; }
/* Slots sharing data-group are interchangeable (e.g. the two factors of a
   multiplication: 10,000 × 30 or 30 × 10,000). Each answer of the group counts
   once: the group's answers are its slots' data-accept ids, used up in order. */
function dndSlotRight(slot) {
  const chip = slot.querySelector('.dnd-chip');
  if (!chip) return false;
  const id = chip.getAttribute('data-chip');
  const g = slot.getAttribute('data-group');
  if (!g) return (slot.getAttribute('data-accept') || '').split(/\s+/).indexOf(id) !== -1;
  const slots = Array.prototype.slice.call(screenOf(slot).querySelectorAll('.dnd-slot[data-group="' + g + '"]'));
  const pool = slots.map(function (sl) { return (sl.getAttribute('data-accept') || '').split(/\s+/)[0]; });
  for (let i = 0; i < slots.length; i++) {
    const c = slots[i].querySelector('.dnd-chip');
    const k = c ? pool.indexOf(c.getAttribute('data-chip')) : -1;
    const right = k !== -1;
    if (right) pool.splice(k, 1);
    if (slots[i] === slot) return right;
  }
  return false;
}
/* In the bank every chip lives in its own fixed place (.dnd-home, sized to the
   chip), so when a chip is dragged out the others don't move (developer,
   2026-10-20); a chip coming back returns to its own place. */
function dndRemember(s) {
  const bank = dndBank(s), wrap = bank && !dndCopyMode(s);
  s.querySelectorAll('.dnd-chip').forEach(function (c, i) {
    if (c._home) return;
    c._homeIndex = i;
    if (wrap && c.parentElement === bank) {
      const home = document.createElement('span');
      home.className = 'dnd-home';
      bank.insertBefore(home, c);
      home.appendChild(c);
    }
    c._home = c.parentElement;
  });
  if (wrap) s.querySelectorAll('.dnd-home').forEach(function (h) {
    const c = h.querySelector('.dnd-chip');
    if (c && !h.style.width && c.offsetWidth) { h.style.width = c.offsetWidth + 'px'; h.style.height = c.offsetHeight + 'px'; }
  });
}
function dndRefresh(s) {
  s.querySelectorAll('.dnd-slot').forEach(function (sl) {
    sl.classList.toggle('filled', !!sl.querySelector('.dnd-chip'));
    if (!qEnsure(s).done && sl._markedChip !== sl.querySelector('.dnd-chip')) sl.classList.remove('correct', 'wrong');
  });
  updateCheckable(s);
}
function dndReset(s) {
  s.querySelectorAll('.dnd-slot .dnd-chip').forEach(function (c) { if (c._isCopy) c.remove(); });
  dndRemember(s);
  const chips = Array.prototype.slice.call(s.querySelectorAll('.dnd-chip'));
  chips.sort(function (a, b) { return a._homeIndex - b._homeIndex; });
  chips.forEach(function (c) { c.classList.remove('picked', 'locked'); c.disabled = false; c._home.appendChild(c); });
  s.querySelectorAll('.dnd-slot').forEach(function (sl) { sl.classList.remove('correct', 'wrong', 'drop-target'); });
  s.classList.remove('dnd-locked');
  qEnsure(s).touched = false;
  dndRefresh(s);
}
/* Put a chip in a slot. If the slot is taken, the chip already there moves to
   where the new one came from (another slot = a swap), or back to the bank. */
function dndCopyMode(s) { return s.getAttribute('data-dnd-mode') === 'copy'; }
function dndPlace(chip, slot) {
  const s = screenOf(chip);
  if (dndCopyMode(s) && !chip.closest('.dnd-slot')) chip = dndCopy(chip);   // the bank keeps its chip
  const from = chip.parentElement;
  const prev = slot.querySelector('.dnd-chip');
  if (prev === chip) return;
  if (prev) {
    if (from && from.classList.contains('dnd-slot')) from.appendChild(prev);
    else if (prev._isCopy) prev.remove();
    else (prev._home || dndBank(s) || from).appendChild(prev);
  }
  slot.appendChild(chip);
  qEnsure(s).touched = true;
  dndRefresh(s);
  announce(uiText('dnd-placed'));
}
function dndReturn(chip) {
  const s = screenOf(chip);
  const bank = dndBank(s);
  if (!bank) return;                       // swap mode: a chip always stays in a slot
  if (chip._isCopy) chip.remove(); else (chip._home || bank).appendChild(chip);
  qEnsure(s).touched = true;
  dndRefresh(s);
}
/* Click (or Enter) on a chip picks it up; then a slot places it, and the
   bank takes it back. Clicking the picked chip again puts it down. */
function dndChipClick(chip) {
  const s = screenOf(chip);
  if (s.classList.contains('dnd-locked')) return;
  if (dndDrag && dndDrag.moved) return;               // the pointerup already handled it
  if (dndPicked === chip) { chip.classList.remove('picked'); dndPicked = null; return; }
  // A chip is waiting and this one sits in a slot: the click means "put it here".
  if (dndPicked && chip.closest('.dnd-slot')) { dndSlotClick(chip.closest('.dnd-slot')); return; }
  if (dndPicked) dndPicked.classList.remove('picked');
  dndPicked = chip;
  chip.classList.add('picked');
  announce(uiText('dnd-picked'));
}
function dndSlotClick(slot) {
  if (!dndPicked) return;
  const chip = dndPicked;
  chip.classList.remove('picked');
  dndPicked = null;
  dndPlace(chip, slot);
  chip.focus({ preventScroll: true });
}
function dndBankClick() {
  if (!dndPicked || !dndPicked.closest('.dnd-slot')) return;
  const chip = dndPicked;
  chip.classList.remove('picked');
  dndPicked = null;
  dndReturn(chip);
  chip.focus({ preventScroll: true });
}

/* Pointer dragging. The stage is scaled, so pointer positions are converted
   to stage pixels before the floating copy is placed. */
document.addEventListener('pointerdown', function (e) {
  const chip = e.target.closest && e.target.closest('.dnd-chip');
  if (!chip || e.button > 0) return;
  const s = screenOf(chip);
  if (!s || s.classList.contains('dnd-locked')) return;
  dndDrag = { chip: chip, ghost: null, startX: e.clientX, startY: e.clientY, moved: false };
  try { chip.setPointerCapture(e.pointerId); } catch (err) {}
});
document.addEventListener('pointermove', function (e) {
  if (!dndDrag) return;
  const d = dndDrag;
  if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
  const app = document.getElementById('app').getBoundingClientRect(), k = appScale();
  if (!d.moved) {
    d.moved = true;
    const r = d.chip.getBoundingClientRect();
    d.ghost = d.chip.cloneNode(true);
    d.ghost.classList.add('dnd-ghost');
    d.ghost.style.width = (r.width / k) + 'px';
    d.ghost.style.height = (r.height / k) + 'px';
    d.offX = (e.clientX - r.left) / k;
    d.offY = (e.clientY - r.top) / k;
    document.getElementById('app').appendChild(d.ghost);
    d.chip.classList.add('dragging');
  }
  d.ghost.style.left = ((e.clientX - app.left) / k - d.offX) + 'px';
  d.ghost.style.top = ((e.clientY - app.top) / k - d.offY) + 'px';
  const slot = dndSlotAt(screenOf(d.chip), e.clientX, e.clientY);
  screenOf(d.chip).querySelectorAll('.dnd-slot').forEach(function (sl) { sl.classList.toggle('drop-target', sl === slot); });
});
function dndEndDrag(e) {
  if (!dndDrag) return;
  const d = dndDrag;
  if (d.moved) {
    const s = screenOf(d.chip);
    const slot = dndSlotAt(s, e.clientX, e.clientY);
    s.querySelectorAll('.dnd-slot').forEach(function (sl) { sl.classList.remove('drop-target'); });
    if (slot) dndPlace(d.chip, slot);
    else if (d.chip.closest('.dnd-slot')) dndReturn(d.chip);   // dragged out of a slot -> back to the bank
    d.ghost.remove();
    d.chip.classList.remove('dragging');
    if (dndPicked) { dndPicked.classList.remove('picked'); dndPicked = null; }
    setTimeout(function () { dndDrag = null; }, 0);         // let the click that follows see .moved
  } else {
    dndDrag = null;
  }
}
document.addEventListener('pointerup', dndEndDrag);
document.addEventListener('pointercancel', dndEndDrag);

/* The slot under the pointer, or the nearest one within 90 stage px (small
   targets are hard to hit, especially with a finger). */
function dndSlotAt(s, x, y) {
  let best = null, bestD = Infinity;
  const k = appScale();
  s.querySelectorAll('.dnd-slot').forEach(function (sl) {
    const r = sl.getBoundingClientRect();
    const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom);
    const dist = Math.hypot(dx, dy) / k;
    if (dist < bestD) { bestD = dist; best = sl; }
  });
  return bestD <= 90 ? best : null;
}
function dndMark(s, allRight) {
  s.querySelectorAll('.dnd-slot').forEach(function (sl) {
    sl.classList.remove('correct', 'wrong');
    sl.classList.add(allRight || dndSlotRight(sl) ? 'correct' : 'wrong');
    const c = sl.querySelector('.dnd-chip');
    sl._markedChip = c;
  });
}
function dndLock(s) {
  s.classList.add('dnd-locked');
  s.querySelectorAll('.dnd-chip').forEach(function (c) { c.classList.add('locked'); c.classList.remove('picked'); });
}
/* Put the right chip in every slot. A slot may accept several chips; each
   chip is used once. */
function dndRevealCorrect(s) {
  if (dndCopyMode(s)) {
    s.querySelectorAll('.dnd-slot').forEach(function (sl) {
      Array.prototype.forEach.call(sl.querySelectorAll('.dnd-chip'), function (c) { c.remove(); });
      const id = (sl.getAttribute('data-accept') || '').split(/\s+/)[0];
      const src = dndBank(s).querySelector('.dnd-chip[data-chip="' + id + '"]');
      if (src) { const c = dndCopy(src); c.classList.add('locked'); sl.appendChild(c); }
      sl.classList.add('filled');
    });
    return;
  }
  const pool = document.createDocumentFragment();
  s.querySelectorAll('.dnd-chip').forEach(function (c) { pool.appendChild(c); });
  s.querySelectorAll('.dnd-slot').forEach(function (sl) {
    const ok = (sl.getAttribute('data-accept') || '').split(/\s+/);
    for (let i = 0; i < ok.length; i++) {
      const c = pool.querySelector('.dnd-chip[data-chip="' + ok[i] + '"]');
      if (c) { sl.appendChild(c); break; }
    }
    sl.classList.add('filled');
  });
  const bank = dndBank(s);
  Array.prototype.slice.call(pool.children).forEach(function (c) { (c._home || bank).appendChild(c); });   // spare chips go back to their places
}
/* Put the given chip ids back in the slots (the learner's answer, for "התשובה שלי"). */
function dndArrange(s, ids) {
  const bank = dndBank(s), slots = s.querySelectorAll('.dnd-slot');
  if (dndCopyMode(s)) {
    slots.forEach(function (sl, i) {
      Array.prototype.forEach.call(sl.querySelectorAll('.dnd-chip'), function (c) { c.remove(); });
      const src = ids[i] && bank.querySelector('.dnd-chip[data-chip="' + ids[i] + '"]');
      if (src) { const c = dndCopy(src); c.classList.add('locked'); sl.appendChild(c); }
    });
  } else {
    s.querySelectorAll('.dnd-chip').forEach(function (c) { (c._home || bank).appendChild(c); });
    slots.forEach(function (sl, i) {
      const c = ids[i] && bank.querySelector('.dnd-chip[data-chip="' + ids[i] + '"]');
      if (c) sl.appendChild(c);
    });
  }
  slots.forEach(function (sl) { sl.classList.toggle('filled', !!sl.querySelector('.dnd-chip')); });
}

/* ===================================================================
   Typed numbers (data-kind="input")
     <input class="num-input" type="text" inputmode="numeric" data-answer="7050" aria-label="…">
   "7,050", "7050" and "7 050" all count. Inputs sharing data-group are
   interchangeable (4,700 + 2,350 or 2,350 + 4,700).
   =================================================================== */
function numNorm(v) { return String(v).replace(/[\s,‏‎]/g, ''); }
function numFormat(v) { return Number(v).toLocaleString('en-US'); }
function inputEls(s) { return Array.prototype.slice.call(s.querySelectorAll('.num-input')); }
function inputValues(s) { return inputEls(s).map(function (i) { return numNorm(i.value); }); }
/* One true/false per input. A group is right per input as long as its value
   is one of the group's answers not already used by another input. */
function inputMarks(s) {
  const els = inputEls(s), left = {};
  els.forEach(function (i) {
    const g = i.getAttribute('data-group');
    if (g) (left[g] = left[g] || []).push(numNorm(i.getAttribute('data-answer')));
  });
  return els.map(function (i) {
    const v = numNorm(i.value), g = i.getAttribute('data-group');
    if (!g) return v === numNorm(i.getAttribute('data-answer'));
    const k = left[g].indexOf(v);
    if (k === -1) return false;
    left[g].splice(k, 1);
    return true;
  });
}
function inputReset(s) {
  inputEls(s).forEach(function (i) { i.value = ''; i.disabled = false; i.classList.remove('correct', 'wrong'); });
}
function inputFinal(s, allRight, justChecked) {
  const els = inputEls(s), marks = inputMarks(s);
  els.forEach(function (i, k) {
    i.disabled = true;
    i.classList.toggle('correct', allRight || marks[k]);
    i.classList.toggle('wrong', !allRight && !marks[k]);
  });
  if (allRight) return;
  const reveal = function () {
    els.forEach(function (i) { i.value = numFormat(numNorm(i.getAttribute('data-answer'))); i.classList.remove('wrong'); i.classList.add('correct'); });
  };
  if (justChecked) setTimeout(reveal, 2000); else reveal();
}
document.addEventListener('input', function (e) {
  if (!e.target.classList || !e.target.classList.contains('num-input')) return;
  e.target.classList.remove('correct', 'wrong');
  updateCheckable(screenOf(e.target));
});
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter' || !e.target.classList || !e.target.classList.contains('num-input')) return;
  const b = checkBtn(screenOf(e.target));
  if (b && !b.disabled) checkAnswer(screenOf(e.target));
});

/* ===================================================================
   Draw a bar (data-kind="draw")
     <div class="draw-chart" data-answer="25500" data-max="30000" data-step="500">
       … <div class="draw-track" role="slider" tabindex="0" aria-label="…"><div class="draw-bar"></div></div>
   Drag (mouse, finger) along the track, or use the arrow keys; the length
   snaps to data-step. Right to left: the bar grows from the axis at the right.
   =================================================================== */
function drawChart(s) { return s.querySelector('.draw-chart'); }
function drawAnswer(s) { return parseFloat(drawChart(s).getAttribute('data-answer')); }
function drawValue(s) { const c = drawChart(s); return c ? (c._value || 0) : 0; }
function drawSet(s, v) {
  const c = drawChart(s), max = parseFloat(c.getAttribute('data-max')), step = parseFloat(c.getAttribute('data-step') || '1');
  v = Math.max(0, Math.min(max, Math.round(v / step) * step));
  c._value = v;
  const track = c.querySelector('.draw-track');
  c.querySelector('.draw-bar').style.width = (v / max * 100) + '%';
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', String(max));
  track.setAttribute('aria-valuenow', String(v));
  track.setAttribute('aria-valuetext', numFormat(v));
  const val = c.querySelector('.draw-value');
  if (val) val.textContent = v ? numFormat(v) : '';
  const hval = c.querySelector('.draw-hval');   // the number beside the arrow handle (developer, 2026-11-08)
  if (hval) hval.textContent = v ? numFormat(v) : '';
  c.classList.toggle('has-value', v > 0);
  updateCheckable(s);
}
function drawReset(s) {
  const c = drawChart(s);
  c.classList.remove('correct', 'wrong', 'locked');
  drawSet(s, 0);
}
function drawFinal(s, allRight, justChecked) {
  const c = drawChart(s);
  c.classList.add('locked');
  c.classList.toggle('correct', allRight);
  c.classList.toggle('wrong', !allRight);
  if (allRight) return;
  const reveal = function () { c._value = drawAnswer(s); drawSet(s, c._value); c.classList.remove('wrong'); c.classList.add('correct'); setCheckable(s, false); };
  if (justChecked) setTimeout(reveal, 2000); else reveal();
}
let drawDrag = null;
function drawFromPointer(track, e) {
  const r = track.getBoundingClientRect();
  const s = screenOf(track), c = drawChart(s);
  const ltr = getComputedStyle(track).direction === 'ltr';
  const frac = ltr ? (e.clientX - r.left) / r.width : (r.right - e.clientX) / r.width;
  drawSet(s, frac * parseFloat(c.getAttribute('data-max')));
}
document.addEventListener('pointerdown', function (e) {
  const track = e.target.closest && e.target.closest('.draw-track');
  if (!track || e.button > 0) return;
  const s = screenOf(track);
  if (drawChart(s).classList.contains('locked') || qEnsure(s).done) return;
  drawDrag = track;
  try { track.setPointerCapture(e.pointerId); } catch (err) {}
  drawFromPointer(track, e);
  e.preventDefault();
});
document.addEventListener('pointermove', function (e) { if (drawDrag) drawFromPointer(drawDrag, e); });
document.addEventListener('pointerup', function () { drawDrag = null; });
document.addEventListener('keydown', function (e) {
  const track = e.target.closest && e.target.closest('.draw-track');
  if (!track) return;
  const s = screenOf(track), c = drawChart(s);
  if (c.classList.contains('locked') || qEnsure(s).done) return;
  const step = parseFloat(c.getAttribute('data-step') || '1');
  // the arrow that points the way the bar grows makes it longer
  const grow = getComputedStyle(track).direction === 'ltr' ? 'ArrowRight' : 'ArrowLeft';
  const shrink = grow === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight';
  if (e.key === grow || e.key === 'ArrowUp') { drawSet(s, drawValue(s) + step); e.preventDefault(); }
  if (e.key === shrink || e.key === 'ArrowDown') { drawSet(s, drawValue(s) - step); e.preventDefault(); }
  if (e.key === 'Home') { drawSet(s, 0); e.preventDefault(); }
});

/* ===================================================================
   Poll — a general question with no score (e.g. "יצא לכם פעם למחזר בקבוקים?").
     <div class="poll"> <p class="poll-q">…</p>
       <div class="poll-opts"> <button class="poll-opt"><span class="poll-front">…</span><span class="poll-back">reply + emoji</span></button> … </div>
   The chosen option flips to its reply; the choice is final, and it opens the
   screen's forward arrow.
   =================================================================== */
function pollChoose(btn) {
  const s = screenOf(btn), n = screenNum(s), poll = btn.closest('.poll');
  if (poll.classList.contains('answered')) return;
  poll.classList.add('answered');
  btn.classList.add('flipped');
  btn.setAttribute('aria-pressed', 'true');
  poll.querySelectorAll('.poll-opt').forEach(function (b) { b.setAttribute('aria-disabled', 'true'); if (b !== btn) b.classList.add('not-chosen'); });
  const back = btn.querySelector('.poll-back');
  announce(back.textContent.trim());
  window.lomdaState.DONE[n] = true;
  revealForwardNav(n);
}

/* Bar charts: <figure class="bar-chart" data-max="12000" data-ticks="2000">
   with .bar[data-value]; widths and the axis numbers come from the data. */
function initBarCharts() {
  document.querySelectorAll('.bar-chart').forEach(function (c) {
    const max = parseFloat(c.getAttribute('data-max')), step = parseFloat(c.getAttribute('data-ticks'));
    c.querySelectorAll('.bar[data-value]').forEach(function (b) {
      b.style.width = (parseFloat(b.getAttribute('data-value')) / max * 100) + '%';
    });
    // a mark every data-ticks; a number on every mark, or only every data-label-every
    // when the marks are too close for numbers (Q6b: 30 marks)
    const every = parseFloat(c.getAttribute('data-label-every') || step);
    const axis = c.querySelector('.bar-axis');
    if (axis && !axis.children.length) {
      for (let v = 0; v <= max; v += step) {
        const tk = document.createElement('span');
        tk.className = 'tick' + (v % every === 0 ? ' labelled' : '');
        if (v % every === 0) tk.textContent = numFormat(v);
        tk.style.left = (v / max * 100) + '%';
        axis.appendChild(tk);
      }
    }
  });
}
initBarCharts();

/* Question float-in (lomda-wide, developer 2026-10-17): the card first, then
   blocks — the question number, the whole question text together, then a
   graph or table if the question has one, then the answers together. Each part gets its block as --i; styles.css turns it into a delay. */
function initQuestionFloat() {
  document.querySelectorAll('.screen[data-type="question"] .q-card').forEach(function (card) {
    Array.prototype.forEach.call(card.children, function (el) {
      let block = card.querySelector(':scope > .data-table, :scope > .bar-chart') ? 3 : 2;   // answers (after a graph/table)
      if (el.classList.contains('q-title')) block = 0;                   // question number
      else if (el.matches('p.q-body, p.q-instruction, ul.q-list')) block = 1;   // question text
      else if (el.matches('.data-table, .bar-chart, .info-btn, .info-pop')) block = 2;   // graph or table (with its 💡), before the answers
      el.style.setProperty('--i', block);
    });
  });
}
initQuestionFloat();

/* Copy mode (data-dnd-mode="copy"): a bank chip can be used again and again;
   what goes into a slot is a copy, and a copy taken out of its slot is gone. */
function dndCopy(chip) {
  const c = chip.cloneNode(true);
  c._isCopy = true;
  c.classList.remove('picked', 'dragging');
  c.removeAttribute('data-order');
  return c;
}

/* ===================================================================
   Small popups: help ("עזרה"), info icons (💡)
     <button class="pop-toggle" type="button" aria-controls="q1-help" aria-expanded="false">עזרה</button>
     <div class="pop" id="q1-help" hidden> … <button class="pop-close" …>✕</button></div>
   One open at a time; a click outside or Escape closes it.
   =================================================================== */
function closePops(except) {
  document.querySelectorAll('.pop-toggle[aria-expanded="true"]').forEach(function (b) {
    if (b === except) return;
    b.setAttribute('aria-expanded', 'false');
    const p = document.getElementById(b.getAttribute('aria-controls'));
    if (p) p.hidden = true;
  });
}
function togglePop(btn) {
  const p = document.getElementById(btn.getAttribute('aria-controls'));
  if (!p) return;
  if (btn.classList.contains('help-btn')) btn.classList.remove('blink');
  const open = btn.getAttribute('aria-expanded') !== 'true';
  closePops(btn);
  btn.setAttribute('aria-expanded', String(open));
  p.hidden = !open;
}

/* "עזרה" blinks to point the learner at it (lomda-wide rule, developer 2026-10-14):
   after the first wrong try of a two-try question, or from entry on a one-try
   question. It stops once the help is opened or the question is resolved. */
function helpBlink(s, on) {
  const b = s.querySelector('.help-btn');
  if (b) b.classList.toggle('blink', !!on);
}

/* ===================================================================
   "אני רוצה לשמוע!" — a few seconds after the final feedback a child pops up
   with a bubble. His button swaps the feedback for his explanation; "חזרה
   למשוב" swaps back.
     <div class="hear-more" hidden> kid · .hear-bubble (.hear-btn) · .hear-panel[hidden] (.hear-back) </div>
   =================================================================== */
const hearTimers = {};
function hearMoreSchedule(s, ms) {
  const box = s.querySelector('.hear-more');
  if (!box) return;
  const n = screenNum(s);
  clearTimeout(hearTimers[n]);
  hearTimers[n] = setTimeout(function () { if (screenNum(s) === currentScreen) box.hidden = false; }, ms);
}
function hearMoreHide(s) {
  const box = s.querySelector('.hear-more');
  if (!box) return;
  clearTimeout(hearTimers[screenNum(s)]);
  box.hidden = true;
  hearBack(s, true);
}
function hearOpen(s) {
  const panel = s.querySelector('.hear-panel');
  if (!panel) return;
  const n = screenNum(s);
  const voice = s.querySelector('.hear-audio');
  if (!voice || !voice.getAttribute('src')) { hearDone(s, n); }
  else if (!voice._wired) { voice._wired = true; voice.addEventListener('ended', function () { hearDone(s, n); }); }
  document.getElementById('feedback-popup').classList.remove('show');
  s.querySelector('.hear-more').classList.add('open');
  s.querySelector('.hear-bubble').hidden = true;
  panel.hidden = false;
  const audio = s.querySelector('.hear-audio');
  if (audio && audio.getAttribute('src')) {
    try { audio.currentTime = 0; } catch (e) {}
    const p = audio.play();
    if (p && p.catch) p.catch(function () { hearDone(s, n); });   // sound blocked: don't trap the learner
  }
  const back = panel.querySelector('.hear-back');
  if (back) back.focus({ preventScroll: true });
}
/* "אני רוצה לשמוע" counts as heard when the child's voice ends or "חזרה למשוב" is pressed */
function hearDone(s, n) {
  if (heardOnce[n]) return;
  heardOnce[n] = true;
  questionArrow(s, n);
}
function hearBack(s, quiet) {
  const panel = s.querySelector('.hear-panel');
  if (!panel) return;
  if (!quiet && !panel.hidden) hearDone(s, screenNum(s));
  const audio = s.querySelector('.hear-audio');
  if (audio) { try { audio.pause(); } catch (e) {} }
  panel.hidden = true;
  s.querySelector('.hear-more').classList.remove('open');
  s.querySelector('.hear-bubble').hidden = false;
  if (quiet) return;
  const st = qEnsure(s), cfg = qConfig(s);
  if (st.done) showFeedback(st.outcome, cfg.feedback[st.outcome]);
  const btn = s.querySelector('.hear-btn');
  if (btn) btn.focus({ preventScroll: true });
}

/* ---------------- Scoring + completion ---------------- */
/* The grade is out of 100 even when the storyboard's weights do not add up
   to 100 (qa_check.py warns about that). */
function totalWeight() {
  let t = 0;
  document.querySelectorAll('.screen[data-type="question"]').forEach(function (s) {
    t += parseFloat(s.getAttribute('data-weight') || '0');
  });
  return t;
}
function recordScore(key, points) {
  window.lomdaState.questionScores[key] = points;
  let earned = 0;
  Object.keys(window.lomdaState.questionScores).forEach(function (k) { earned += window.lomdaState.questionScores[k]; });
  const total = totalWeight();
  window.lomdaState.score = total ? earned * 100 / total : 0;
}
function computeFinalGrade() { return Math.round(window.lomdaState.score); }

/* ===================================================================
   The end of the lomda (the house ending, as in the approved lomdot): a score pop-up, then a dark screen
   sending the learner back to the Moodle (the quiz page that follows the lomda). Both are in index.html
   (#final-score, #final-return) so their text is translated with everything else.
     entering the finish screen -> showFinalScore(): sends the grade (LOMDA_COMPLETE), opens the score pop-up
     the pop-up's X (or Escape) -> showReturnScreen(): the dark screen with the instruction
   After the pop-up nothing else works: no arrows, no Tab out. The learner leaves through the Moodle.
   =================================================================== */
/* Leaving the end: a host that jumps to another screen (index_dev.html, the QA system's screen list) takes the learner
   out of the ending, so the pop-up, the dark screen and the key lock go. A learner cannot do this: the pop-up covers the
   stage and the keys are locked, so for a learner the ending stays final. Called before the new screen's entry logic. */
function leaveFinalStage() {
  if (!finalStage) return;
  finalStage = false;
  ['final-score', 'final-return'].forEach(function (id) { const el = document.getElementById(id); if (el) el.hidden = true; });
}
function sendComplete() {
  try { window.parent.postMessage({ type: 'LOMDA_COMPLETE', score: computeFinalGrade() }, '*'); } catch (e) {}
}
function enterFinish(s, n) {
  window.lomdaState.DONE[n] = true;
  showFinalScore();
}
function finishLomda() { showFinalScore(); }
function showFinalScore() {
  const box = document.getElementById('final-score');
  if (!box) { sendComplete(); return; }
  if (finalStage) return;
  sendComplete();
  closeAllOverlays();
  pauseAllMedia();
  finalStage = true;
  box.querySelectorAll('[data-final-grade]').forEach(function (el) { el.textContent = computeFinalGrade(); });
  box.hidden = false;
  const x = box.querySelector('.final-score-close');
  (x || box).focus({ preventScroll: true });
}
function showReturnScreen() {
  const ret = document.getElementById('final-return');
  if (!ret) return;
  finalStage = true;
  closeAllOverlays();
  pauseAllMedia();
  document.dispatchEvent(new CustomEvent('lomda:end'));   // a lomda with its own sound (Web Audio) listens and stops it
  const box = document.getElementById('final-score');
  if (box) box.hidden = true;
  ret.hidden = false;
  const cb = ret.querySelector('.return-close');
  (cb || ret).focus({ preventScroll: true });
}
function closeLomdaWindow() {
  try { window.close(); } catch (e) {}
  try { if (window.top !== window) window.top.close(); } catch (e) {}
  setTimeout(function () {
    const hint = document.querySelector('#final-return .return-hint');
    if (hint) hint.hidden = false;
  }, 400);
}
document.addEventListener('click', function (e) {
  if (!e.target.closest) return;
  if (e.target.closest('#final-score .final-score-close')) showReturnScreen();
  else if (e.target.closest('#final-return .return-close')) closeLomdaWindow();
});
/* Capture phase: once the score is shown, only the X (and Escape) do anything. */
document.addEventListener('keydown', function (e) {
  if (!finalStage) return;
  const ret = document.getElementById('final-return');
  if (e.key === 'Escape') { if (ret && ret.hidden) showReturnScreen(); e.preventDefault(); e.stopImmediatePropagation(); return; }
  if (e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
    if (e.target && e.target.closest && e.target.closest('#final-score .final-score-close') && (e.key === 'Enter' || e.key === ' ')) return;   // the X by keyboard
    e.preventDefault(); e.stopImmediatePropagation();
  }
}, true);

/* ---------------- Question stepper (progress pills) ----------------
   Built from the data-step numbers on question screens; shown only there. */
function buildStepper() {
  const st = document.getElementById('q-stepper');
  if (!st) return;
  let max = 0;
  document.querySelectorAll('.screen[data-step]').forEach(function (s) {
    max = Math.max(max, parseInt(s.getAttribute('data-step'), 10) || 0);
  });
  st.innerHTML = '';
  for (let i = 1; i <= max; i++) {
    const pill = document.createElement('span');
    pill.className = 'q-step';
    pill.setAttribute('data-step', i);
    pill.textContent = i;
    st.appendChild(pill);
  }
}
function updateStepper(s) {
  const st = document.getElementById('q-stepper');
  if (!st) return;
  const step = parseInt(s.getAttribute('data-step') || '0', 10);
  st.classList.toggle('visible', step > 0);
  st.querySelectorAll('.q-step').forEach(function (p) {
    p.classList.toggle('active', parseInt(p.getAttribute('data-step'), 10) === step);
  });
}

/* ===================================================================
   Applets (iframes). The arrow appears N seconds after the learner starts
   the applet: the applet posts {type:'APPLET_STARTED'} to its parent.
     data-arrow-after="15"        seconds (default 15)
     data-arrow-trigger="enter"   start counting on entry instead (an
                                  applet that cannot post the message)
   =================================================================== */
const appletRevealed = {};
const appletTimer = {};
function enterApplet(s, n) {
  if (appletRevealed[n]) { revealForwardNav(n); return; }
  hideForwardNav(n);
  // a placeholder (no applet yet) cannot say it started, so count from entry
  if (s.getAttribute('data-arrow-trigger') === 'enter' || s.querySelector('.applet-frame[data-pending-asset]')) startAppletTimer(s);
}
function startAppletTimer(s) {
  const n = screenNum(s);
  if (appletTimer[n] || appletRevealed[n]) return;
  const sec = parseFloat(s.getAttribute('data-arrow-after') || '15');
  appletTimer[n] = setTimeout(function () {
    appletRevealed[n] = true;
    window.lomdaState.DONE[n] = true;
    if (currentScreen === n) revealForwardNav(n);
  }, sec * 1000);
}
function onAppletStarted(source) {
  document.querySelectorAll('.screen[data-type="applet"] iframe').forEach(function (f) {
    if (f.contentWindow === source) startAppletTimer(screenOf(f));
  });
}

/* Reopen popup: a button on a later screen shows content from an earlier
   one again (an applet, a diagram, a reminder) without copying it:
     <button class="reopen-btn" data-reopen="soil-sim">…</button>
   clones the element marked [data-reopen-content] inside the screen whose
   data-sid is "soil-sim". */
let reopenHidFeedback = false;
function toggleReopen(btn) {
  const popup = document.getElementById('reopen-popup');
  const body = document.getElementById('reopen-popup-body');
  const fb = document.getElementById('feedback-popup');
  const wasOpen = popup.classList.contains('show') && btn.classList.contains('is-open');
  document.querySelectorAll('.reopen-btn.is-open').forEach(function (b) { b.classList.remove('is-open'); });
  popup.classList.remove('show');
  body.innerHTML = '';
  if (wasOpen) {
    returnOverlayFocus();
    if (reopenHidFeedback) { fb.classList.add('show'); reopenHidFeedback = false; }
    return;
  }
  const src = document.querySelector('.screen[data-sid="' + btn.getAttribute('data-reopen') + '"] [data-reopen-content]');
  if (!src) return;
  const copy = src.cloneNode(true);
  copy.removeAttribute('data-reopen-content');
  copy.querySelectorAll('[id]').forEach(function (el) { el.removeAttribute('id'); });
  body.appendChild(copy);
  reopenHidFeedback = fb.classList.contains('show');
  if (reopenHidFeedback) fb.classList.remove('show');
  popup.classList.add('show');
  btn.classList.add('is-open');
  openOverlayFocus(popup);
}

/* ---------------- Image zoom ---------------- */
function openZoom(btn) {
  const modal = document.getElementById('img-zoom-modal');
  const body = document.getElementById('img-zoom-body');
  body.innerHTML = '';
  const img = document.createElement('img');
  img.src = btn.getAttribute('data-zoom-src');
  img.alt = btn.getAttribute('data-zoom-alt') || '';
  body.appendChild(img);
  modal.classList.add('show');
  openOverlayFocus(modal.querySelector('[data-zoom-close]'));
}
function closeZoom() {
  document.getElementById('img-zoom-modal').classList.remove('show');
  returnOverlayFocus();
}

/* ---------------- Glossary terms ----------------
   <p>… <button class="term" type="button" aria-describedby="tip-x">term</button> …</p>
   <span class="term-tip" role="tooltip" id="tip-x">definition</span>     (AFTER the paragraph)
   Hover or keyboard focus shows the tip; a tap toggles it on touch screens.
   The tip sits outside the sentence so screen readers and the translation
   export read the sentence whole. */
function termTip(term) { return document.getElementById(term.getAttribute('aria-describedby') || ''); }
function showTerm(term, on) {
  const tip = termTip(term);
  if (tip) tip.classList.toggle('show', on);
  term.classList.toggle('is-open', on);
}
/* A tap fires mouseover AND click: with a finger only the click counts (it
   toggles); with a mouse, hovering shows the tip and a click changes nothing. */
let termTouch = false;
document.addEventListener('pointerdown', function (e) {
  termTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
  if (!(e.target.closest && e.target.closest('.term'))) {
    document.querySelectorAll('.term.is-open').forEach(function (t) { showTerm(t, false); });   // a tap elsewhere closes it
  }
}, true);
function toggleTerm(term) {
  if (!termTouch) return;
  const open = !term.classList.contains('is-open');
  document.querySelectorAll('.term.is-open').forEach(function (t) { showTerm(t, false); });
  showTerm(term, open);
}
document.addEventListener('mouseover', function (e) { const t = !termTouch && e.target.closest && e.target.closest('.term'); if (t) showTerm(t, true); });
document.addEventListener('mouseout', function (e) { const t = !termTouch && e.target.closest && e.target.closest('.term'); if (t) showTerm(t, false); });
document.addEventListener('focusin', function (e) { const t = !termTouch && e.target.closest && e.target.closest('.term'); if (t) showTerm(t, true); });
document.addEventListener('focusout', function (e) { const t = e.target.closest && e.target.closest('.term'); if (t) showTerm(t, false); });   // tapping elsewhere closes it too

/* ---------------- Start ---------------- */
document.addEventListener('DOMContentLoaded', function () {
  buildStepper();
  document.querySelectorAll('.screen[data-kind="dnd"]').forEach(dndRemember);
  document.querySelectorAll('.video-wrap').forEach(initVideo);
  document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
  // index.html#7 opens screen 7 directly (handy while building).
  const fromHash = parseInt((location.hash || '').replace('#', ''), 10);
  const first = fromHash >= 1 && fromHash <= TOTAL_SCREENS ? fromHash : 1;
  const s = screenEl(first);
  if (s) s.classList.add('active');
  currentScreen = first;
  resetScreenState(first);
  notifyScreenChanged(first);
  announceReady();
  schedulePreload(first + 1);
});
