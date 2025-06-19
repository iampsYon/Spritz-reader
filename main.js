/* =========================================================
   SPEED-SPRITZ — main.js  (v8: speed ramp + resume rewind)
   ========================================================= */

/* ---------- GLOBAL STATE ---------- */
let chapters = [];           // [{ title, words }]
let chIdx    = 0;            // current chapter
let words    = [];           // alias to chapters[chIdx].words
let wIdx     = 0;            // pointer inside words
let timerId  = null;
let playing  = false;
let lastPauseTime = 0;       // for resume-rewind threshold

const $dsp  = $(".spritz-word");
const $bar  = $("#progress_bar");
const $btn  = $("#spritz_toggle");
const $sel  = $("#chapter_select");
const ALNUM = /[A-Za-z0-9]/;
const coll  = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/* ---------- TOKENISERS & PIVOT ---------- */
function splitWords(text) {
  return text.match(/\S+/g)?.filter(t => ALNUM.test(t)) || [];
}
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
function refreshBar() { $bar.attr({ max: words.length - 1, value: wIdx }); }

/* ---------- SPEED-RAMP CONTROL ---------- */
const RAMP_FULL  = 5;   // words
const RAMP_SHORT = 3;   // words
const FLOOR_WPM  = 150;

function delayForStep(step, rampLen, targetWpm) {
  const startDelay = 60_000 / FLOOR_WPM;
  const endDelay   = 60_000 / targetWpm;
  const t = step / rampLen;                        // 0 → 1
  return startDelay + (endDelay - startDelay) * t; // linear lerp
}

/* ---------- SENTENCE-REWIND ---------- */
function findSentenceStart(idx) {
  const isAbbrev = w =>
    w.length <= 3 && /^[A-Z]/.test(w);             // crude heuristic

  for (let i = idx; i >= 1; i--) {
    const prev = words[i - 1];
    if (/[.!?…]$/.test(prev) && !isAbbrev(prev.replace(/[.!?…]+$/, ""))) {
      return i;                                    // word after punctuation
    }
  }
  return 0;
}

/* ---------- PLAYBACK LOOP ---------- */
function playWithRamp(rampLen) {
  clearInterval(timerId);
  if (!words.length) { $dsp.text("No words!"); return; }

  const targetWpm = +$("#spritz_wpm").val() || 300;
  let step = 0;                        // ramp progress word-by-word
  let delay = delayForStep(0, rampLen, targetWpm);

  function tick() {
    render(wIdx); refreshBar();

    if (++wIdx >= words.length) {
      clearInterval(timerId); playing = false; $btn.text("Start"); return;
    }

    // update ramp step & delay
    if (step < rampLen) {
      step++;
      delay = delayForStep(step, rampLen, targetWpm);
    }

    timerId = setTimeout(tick, delay);
  }

  playing = true; $btn.text("Pause");
  timerId = setTimeout(tick, delay);
}

/* ---------- UI EVENTS ---------- */
$btn.on("click", () => {
  if (playing) {                         // ⏸ Pause
    clearTimeout(timerId);
    playing = false; lastPauseTime = Date.now();
    $btn.text("Resume");
  } else {                               // ▶️ Resume / Start
    // rewind if paused >3 s
    if (Date.now() - lastPauseTime > 3000) {
      wIdx = findSentenceStart(wIdx);
    }
    playWithRamp(wIdx === 0 ? RAMP_FULL : RAMP_SHORT);
  }
});

$("#spritz_wpm").on("input", () => {
  if (playing) playWithRamp(RAMP_SHORT); // smooth speed shift
});

$("#spritz_change").on("click", () => {
  chapters = [{ title: "Manual Text", words: splitWords($(".demo-text").val()) }];
  fillSelect(); loadChapter(0);
});

$bar.on("input", function () { wIdx = +this.value; render(wIdx); if (playing) playWithRamp(RAMP_SHORT); });
$sel.on("change", e => loadChapter(+e.target.value));

/* ---------- CHAPTER LOADERS ---------- */
function fillSelect() {
  $sel.empty();
  chapters.forEach((c, i) => $sel.append(`<option value="${i}">${c.title}</option>`));
}
function loadChapter(i) {
  clearTimeout(timerId);
  chIdx = i; words = chapters[chIdx].words; wIdx = 0;
  playing = false; $btn.text("Start");
  render(0); refreshBar();
}

/* =========================================================
   EPUB IMPORT  (robust extractor with natural sort)
   ========================================================= */
$("#epub_file").on("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  $btn.prop("disabled", true).text("Loading…");

  try {
    const buf = await f.arrayBuffer();
    chapters  = await extractChapters(buf);

    // ---- fixed guard ------------------------------------
    if (!Array.isArray(chapters) || !chapters.length) {
      throw new Error("Could not extract chapter text.");
    }
    // -----------------------------------------------------

    chapters.sort((a, b) => coll.compare(a.title, b.title));
    fillSelect(); loadChapter(0);
  } catch (err) {
    alert("Failed to load EPUB:\n" + err.message);
  } finally {
    $btn.prop("disabled", false).text("Start");
  }
});

/* ---------- CHAPTER EXTRACTOR (unchanged from v7) ---------- */
async function extractChapters(buffer) {
  // ... keep the same robust extractor you already have ...
}

/* ---------- INITIALISE ---------- */
$(function () {
  chapters = [{ title: "Manual Text", words: splitWords($(".demo-text").val()) }];
  fillSelect(); loadChapter(0);
});