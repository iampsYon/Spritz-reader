/* =========================================================
   SPEED-SPRITZ  —  main.js  (v7: ignore punctuation pivots)
   ========================================================= */

/* ---------- GLOBAL STATE ---------- */
let chapters = [];      // [{ title, words }]
let chIdx    = 0;
let words    = [];
let wIdx     = 0;
let timerId  = null;
let playing  = false;

const $dsp  = $(".spritz-word");
const $bar  = $("#progress_bar");
const $btn  = $("#spritz_toggle");
const $sel  = $("#chapter_select");

/* ---------- HELPERS ---------- */
const ALNUM = /[A-Za-z0-9]/;
const coll  = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function splitWords(text) {
  /* Grab every non-space chunk, then drop chunks with no letters/digits at all */
  return text.match(/\S+/g)?.filter(t => ALNUM.test(t)) || [];
}

function pivotIndex(word) {
  let idx = Math.floor(word.length * 0.4);
  if (!ALNUM.test(word[idx])) {
    /* slide left, then right until a letter/number is found */
    let l = idx - 1, r = idx + 1;
    while (l >= 0 || r < word.length) {
      if (l >= 0 && ALNUM.test(word[l])) { idx = l; break; }
      if (r < word.length && ALNUM.test(word[r])) { idx = r; break; }
      l--; r++;
    }
  }
  return idx;               // if none found, returns original (could be punctuation)
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

/* ---------- PLAYBACK ---------- */
function startSpritz(reset = false) {
  clearInterval(timerId);
  if (!words.length) { $dsp.text("No words!"); return; }
  if (reset) wIdx = 0;
  render(wIdx); refreshBar();

  const delay = 60_000 / (+$("#spritz_wpm").val() || 300);
  playing = true; $btn.text("Pause");

  timerId = setInterval(() => {
    if (++wIdx >= words.length) {
      clearInterval(timerId); playing = false; $btn.text("Start"); return;
    }
    render(wIdx); refreshBar();
  }, delay);
}

/* ---------- UI EVENTS ---------- */
$btn.on("click", () =>
  playing ? (clearInterval(timerId), playing = false, $btn.text("Resume"))
          : startSpritz(false));

$("#spritz_wpm").on("input", () => { if (playing) startSpritz(false); });

$("#spritz_change").on("click", () => {
  chapters = [{ title: "Manual Text", words: splitWords($(".demo-text").val()) }];
  fillSelect(); loadChapter(0);
});

$bar.on("input", function () { wIdx = +this.value; render(wIdx); if (playing) startSpritz(false); });

$sel.on("change", e => loadChapter(+e.target.value));

/* ---------- CHAPTER FUNCTIONS ---------- */
function fillSelect() {
  $sel.empty();
  chapters.forEach((c, i) => $sel.append(`<option value="${i}">${c.title}</option>`));
}
function loadChapter(i) {
  clearInterval(timerId);
  chIdx = i; words = chapters[chIdx].words; wIdx = 0;
  playing = false; $btn.text("Start");
  render(0); refreshBar();
}

/* =========================================================
   EPUB IMPORT  (unchanged except final sort call)
   ========================================================= */
$("#epub_file").on("change", async e => {
  const file = e.target.files[0]; if (!file) return;
  $btn.prop("disabled", true).text("Loading…");

  try {
    const buf = await file.arrayBuffer();
    chapters  = await extractChapters(buf);
    if (!chapters.length) throw new Error("Could not extract chapter text.");
    chapters.sort((a, b) => coll.compare(a.title, b.title));   // natural order
    fillSelect(); loadChapter(0);
  } catch (err) {
    alert("Failed to load EPUB:\n" + err.message);
  } finally {
    $btn.prop("disabled", false).text("Start");
  }
});

/* ---------- CHAPTER EXTRACTION (same as v6) ---------- */
async function extractChapters(buffer) {
  // … identical to previous version …
  //   (keep your existing extractChapters function here)
}

/* ---------- INITIALISE ---------- */
$(function () {
  chapters = [{ title: "Manual Text", words: splitWords($(".demo-text").val()) }];
  fillSelect(); loadChapter(0);
});