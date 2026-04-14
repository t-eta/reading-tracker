const STORAGE_KEY = "reading-tracker-v2";
const EXPORT_SCHEMA_VERSION = 1;

const todayIso = new Date().toISOString().slice(0, 10);

const seededBooks = [
  { title: "Аптечка номер 4", author: "Булат Ханов", total: 435 },
  { title: "Страна Оз за железным занавесом", author: "Эрика Хабер", total: 1188 },
  { title: "Калейдоскоп. Расходные материалы", author: "Сергей Кузнецов", total: 3053 },
  { title: "Зависимость и ее человек", author: "Марат Агинян", total: 1000 },
  { title: "Гордость Карфагена", author: "Дэвид Антони Дарем", total: 2513 },
  { title: "Полуночно-синий", author: "Симоне ван дер Влют", total: 807 },
  { title: "Утешение средневековой музыкой", author: "Данил Рябичков", total: 930 },
  { title: "Mood Machine", author: "Liz Pelly", total: 1371 },
  { title: "Голое поле", author: "Галика Каликина", total: 1602 },
  { title: "Время старого бога", author: "Себастьян Барри", total: 742 },
  { title: "Полезное прошлое", author: "Виталий Тихонов", total: 939 },
  { title: "Что они несли с собой", author: "Тим О'Брайен", total: 716 },
  { title: "Жизнь, которую мы создали", author: "Бет Шапиро", total: 1375 },
  { title: "Музыкофилия", author: "Оливер Сакс", total: 2022 },
  { title: "Русские князья при дворе ханов", author: "Юрий Селезнев", total: 1027 },
  { title: "Ученик архитектора", author: "Элиф Шафак", total: 1927 },
  { title: "Дворцовые интриги на Руси", author: "П.П. Толочко", total: 853 },
];

const DATA_REVISION = JSON.stringify({
  challenge: {
    startDate: "2026-03-01",
    endDate: "2026-08-25",
  },
  seededBooks,
});

const defaultState = {
  challenge: {
    startDate: "2026-03-01",
    endDate: "2026-08-25",
    today: todayIso,
  },
  books: seededBooks.map((book) => ({ id: crypto.randomUUID(), ...book, read: 0, status: "want", source: "seed" })),
  meta: {
    seedRevision: DATA_REVISION,
  },

  currentTab: "want",
};

let state = loadState();

const refs = {
  periodLabel: document.querySelector("#periodLabel"),
  startDateInput: document.querySelector("#startDateInput"),
  endDateInput: document.querySelector("#endDateInput"),
  todayInput: document.querySelector("#todayInput"),
  metricsGrid: document.querySelector("#metricsGrid"),
  pagesLayer: document.querySelector("#pagesLayer"),
  paceMarker: document.querySelector("#paceMarker"),
  timelineCaption: document.querySelector("#timelineCaption"),
  deltaLabel: document.querySelector("#deltaLabel"),
  tabs: document.querySelector("#tabs"),
  booksList: document.querySelector("#booksList"),
  bookForm: document.querySelector("#bookForm"),
  titleInput: document.querySelector("#titleInput"),
  authorInput: document.querySelector("#authorInput"),
  totalInput: document.querySelector("#totalInput"),
  cardTemplate: document.querySelector("#bookCardTemplate"),
  exportBtn: document.querySelector("#exportBtn"),
  importBtn: document.querySelector("#importBtn"),
  importFileInput: document.querySelector("#importFileInput"),
  syncStatus: document.querySelector("#syncStatus"),
};

init();

function init() {
  bindEvents();
  render();
}

function bindEvents() {
  refs.startDateInput.addEventListener("change", (e) => {
    state.challenge.startDate = e.target.value;
    saveAndRender();
  });

  refs.endDateInput.addEventListener("change", (e) => {
    state.challenge.endDate = e.target.value;
    saveAndRender();
  });

  refs.todayInput.addEventListener("change", (e) => {
    state.challenge.today = e.target.value || todayIso;
    saveAndRender();
  });

  refs.bookForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = refs.titleInput.value.trim();
    const author = refs.authorInput.value.trim();
    const total = Number(refs.totalInput.value);

    if (!title || !Number.isFinite(total) || total <= 0) return;

    state.books.unshift({
      id: crypto.randomUUID(),
      title,
      author,
      total,
      read: 0,
      status: "want",
      source: "custom",
    });

    refs.bookForm.reset();
    saveAndRender();
  });

  refs.exportBtn.addEventListener("click", () => {
    exportStateToJson();
  });

  refs.importBtn.addEventListener("click", () => {
    refs.importFileInput.click();
  });

  refs.importFileInput.addEventListener("change", async (e) => {
    const [file] = e.target.files || [];
    e.target.value = "";
    if (!file) return;
    await importStateFromJson(file);
  });
}

function render() {
  refs.startDateInput.value = state.challenge.startDate;
  refs.endDateInput.value = state.challenge.endDate;
  refs.todayInput.value = state.challenge.today;

  const summary = calcSummary();
  renderHeader(summary);
  renderTabs(summary.counts);
  renderBooks();
}

function renderHeader(summary) {
  const { startDate, endDate } = state.challenge;
  refs.periodLabel.textContent = `${fmtDate(startDate)} — ${fmtDate(endDate)}`;

  const metrics = [
    { label: "Прочитано", value: `${summary.readPages} / ${summary.totalPages} стр.` },
    { label: "Осталось", value: `${summary.remainingPages} стр.` },
    { label: "Темп в день", value: `≈${summary.pagesPerDay} стр.` },
    { label: "За 2 недели", value: `≈${summary.pagesTwoWeeks} стр.` },
    { label: "Дней осталось", value: `${summary.daysLeft}` },
  ];

  refs.metricsGrid.innerHTML = metrics
    .map((item) => `<article class="metric"><span>${item.label}</span><strong>${item.value}</strong></article>`)
    .join("");

  refs.pagesLayer.style.width = `${summary.readPercent}%`;
  refs.paceMarker.style.left = `calc(${summary.timePercent}% - 1px)`;

  refs.timelineCaption.textContent = `Прочитано ${summary.readPages} стр. · Цель по времени ${summary.expectedPages} стр.`;

  if (summary.deltaPages >= 0) {
    refs.deltaLabel.textContent = `+${summary.deltaPages} стр.`;
    refs.deltaLabel.style.color = "var(--success)";
  } else {
    refs.deltaLabel.textContent = `${summary.deltaPages} стр.`;
    refs.deltaLabel.style.color = "var(--danger)";
  }
}

function renderTabs(counts) {
  const tabs = [
    ["want", `Хочу (${counts.want})`],
    ["reading", `Читаю (${counts.reading})`],
    ["done", `Прочитала (${counts.done})`],
  ];

  refs.tabs.innerHTML = "";
  tabs.forEach(([key, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `tab ${state.currentTab === key ? "active" : ""}`;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      state.currentTab = key;
      saveAndRender();
    });
    refs.tabs.append(btn);
  });
}

function renderBooks() {
  const list = state.books.filter((book) => book.status === state.currentTab);
  refs.booksList.innerHTML = "";

  if (!list.length) {
    refs.booksList.innerHTML = `<p class="empty">Пока пусто в разделе «${tabLabel(state.currentTab)}».</p>`;
    return;
  }

  list.forEach((book) => {
    const card = refs.cardTemplate.content.firstElementChild.cloneNode(true);
    const title = card.querySelector(".book-title");
    const author = card.querySelector(".book-author");
    const totalInput = card.querySelector(".total-pages");
    const readWrap = card.querySelector(".read-wrap");
    const readInput = card.querySelector(".read-pages");
    const progressWrap = card.querySelector(".book-progress");
    const progressText = card.querySelector(".book-progress-text");
    const progressPercent = card.querySelector(".book-progress-percent");
    const progressFill = card.querySelector(".mini-progress-fill");

    title.textContent = book.title;
    author.textContent = book.author || "Без автора";
    totalInput.value = book.total;

    const isReading = book.status === "reading";
    if (isReading) {
      readWrap.classList.remove("hidden");
      progressWrap.classList.remove("hidden");
      readInput.value = book.read;
      const percent = safePercent(book.read, book.total);
      progressText.textContent = `${book.read} / ${book.total} стр.`;
      progressPercent.textContent = `${percent}%`;
      progressFill.style.width = `${percent}%`;
    }

    card.querySelectorAll(".status-buttons button").forEach((btn) => {
      if (btn.dataset.status === book.status) {
        btn.classList.add("active");
      }

      btn.addEventListener("click", () => {
        updateBook(book.id, { status: btn.dataset.status });
      });
    });

    totalInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const nextTotal = Number(e.target.value);
      if (!Number.isFinite(nextTotal) || nextTotal <= 0) return;
      updateBook(book.id, {
        total: nextTotal,
        read: Math.min(book.read, nextTotal),
      });
    });

    readInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const nextRead = Number(e.target.value);
      if (!Number.isFinite(nextRead) || nextRead < 0) return;
      updateBook(book.id, { read: clamp(nextRead, 0, book.total) });
    });

    card.querySelector(".delete-btn").addEventListener("click", () => {
      state.books = state.books.filter((item) => item.id !== book.id);
      saveAndRender();
    });

    refs.booksList.append(card);
  });
}

function calcSummary() {
  const counts = {
    want: 0,
    reading: 0,
    done: 0,
  };

  let totalPages = 0;
  let readPages = 0;
  let remainingPages = 0;

  state.books.forEach((book) => {
    counts[book.status] += 1;
    totalPages += book.total;

    if (book.status === "done") {
      readPages += book.total;
      return;
    }

    if (book.status === "reading") {
      readPages += book.read;
      remainingPages += Math.max(book.total - book.read, 0);
      return;
    }

    remainingPages += book.total;
  });

  const today = parseDate(state.challenge.today);
  const start = parseDate(state.challenge.startDate);
  const end = parseDate(state.challenge.endDate);

  const totalDays = Math.max(diffDays(start, end), 1);
  const elapsedDays = clamp(diffDays(start, today), 0, totalDays);
  const daysLeft = Math.max(diffDays(today, end), 0);

  const readPercent = safePercent(readPages, totalPages);
  const timePercent = Math.round((elapsedDays / totalDays) * 100);
  const expectedPages = Math.round((timePercent / 100) * totalPages);
  const deltaPages = readPages - expectedPages;

  const paceBase = daysLeft || 1;
  const pagesPerDay = Math.ceil(remainingPages / paceBase);

  return {
    counts,
    totalPages,
    readPages,
    remainingPages,
    daysLeft,
    pagesPerDay,
    pagesTwoWeeks: pagesPerDay * 14,
    readPercent,
    timePercent,
    expectedPages,
    deltaPages,
  };
}

function updateBook(id, patch) {
  state.books = state.books.map((book) => {
    if (book.id !== id) return book;
    const next = { ...book, ...patch };
    if (next.status === "done") {
      next.read = next.total;
    }
    if (next.status === "want") {
      next.read = 0;
    }
    return next;
  });
  saveAndRender();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    const normalizedBooks = normalizeBooks(parsed.books);
    const normalizedMeta = normalizeMeta(parsed.meta);
    const nextState = {
      ...structuredClone(defaultState),
      ...parsed,
      books: normalizedBooks,
      meta: normalizedMeta,
    };

    return reconcileDataRevision(nextState);
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeMeta(meta) {
  return {
    seedRevision: typeof meta?.seedRevision === "string" ? meta.seedRevision : "",
  };
}

function normalizeBooks(books) {
  if (!Array.isArray(books)) return [];

  return books
    .map((book) => {
      const total = Number(book.total ?? book.pages);
      if (!book?.title || !Number.isFinite(total) || total <= 0) return null;

      const status = ["want", "reading", "done"].includes(book.status) ? book.status : "want";
      const readRaw = Number(book.read);
      const read = Number.isFinite(readRaw) ? clamp(readRaw, 0, total) : 0;

      return {
        id: book.id || crypto.randomUUID(),
        title: String(book.title).trim(),
        author: String(book.author || "").trim(),
        total,
        read: status === "done" ? total : status === "want" ? 0 : read,
        status,
        source: book.source === "seed" ? "seed" : "custom",
      };
    })
    .filter(Boolean);
}

function reconcileDataRevision(nextState) {
  const shouldRefreshSeeds = nextState.meta.seedRevision !== DATA_REVISION;

  return {
    ...nextState,
    books: mergeSeedBooks(nextState.books || [], shouldRefreshSeeds),
    meta: {
      ...nextState.meta,
      seedRevision: DATA_REVISION,
    },
  };
}

function mergeSeedBooks(books, shouldRefreshSeeds = false) {
  const list = Array.isArray(books) ? books : [];
  const seededKeySet = new Set(seededBooks.map(bookKey));
  const booksByKey = new Map(list.map((book) => [bookKey(book), book]));

  const customBooks = list
    .filter((book) => {
      const key = bookKey(book);
      if (!seededKeySet.has(key)) return true;
      return book.source === "custom";
    })
    .map((book) => ({ ...book, source: "custom" }));

  const mergedSeeds = seededBooks.map((seed) => {
    const existing = booksByKey.get(bookKey(seed));
    const keepProgress = existing && (existing.source === "seed" || shouldRefreshSeeds);

    const status = keepProgress ? existing.status : "want";
    const readRaw = keepProgress ? Number(existing.read) : 0;
    const read = Number.isFinite(readRaw) ? clamp(readRaw, 0, seed.total) : 0;

    return {
      id: existing?.id || crypto.randomUUID(),
      title: seed.title,
      author: seed.author,
      total: seed.total,
      read: status === "done" ? seed.total : status === "want" ? 0 : read,
      status: ["want", "reading", "done"].includes(status) ? status : "want",
      source: "seed",
    };
  });

  return [...customBooks, ...mergedSeeds];
}

function bookKey(book) {
  return `${String(book.title || "").trim()}::${String(book.author || "").trim()}`;
}

function saveAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  setSyncStatus(`Локально сохранено: ${new Date().toLocaleString("ru-RU")}`);
  render();
}

function exportStateToJson() {
  const payload = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: state,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const datePart = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `reading-tracker-${datePart}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  setSyncStatus("JSON-файл выгружен. Перенеси его на другое устройство и загрузи там.");
}

async function importStateFromJson(file) {
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const imported = payload?.data;
    if (!imported || typeof imported !== "object") {
      throw new Error("invalid-payload");
    }

    const normalizedBooks = normalizeBooks(imported.books);
    const normalizedMeta = normalizeMeta(imported.meta);
    state = reconcileDataRevision({
      ...structuredClone(defaultState),
      ...imported,
      books: normalizedBooks,
      meta: normalizedMeta,
      challenge: {
        ...structuredClone(defaultState).challenge,
        ...imported.challenge,
      },
      currentTab: ["want", "reading", "done"].includes(imported.currentTab) ? imported.currentTab : "want",
    });

    saveAndRender();
    const importedAt = typeof payload.exportedAt === "string" ? payload.exportedAt : null;
    const importedAtLabel = importedAt
      ? new Date(importedAt).toLocaleString("ru-RU")
      : "неизвестное время";
    setSyncStatus(`Импорт завершён. Загружена копия от: ${importedAtLabel}`);
  } catch {
    setSyncStatus("Ошибка импорта: выбери корректный JSON-файл из Reading Tracker.");
  }
}

function setSyncStatus(message) {
  refs.syncStatus.textContent = message;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function safePercent(current, total) {
  if (!total) return 0;
  return Math.round((current / total) * 100);
}

function tabLabel(tab) {
  return tab === "want" ? "Хочу" : tab === "reading" ? "Читаю" : "Прочитала";
}

function parseDate(value) {
  return new Date(`${value}T00:00:00`);
}

function diffDays(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86_400_000);
}

function fmtDate(iso) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(parseDate(iso));
}
