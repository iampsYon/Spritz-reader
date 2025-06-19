/* =========================================================
   SPEED-SPRITZ — main.js  (v10: full extractor included)
   ========================================================= */

/* ---------- GLOBAL STATE ---------- */
let chapters = [];          // [{ title, words }]
let chIdx    = 0;
let words    = [];
let wIdx     = 0;
let timerId  = null;
let playing  = false;
let lastPause = 0;          // ms

/* ---------- DOM SHORTCUTS ---------- */
const $dsp = $(".spritz-word");
const $bar = $("#progress_bar");
const $btn = $("#spritz_toggle");
const $sel = $("#chapter_select");

const ALNUM = /[A-Za-z0-9]/;
const END_PUNCT = /[.!?…]$/;
const coll  = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/* ---------- TOKENISE & PIVOT ---------- */
function splitWords(txt) { return txt.match(/\S+/g)?.filter(t => ALNUM.test(t)) || []; }

function pivotIndex(word) {
  let p = Math.floor(word.length * 0.4);
  if (!ALNUM.test(word[p])) {
    let l = p - 1, r = p + 1;
    while (l >= 0 || r < word.length) {
      if (l >= 0 && ALNUM.test(word[l])) { p = l; break; }
      if (r < word.length && ALNUM.test(word[r])) { p = r; break; }
      l--; r++;
    }
  }
  return p;
}
function render(i) {
  const w = words[i] ?? "";
  const p = pivotIndex(w);
  $dsp.html(
    `<div>${w.slice(0, p)}</div>` +
    `<div>${w[p] ?? ""}</div>` +
    `<div>${w.slice(p + 1)}</div>`
  );
}
function updateBar() { $bar.attr({ max: words.length - 1, value: wIdx }); }

/* ---------- SPEED-RAMP ---------- */
const RAMP_FULL  = 5;    // words on Start
const RAMP_SHORT = 3;    // words on Resume / speed tweak
const WPM_FLOOR  = 150;

function delayFor(step, total, target) {
  const start = 60_000 / WPM_FLOOR;
  const end   = 60_000 / target;
  return start + (end - start) * (step / total);
}

/* ---------- SENTENCE REWIND ---------- */
function sentenceStart(idx) {
  const abbrev = w => w.length <= 3 && /^[A-Z]/.test(w);
  for (let i = idx; i >= 1; i--) {
    const prev = words[i - 1];
    if (END_PUNCT.test(prev) && !abbrev(prev.replace(END_PUNCT, ""))) return i;
  }
  return 0;
}

/* ---------- PLAY WITH RAMP ---------- */
function play(rampLen) {
  clearTimeout(timerId);
  if (!words.length) { $dsp.text("No words!"); return; }

  const target = +$("#spritz_wpm").val() || 300;
  let step = 0;
  let delay = delayFor(0, rampLen, target);

  const tick = () => {
    render(wIdx); updateBar();
    if (++wIdx >= words.length) { playing = false; $btn.text("Start"); return; }
    if (step < rampLen) delay = delayFor(++step, rampLen, target);
    timerId = setTimeout(tick, delay);
  };

  playing = true; $btn.text("Pause");
  timerId = setTimeout(tick, delay);
}

/* ---------- UI EVENTS ---------- */
$btn.on("click", () => {
  if (playing) {
    clearTimeout(timerId); playing = false; $btn.text("Resume");
    lastPause = Date.now();
  } else {
    if (Date.now() - lastPause > 3000) wIdx = sentenceStart(wIdx);
    play(wIdx === 0 ? RAMP_FULL : RAMP_SHORT);
  }
});
$("#spritz_wpm").on("input", () => { if (playing) play(RAMP_SHORT); });
$bar.on("input", function () { wIdx = +this.value; render(wIdx); if (playing) play(RAMP_SHORT); });
$("#spritz_change").on("click", () => {
  chapters = [{ title: "Manual Text", words: splitWords($(".demo-text").val()) }];
  fillSelect(); loadChapter(0);
});
$sel.on("change", e => loadChapter(+e.target.value));

/* ---------- CHAPTER HELPERS ---------- */
function fillSelect() {
  $sel.empty();
  chapters.forEach((c, i) => $sel.append(`<option value="${i}">${c.title}</option>`));
}
function loadChapter(i) {
  clearTimeout(timerId);
  chIdx = i; words = chapters[i].words; wIdx = 0;
  playing = false; $btn.text("Start");
  render(0); updateBar();
}

/* =========================================================
   EPUB IMPORT
   ========================================================= */
$("#epub_file").on("change", async e => {
  const file = e.target.files[0]; if (!file) return;
  $btn.prop("disabled", true).text("Loading…");

  try {
    const buf = await file.arrayBuffer();
    chapters  = await extractChapters(buf);

    if (!Array.isArray(chapters) || !chapters.length) {
      throw new Error("Could not extract chapter text.");
    }

    chapters.sort((a, b) => coll.compare(a.title, b.title));
    fillSelect(); loadChapter(0);
  } catch (err) {
    alert("Failed to load EPUB:\n" + err.message);
  } finally {
    $btn.prop("disabled", false).text("Start");
  }
});

/* ---------- EXTRACT CHAPTERS FUNCTION ---------- */
async function extractChapters(buffer) {
  /* 1️⃣ Try epub.js spine */
  try {
    const book = ePub(buffer); await book.ready;           // epub.js global
    const spine = Array.isArray(book.spine?.items)
      ? book.spine.items
      : Array.isArray(book.spine?.spineItems)
        ? book.spine.spineItems : [];

    const out = [];
    for (const item of spine) {
      let html = "";
      try {
        if (item.load) {
          html = await item.load(book.load.bind(book)); item.unload?.();
        } else if (item.render) {
          const r = await item.render(); html = r.contents || "";
        } else if (book.resources?.get) {
          html = await book.resources.get(item.href).then(r => r.text());
        } else if (book.archive?.createUrl) {
          const url = await book.archive.createUrl(item.href);
          html = await fetch(url).then(r => r.text());
        }
      } catch {}
      if (!html.trim()) continue;
      const txt = new DOMParser().parseFromString(html, "text/html").body.textContent;
      if (txt.trim()) out.push({ title: item.id || `Chapter ${out.length + 1}`, words: splitWords(txt) });
    }
    if (out.length) return out;
  } catch {}

  /* 2️⃣ Fallback: JSZip raw scan */
  try {
    const zip   = await JSZip.loadAsync(buffer);           // JSZip global
    const files = Object.keys(zip.files).filter(n => /\.(x?html?|txt)$/i.test(n));
    const out   = [];

    for (const name of files) {
      try {
        const html = await zip.files[name].async("string");
        const txt  = new DOMParser().parseFromString(html, "text/html").body.textContent;
        if (txt.trim()) out.push({ title: name.split("/").pop(), words: splitWords(txt) });
      } catch {}
    }
    return out;
  } catch { return []; }
}

/* ---------- INITIALISE ---------- */
$(function () {
  chapters = [{ title: "Manual Text", words: splitWords($(".demo-text").val()) }];
  fillSelect(); loadChapter(0);
});