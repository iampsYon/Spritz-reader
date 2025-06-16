/* =========================================================
   SPEED-SPRITZ — main.js  (v6: natural chapter order)
   ========================================================= */

/* ---------- GLOBAL STATE ---------- */
let chapters = [];      // [{ title, words }]
let chIdx    = 0;       // current chapter index
let words    = [];      // alias to chapters[chIdx].words
let wIdx     = 0;       // word pointer
let timerId  = null;
let playing  = false;

const $display = $(".spritz-word");
const $bar     = $("#progress_bar");
const $toggle  = $("#spritz_toggle");
const $sel     = $("#chapter_select");

/* ---------- SMALL HELPERS ---------- */
const pivot = w => Math.round((w.length + 1) * 0.4) - 1;
const split = t => t.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);

function render(i) {
  const w = words[i] ?? "";
  const p = pivot(w);
  $display.html(
    `<div>${w.slice(0, p)}</div>` +
    `<div>${w[p] ?? ""}</div>` +
    `<div>${w.slice(p + 1)}</div>`
  );
}
function refreshBar() { $bar.attr({ max: words.length - 1, value: wIdx }); }

/* ---------- NATURAL SORT (e.g. chapter-2 < chapter-10) ---------- */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
function naturalSort(a, b) { return collator.compare(a.title, b.title); }

/* ---------- PLAYBACK LOOP ---------- */
function startSpritz(reset = false) {
  clearInterval(timerId);
  if (!words.length) { $display.text("No words!"); return; }
  if (reset) wIdx = 0;
  render(wIdx); refreshBar();

  const delay = 60_000 / (+$("#spritz_wpm").val() || 300);
  playing = true; $toggle.text("Pause");

  timerId = setInterval(() => {
    if (++wIdx >= words.length) {
      clearInterval(timerId); playing = false; $toggle.text("Start"); return;
    }
    render(wIdx); refreshBar();
  }, delay);
}

/* ---------- UI EVENTS ---------- */
$toggle.on("click", () =>
  playing ? (clearInterval(timerId), playing = false, $toggle.text("Resume"))
          : startSpritz(false));

$("#spritz_wpm").on("input", () => { if (playing) startSpritz(false); });

$("#spritz_change").on("click", () => {
  chapters = [{ title: "Manual Text", words: split($(".demo-text").val()) }];
  fillSelect(); loadChapter(0);
});

$bar.on("input", function () { wIdx = +this.value; render(wIdx); if (playing) startSpritz(false); });

$sel.on("change", e => loadChapter(+e.target.value));

/* ---------- CHAPTER HANDLING ---------- */
function fillSelect() {
  $sel.empty();
  chapters.forEach((c, i) => $sel.append(`<option value="${i}">${c.title}</option>`));
}
function loadChapter(i) {
  clearInterval(timerId);
  chIdx = i; words = chapters[chIdx].words; wIdx = 0;
  playing = false; $toggle.text("Start");
  render(0); refreshBar();
}

/* =========================================================
   EPUB UPLOAD
   ========================================================= */
$("#epub_file").on("change", async e => {
  const file = e.target.files[0]; if (!file) return;
  $toggle.prop("disabled", true).text("Loading…");

  try {
    const buf = await file.arrayBuffer();
    chapters  = await extractChapters(buf);

    if (!chapters.length) throw new Error("Could not extract chapter text.");

    /* NEW: natural-order sort before displaying */
    chapters.sort(naturalSort);

    fillSelect(); loadChapter(0);
  } catch (err) {
    alert("Failed to load EPUB:\n" + err.message);
  } finally {
    $toggle.prop("disabled", false).text("Start");
  }
});

/* ---------- CHAPTER EXTRACTION ---------- */
async function extractChapters(buffer) {
  /* 1️⃣ epub.js spine (keeps original reading order) */
  try {
    const book  = ePub(buffer); await book.ready;     /* global epub.js */
    const spine = Array.isArray(book.spine?.items)
      ? book.spine.items
      : Array.isArray(book.spine?.spineItems)
        ? book.spine.spineItems : [];

    const out = [];
    for (const item of spine) {
      let html = "";
      try {
        if (item.load)            { html = await item.load(book.load.bind(book)); item.unload?.(); }
        else if (item.render)     { const r = await item.render(); html = r.contents || ""; }
        else if (book.resources)  { html = await book.resources.get(item.href).then(r => r.text()); }
        else if (book.archive)    { const url = await book.archive.createUrl(item.href); html = await fetch(url).then(r => r.text()); }
      } catch {}
      if (!html.trim()) continue;
      const txt = new DOMParser().parseFromString(html, "text/html").body.textContent;
      if (txt.trim()) out.push({ title: item.id || `Chapter ${out.length + 1}`, words: split(txt) });
    }
    if (out.length) return out;   // already ordered by spine → done
  } catch {}

  /* 2️⃣ fallback: raw JSZip scan and then natural sort */
  try {
    const zip   = await JSZip.loadAsync(buffer);      /* global JSZip */
    const files = Object.keys(zip.files).filter(n => /\.(x?html?|txt)$/i.test(n));

    const chapters = [];
    for (const name of files) {
      try {
        const html = await zip.files[name].async("string");
        const txt  = new DOMParser().parseFromString(html, "text/html").body.textContent;
        if (txt.trim()) chapters.push({ title: name.split("/").pop(), words: split(txt) });
      } catch {}
    }
    return chapters;
  } catch { return []; }
}

/* ---------- INITIALISE WITH MANUAL TEXT ---------- */
$(function () {
  chapters = [{ title: "Manual Text", words: split($(".demo-text").val()) }];
  fillSelect(); loadChapter(0);
});