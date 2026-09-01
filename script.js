let map, currentMarkerGroup;
let currentObject = null;
let currentImageIndex = 0;
let modalImageIndex = 0;
let activeBaseLayer = null;
let currentLang = 'ru';
let translations = {};
let currentData = [];
let currentFilter = 'all';
let catalogFilter = 'all';
let catalogSearchQuery = '';
let lastView = 'home';

const tileLayers = {
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }),
  hybrid: L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' }),
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '&copy; CARTO' })
  ])
};

const categoryIconMap = { landscape: 'icons/landscape.svg', botanical: 'icons/botanical.svg', hydrological: 'icons/hydrological.svg' };
const categoryLabelFallback = { landscape: 'Ландшафтный', botanical: 'Ботанический', hydrological: 'Гидрологический' };

function shortenCategory(name = '') { return name.replace(/\s+местного значения$/i, ''); }

function createCustomIcon(category) {
  const iconSrc = categoryIconMap[category] || categoryIconMap.botanical;
  return L.divIcon({
    className: 'custom-map-pin', iconSize: [38, 38], iconAnchor: [19, 19],
    html: `<div class="map-pin pin-${category}"><span class="map-pin-glow"></span><img src="${iconSrc}" alt=""></div>`
  });
}

function getYoutubeVideoId(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname === '/watch') return url.searchParams.get('v') || '';
      if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2] || '';
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || '';
    }
  } catch (_) {}
  return '';
}

function formatYoutubeEmbedUrl(value) {
  const videoId = getYoutubeVideoId(value);
  if (!videoId) return '';
  let start = '';
  try {
    const parsed = new URL(String(value));
    const seconds = parsed.searchParams.get('t');
    if (seconds && /^\d+$/.test(seconds)) start = `&start=${seconds}`;
  } catch (_) {}
  const origin = window.location.origin || '';
  return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1${start}${origin ? `&origin=${encodeURIComponent(origin)}` : ''}`;
}

function generateQRCode(text) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(text)}`;
}

function formatDescription(text) {
  if (!text) return '';
  return text.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '<br>';
    const isSection = /^(?:📌|🌿|🔬|🛡️|📍|[А-ЯA-ZЁ][А-ЯA-ZЁ\s«»—-]{2,}:)/u.test(trimmed);
    return isSection ? `<span class="section-head">${escapeHtml(trimmed)}</span>` : `${escapeHtml(trimmed)}<br>`;
  }).join('');
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}

function extractDetails(text = '') {
  const details = {};
  const areaMatch = text.match(/(?:Площадь|площадь)[\s:–-]+([\d.,]+\s*га)/i);
  if (areaMatch) details.area = areaMatch[1].trim();
  const yearMatch = text.match(/(?:создан|образован|утвержден|введен)[\sв]+(?:году\s*)?(\d{4})/i);
  if (yearMatch) details.established = yearMatch[1];
  const statusMatch = text.match(/(Ландшафтный заказник|Гидрологический заказник|Ботанический памятник природы)/i);
  if (statusMatch) details.status = statusMatch[1];
  return details;
}

function iconMarkup(category, extraClass = '') {
  const src = categoryIconMap[category] || categoryIconMap.botanical;
  return `<img class="inline-icon ${extraClass}" src="${src}" alt="">`;
}

function categoryColorClass(category) {
  return `category-${category || 'botanical'}`;
}

function setCategoryIcon(element, category) {
  if (!element) return;
  if (element.tagName === 'IMG') {
    element.src = categoryIconMap[category] || categoryIconMap.botanical;
    element.alt = '';
  } else {
    element.innerHTML = iconMarkup(category);
  }
}

async function loadLocale(lang) {
  try {
    const res = await fetch(`locales/${lang}.json?v=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    translations = await res.json();
    currentLang = lang;
    applyTranslations();
    document.querySelector('.lang-current').textContent = lang.toUpperCase();
    document.querySelectorAll('.lang-option').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === lang));
  } catch (e) {
    console.warn(`Ошибка локализации ${lang}:`, e);
    if (lang !== 'ru') await loadLocale('ru');
  }
}

function text(id, key, fallback) {
  const el = document.getElementById(id);
  if (el) el.textContent = translations[key] || fallback;
}

function htmlText(id, key, fallback) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = translations[key] || fallback;
}

function applyTranslations() {
  text('app-title', 'app_title', 'Заповедная Бобруйщина');
  text('app-subtitle', 'app_subtitle', 'Интерактивный атлас природных уголков');
  text('nav-home', 'nav_home', 'Главная');
  text('nav-map', 'nav_map', 'Карта');
  text('nav-objects', 'nav_objects', 'Объекты');
  text('about-btn-text', 'about_button', 'О проекте');
  htmlText('hero-title', 'hero_title_html', 'Заповедная<br><em>Бобруйщина</em>');
  text('hero-subtitle', 'hero_subtitle', 'Интерактивный атлас природных уголков Бобруйского края');
  text('hero-lead', 'hero_lead', 'Исследуйте охраняемые ландшафты, древние деревья, озёра и болотные комплексы — в одном цифровом путешествии.');
  text('hero-map-btn', 'hero_map', 'Открыть карту →');
  text('hero-objects-btn', 'hero_objects', 'Исследовать объекты ↗');
  htmlText('intro-title', 'intro_title_html', 'Природа Бобруйщины —<br><em>ближе, чем кажется.</em>');
  text('intro-text', 'intro_text', 'Откройте места, которые легко проехать мимо: вековые деревья, редкие болота, озёрные каскады и охраняемые ландшафты.');
  text('intro-link', 'intro_link', 'Смотреть каталог →');
  text('catalog-title', 'object_list_title', 'Природные объекты');
  text('catalog-subtitle', 'hero_lead', 'Исследуйте охраняемые территории, памятники природы и уникальные природные комплексы Бобруйщины.');
  const catalogSearch = document.getElementById('catalog-search-input');
  if (catalogSearch) catalogSearch.placeholder = translations.search_placeholder || 'Поиск объекта...';
  const countLabel = document.getElementById('catalog-count-label');
  if (countLabel) countLabel.textContent = translations.catalog_count_label || 'объектов в атласе';
  htmlText('stat-objects-label', 'stat_objects', 'природных<br>объектов');
  htmlText('stat-categories-label', 'stat_categories', 'категории<br>охраны');
  htmlText('stat-photos-label', 'stat_photos', 'фотографий<br>в атласе');
  text('catalog-kicker', 'catalog_kicker', 'АТЛАС ПРИРОДНЫХ МЕСТ');
  renderCatalogFilters();
  text('map-title-text', 'map_title', 'Интерактивная карта');
  const search = document.getElementById('search-input');
  if (search) search.placeholder = translations.search_placeholder || 'Поиск объекта...';
  text('filter-title', 'filter_title', 'Категории');
  text('filter-all', 'filter_all', 'Все');
  text('filter-landscape', 'filter_landscape', 'Ландшафтные');
  text('filter-botanical', 'filter_botanical', 'Ботанические');
  text('filter-hydrological', 'filter_hydrological', 'Гидрологические');
  text('map-style-title', 'map_style_title', 'Вид карты');
  text('map-style-hybrid', 'map_style_hybrid', 'Спутник + Гибрид');
  text('map-style-osm', 'map_style_osm', 'Схема (OSM)');
  text('object-list-title', 'object_list_title', 'Природные объекты');
  text('about-title', 'about_title', 'Путеводитель по заповедной природе');
  text('about-text1', 'about_text1', 'Добро пожаловать в цифровое путешествие по природным уголкам Бобруйского края!');
  text('about-text2', 'about_text2', 'Откройте уникальные ландшафты, древние деревья и водно-болотные комплексы.');
  htmlText('about-feature1', 'about_feature1', '📍 <strong>Исследуйте:</strong> находите объекты на карте.');
  htmlText('about-feature2', 'about_feature2', '📸 <strong>Вдохновляйтесь:</strong> смотрите фотографии и видео.');
  htmlText('about-feature3', 'about_feature3', '📜 <strong>Узнавайте:</strong> изучайте историю и ценность мест.');
  text('about-footer', 'about_footer', 'Сохраним природное наследие Бобруйщины вместе!');
  text('expand-sidebar-btn', 'more_info', 'Подробнее');
  text('fit-all-label', 'fit_all', 'Все объекты');
  text('legend-botanical', 'legend_botanical', 'Ботанические');
  text('legend-landscape', 'legend_landscape', 'Ландшафтные');
  text('legend-hydrological', 'legend_hydrological', 'Гидрологические');
  text('catalog-map-label', 'catalog_map', 'Открыть карту');
  text('youtube-open-text', 'watch_on_youtube', 'Открыть видео на YouTube');
  text('modal-sources-title', 'sources_title', 'Источники');
  text('qr-label', 'qr_links', 'Ссылки объекта');
  text('qr-viewer-label', 'qr_links', 'Ссылки объекта');
  text('about-kicker', 'about_kicker', 'О ПРОЕКТЕ');
  text('details-kicker', 'details_kicker', 'ТЕХНОЛОГИИ');
  text('modal-full-desc-title', 'full_description', 'Подробное описание');
  text('modal-sources-title', 'sources_title', 'Источники');
  text('about-author-name', 'about_author_name', 'Автор проекта');
  text('about-author-nick', 'about_author_nick', 'Indigo');
  text('about-author-age', 'about_author_age', '');
  htmlText('about-author-description', 'about_author_description', '');
  text('about-details-title', 'about_details_title', 'Подробнее о сайте');
  htmlText('about-details-text', 'about_details_text', '');
  text('about-author-btn', 'about_author_title', 'Об авторе');
  text('about-details-btn', 'about_details_title_button', 'Технологии проекта');
}

async function loadData(lang) {
  try {
    const res = await fetch(`locales/${lang}-data.json?v=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Данные не являются массивом');
    currentData = data;
    document.getElementById('total-count').textContent = currentData.length;
    return true;
  } catch (e) {
    console.warn(`Ошибка данных ${lang}:`, e);
    if (lang !== 'ru') return loadData('ru');
    currentData = [];
    return false;
  }
}

function showView(view) {
  const home = document.getElementById('home-view');
  const explorer = document.getElementById('explorer-view');
  const catalog = document.getElementById('objects-catalog-view');
  lastView = view;
  home.classList.toggle('hidden', view !== 'home');
  explorer.classList.toggle('hidden', view !== 'map');
  catalog.classList.toggle('hidden', view !== 'objects');
  document.querySelectorAll('.nav-link').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  [home, explorer, catalog].forEach(el => { if (el && !el.classList.contains('hidden')) { el.classList.remove('view-enter'); requestAnimationFrame(() => el.classList.add('view-enter')); } });
  if (view === 'map') {
    requestAnimationFrame(() => setTimeout(() => {
      map?.invalidateSize();
      if (!currentObject) fitAllObjects();
    }, 120));
  }
  if (view === 'objects') renderCatalog();
  document.querySelector('.main-nav')?.classList.remove('open');
}

function getMapVisibleData() {
  return currentFilter === 'all' ? currentData : currentData.filter(obj => obj.category === currentFilter);
}

function getCatalogVisibleData() {
  let items = catalogFilter === 'all' ? currentData : currentData.filter(obj => obj.category === catalogFilter);
  if (catalogSearchQuery) {
    const matches = searchObjects(catalogSearchQuery, items);
    const ids = new Set(matches.map(obj => obj.id));
    items = items.filter(obj => ids.has(obj.id));
  }
  return items;
}

function getVisibleData() { return getMapVisibleData(); }

function renderObjects(items = getVisibleData()) {
  if (!map || !currentMarkerGroup) return;
  currentMarkerGroup.clearLayers();
  const list = document.getElementById('object-list');
  list.innerHTML = '';
  let markerCount = 0;

  items.forEach((obj, index) => {
    if (Array.isArray(obj.coords) && obj.coords.length === 2 && obj.coords.every(Number.isFinite)) {
      const marker = L.marker(obj.coords, { icon: createCustomIcon(obj.category), keyboard: true, title: obj.name });
      marker.bindTooltip(`${escapeHtml(obj.name)}${obj.coordsAccuracy === 'approximate' ? ` · ${escapeHtml(translations.approximate || 'Approximate point')}` : ''}`, { className: 'custom-map-tooltip', direction: 'top', offset: [0, -28], opacity: .98 });
      marker.on('click', () => selectObject(obj));
      currentMarkerGroup.addLayer(marker);
      markerCount++;
    }

    const li = document.createElement('li');
    li.dataset.id = obj.id;
    li.className = `object-list-item ${categoryColorClass(obj.category)}`;
    li.style.setProperty('--item-index', index);
    const category = shortenCategory(obj.categoryName || categoryLabelFallback[obj.category] || 'Природный объект');
    li.innerHTML = `<div class="item-topline"><span class="item-name">${escapeHtml(obj.name || '')}</span><span class="item-category-dot" title="${escapeHtml(category)}"></span></div><span class="item-meta">${escapeHtml(category)}</span>`;
    li.onclick = () => selectObject(obj);
    list.appendChild(li);
  });
  updateStats();
  renderCatalog();
  console.log(`Отображено ${items.length} объектов, маркеров: ${markerCount}`);
}

function renderCatalog(items = getCatalogVisibleData()) {
  const grid = document.getElementById('catalog-grid');
  const count = document.getElementById('catalog-count');
  if (!grid || !count) return;
  count.textContent = items.length;
  grid.innerHTML = '';
  items.forEach((obj, index) => {
    const image = Array.isArray(obj.images) && obj.images.length ? obj.images[0] : '';
    const category = shortenCategory(obj.categoryName || categoryLabelFallback[obj.category] || 'Природный объект');
    const card = document.createElement('article');
    card.className = `catalog-card ${categoryColorClass(obj.category)}`;
    card.dataset.id = obj.id;
    card.style.setProperty('--card-index', index);
    const mapIcon = '<img class="button-icon" src="icons/map-pin.svg" alt="">';
    const detailLabel = translations.more_info || 'Подробнее';
    const mapLabel = translations.show_on_map || 'Показать объект на карте';
    const noPhotoLabel = translations.no_photo || 'Фото пока нет';
    card.innerHTML = `<div class="catalog-card-media ${image ? '' : 'no-image'}">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(obj.name || '')}" loading="lazy">` : `<div class="catalog-no-image">${iconMarkup(obj.category)}<span>${escapeHtml(noPhotoLabel)}</span></div>`}<div class="catalog-card-shade"></div><span class="catalog-category"><span class="category-dot"></span>${escapeHtml(category)}</span></div><div class="catalog-card-body"><h3>${escapeHtml(obj.name || '')}</h3><p>${escapeHtml(makeShortDescription(obj))}</p><div class="catalog-card-actions"><button class="catalog-details-btn" type="button">${escapeHtml(detailLabel)} <img class="button-icon" src="icons/arrow-right.svg" alt=""></button><button class="catalog-map-link" type="button" title="${escapeHtml(mapLabel)}" aria-label="${escapeHtml(mapLabel)}">${mapIcon}</button></div></div>`;
    card.querySelector('.catalog-details-btn').onclick = () => { currentObject = obj; currentImageIndex = 0; openModal(); };
    card.querySelector('.catalog-map-link').onclick = () => selectObject(obj, true);
    grid.appendChild(card);
  });
}

function makeShortDescription(obj, maxLength = 430) {
  if (!obj) return '';
  if (obj.shortDesc && obj.shortDesc.trim().length >= 180) return obj.shortDesc.trim();
  const text = String(obj.fullDesc || '').replace(/\r/g, '');
  const paragraphs = text.split(/\n+/).map(x => x.trim()).filter(Boolean).filter(x => !/^(?:📌|🌿|🔬|🛡️|📍|[А-ЯA-ZЁ][А-ЯA-ZЁ\s«»—-]{2,}:)$/u.test(x));
  const base = (obj.shortDesc || '').trim();
  const combined = [base, ...paragraphs].filter(Boolean).join(' ');
  if (!combined) return 'Подробная информация об объекте доступна в полной карточке.';
  return combined.length > maxLength ? combined.slice(0, maxLength - 3).replace(/\s+\S*$/, '') + '…' : combined;
}

function renderCatalogFilters() {
  const wrap = document.getElementById('catalog-filters');
  if (!wrap) return;
  const labels = { all: translations.filter_all || 'Все', landscape: translations.filter_landscape || 'Ландшафтные', botanical: translations.filter_botanical || 'Ботанические', hydrological: translations.filter_hydrological || 'Гидрологические' };
  const icons = { landscape:'icons/landscape.svg', botanical:'icons/botanical.svg', hydrological:'icons/hydrological.svg' };
  wrap.innerHTML = Object.keys(labels).map(key => `<button type="button" class="catalog-filter-btn ${catalogFilter === key ? 'active' : ''}" data-catalog-filter="${key}">${key === 'all' ? '<span class="filter-all-mark">◎</span>' : `<img class="filter-icon" src="${icons[key]}" alt="">`}<span>${escapeHtml(labels[key])}</span></button>`).join('');
  wrap.querySelectorAll('[data-catalog-filter]').forEach(btn => btn.addEventListener('click', () => {
    catalogFilter = btn.dataset.catalogFilter;
    wrap.querySelectorAll('[data-catalog-filter]').forEach(b => b.classList.toggle('active', b === btn));
    renderCatalog();
  }));
}

function updateStats() {
  const photos = currentData.reduce((sum, obj) => sum + (Array.isArray(obj.images) ? obj.images.length : 0), 0);
  const statObjects = document.getElementById('stat-objects');
  const statPhotos = document.getElementById('stat-photos');
  if (statObjects) statObjects.textContent = currentData.length;
  if (statPhotos) statPhotos.textContent = photos;
  const cats = new Set(currentData.map(x => x.category).filter(Boolean));
  const statCats = document.getElementById('stat-categories');
  if (statCats) statCats.textContent = cats.size || 3;
}

function fitAllObjects() {
  const points = currentData.filter(obj => Array.isArray(obj.coords) && obj.coords.length === 2 && obj.coords.every(Number.isFinite)).map(obj => obj.coords);
  if (!map || !points.length) return;
  map.fitBounds(L.latLngBounds(points), { padding: [55, 55], maxZoom: 13 });
}

function selectObject(obj, fromCatalog = false) {
  if (!obj) return;
  currentObject = obj;
  currentImageIndex = 0;
  if (fromCatalog) {
    showView('map');
  }

  document.getElementById('detail-category').textContent = shortenCategory(obj.categoryName || categoryLabelFallback[obj.category] || 'Природный объект');
  setCategoryIcon(document.getElementById('detail-category-icon'), obj.category);
  document.getElementById('detail-title').textContent = obj.name || '';
  document.getElementById('detail-short-desc').textContent = makeShortDescription(obj, 330);

  const details = obj.details || {};
  const detailContainer = document.getElementById('detail-extra');
  const bits = [];
  const labels = { area: translations.area || 'Площадь', year: translations.year || 'Год', status: translations.status || 'Статус' };
  if (details.area) bits.push(`<span class="detail-item"><b>${escapeHtml(labels.area)}</b>${escapeHtml(details.area)}</span>`);
  if (details.year) bits.push(`<span class="detail-item"><b>${escapeHtml(labels.year)}</b>${escapeHtml(details.year)}</span>`);
  if (details.status) bits.push(`<span class="detail-item"><b>${escapeHtml(labels.status)}</b>${escapeHtml(shortenCategory(details.status))}</span>`);
  detailContainer.innerHTML = bits.join('');
  detailContainer.style.display = bits.length ? 'grid' : 'none';

  document.querySelectorAll('.object-list li').forEach(li => li.classList.toggle('active', li.dataset.id === obj.id));
  document.querySelectorAll('.catalog-card').forEach(card => card.classList.toggle('active', card.dataset.id === obj.id));
  updateGallery();
  document.getElementById('sidebar-right').classList.add('active');
  document.getElementById('explorer-view')?.classList.add('has-object-panel');

  if (Array.isArray(obj.coords) && obj.coords.length === 2 && obj.coords.every(Number.isFinite) && map) {
    requestAnimationFrame(() => {
      map.invalidateSize();
      const targetZoom = Math.max(map.getZoom(), 14);
      map.flyTo(obj.coords, targetZoom, { duration: .7, easeLinearity: .2 });
      const panel = document.getElementById('sidebar-right');
      const offset = window.innerWidth <= 800 ? [0, -Math.min(window.innerHeight * .20, 150)] : [Math.min(panel.offsetWidth * .42, 190), 0];
      setTimeout(() => { if (map) map.panBy(offset, { duration: .35, easeLinearity: .2 }); }, 760);
    });
  }
}

function setImage(img, src) {
  img.classList.remove('empty-image');
  if (!src) {
    img.removeAttribute('src');
    img.classList.add('empty-image');
    img.alt = 'Фотография пока не добавлена';
    return;
  }
  img.onerror = () => { img.removeAttribute('src'); img.classList.add('empty-image'); img.alt = 'Фотография недоступна'; };
  img.src = src;
}

function updateGallery() {
  if (!currentObject) return;
  const images = Array.isArray(currentObject.images) ? currentObject.images : [];
  const img = document.getElementById('detail-image');
  const counter = document.getElementById('gallery-counter');
  setImage(img, images[currentImageIndex] || '');
  counter.textContent = images.length ? `${currentImageIndex + 1} / ${images.length}` : 'Фото нет';
  document.querySelectorAll('.gallery-arrow').forEach(btn => btn.style.display = images.length > 1 ? 'flex' : 'none');
}

function switchImage(direction) {
  const images = currentObject?.images || [];
  if (images.length < 2) return;
  currentImageIndex = (currentImageIndex + direction + images.length) % images.length;
  updateGallery();
}

function switchModalImage(direction) {
  const images = currentObject?.images || [];
  if (images.length < 2) return;
  modalImageIndex = (modalImageIndex + direction + images.length) % images.length;
  const img = document.getElementById('modal-gallery-image');
  setImage(img, images[modalImageIndex]);
  document.getElementById('modal-gallery-counter').textContent = `${modalImageIndex + 1} / ${images.length}`;
}

function openOverlay(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('is-closing');
  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('is-open'));
  document.body.classList.add('overlay-active');
}

function closeOverlay(id, after) {
  const modal = document.getElementById(id);
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.remove('is-open');
  modal.classList.add('is-closing');
  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('is-closing');
    if (after) after();
    if (!document.querySelector('.modal-backdrop.is-open, .image-viewer-backdrop.is-open, .qr-viewer-backdrop.is-open')) document.body.classList.remove('overlay-active');
  }, 420);
}

function openModal() {
  if (!currentObject) return;
  modalImageIndex = 0;
  document.getElementById('modal-title').textContent = currentObject.name || '';
  document.getElementById('modal-category').textContent = shortenCategory(currentObject.categoryName || categoryLabelFallback[currentObject.category] || 'Природный объект');
  setCategoryIcon(document.getElementById('modal-category-icon'), currentObject.category);

  const images = Array.isArray(currentObject.images) ? currentObject.images : [];
  setImage(document.getElementById('modal-gallery-image'), images[0] || '');
  document.getElementById('modal-gallery-counter').textContent = images.length ? `1 / ${images.length}` : 'Фото нет';
  document.querySelectorAll('.modal-gallery-arrow').forEach(btn => btn.style.display = images.length > 1 ? 'grid' : 'none');

  const iframe = document.getElementById('modal-video');
  const placeholder = document.getElementById('modal-video-placeholder');
  const youtubeLink = document.getElementById('youtube-open-link');
  const embed = formatYoutubeEmbedUrl(currentObject.videoUrl);
  if (embed) {
    iframe.src = embed; iframe.style.display = 'block'; placeholder.style.display = 'none';
    youtubeLink.href = currentObject.videoUrl; youtubeLink.classList.remove('hidden');
  } else {
    iframe.src = ''; iframe.style.display = 'none'; placeholder.style.display = 'flex'; youtubeLink.classList.add('hidden');
  }

  const sourcesList = document.getElementById('modal-sources');
  sourcesList.innerHTML = '';
  (currentObject.sources || []).forEach(source => {
    const li = document.createElement('li');
    if (source.url) {
      const a = document.createElement('a');
      a.href = source.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = source.title || source.url;
      li.appendChild(a);
    } else {
      li.textContent = source.title || '';
    }
    sourcesList.appendChild(li);
  });
  if (!sourcesList.children.length) sourcesList.innerHTML = `<li>${escapeHtml(translations.no_sources || 'Нет указанных источников')}</li>`;

  const qrData = currentObject.sources?.find(s => s.url)?.url || currentObject.videoUrl || window.location.href;
  document.getElementById('modal-qr-code').src = generateQRCode(qrData);
  document.getElementById('modal-full-desc').innerHTML = formatDescription(currentObject.fullDesc || '');
  openOverlay('full-modal');
}

function closeModal() {
  closeOverlay('full-modal', () => { document.getElementById('modal-video').src = ''; });
}

function closeObjectPanel() {
  document.getElementById('sidebar-right').classList.remove('active');
  document.getElementById('explorer-view')?.classList.remove('has-object-panel');
  document.querySelectorAll('.object-list li').forEach(li => li.classList.remove('active'));
}

function bindModal(id, closeId) {
  const modal = document.getElementById(id);
  const close = document.getElementById(closeId);
  close?.addEventListener('click', () => closeOverlay(id));
  modal?.addEventListener('click', e => { if (e.target === modal) closeOverlay(id); });
}

function initSearch() {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  const clear = document.getElementById('clear-search');
  input.addEventListener('input', () => {
    const query = input.value.trim();
    clear.classList.toggle('hidden', !query);
    results.innerHTML = '';
    if (!query) { results.classList.add('hidden'); return; }
    const matched = searchObjects(query, currentData).slice(0, 7);
    if (!matched.length) {
      const no = document.createElement('div'); no.className = 'search-item'; no.textContent = translations.no_results || 'Ничего не найдено'; results.appendChild(no);
    } else {
      matched.forEach(obj => {
        const item = document.createElement('div'); item.className = 'search-item'; item.textContent = obj.name;
        item.onclick = () => { input.value = ''; clear.classList.add('hidden'); results.classList.add('hidden'); selectObject(obj); };
        results.appendChild(item);
      });
    }
    results.classList.remove('hidden');
  });
  clear.addEventListener('click', () => { input.value = ''; clear.classList.add('hidden'); results.classList.add('hidden'); input.focus(); });
  document.addEventListener('click', e => { if (!input.contains(e.target) && !results.contains(e.target)) results.classList.add('hidden'); });
}

function refreshSelectedObjectContent() {
  if (!currentObject) return;
  document.getElementById('detail-category').textContent = shortenCategory(currentObject.categoryName || categoryLabelFallback[currentObject.category] || 'Природный объект');
  setCategoryIcon(document.getElementById('detail-category-icon'), currentObject.category);
  document.getElementById('detail-title').textContent = currentObject.name || '';
  document.getElementById('detail-short-desc').textContent = makeShortDescription(currentObject, 330);
  updateGallery();
  document.querySelectorAll('.object-list li').forEach(li => li.classList.toggle('active', li.dataset.id === currentObject.id));
}

function initCatalogSearch() {
  const input = document.getElementById('catalog-search-input');
  const clear = document.getElementById('catalog-search-clear');
  if (!input) return;
  input.addEventListener('input', () => {
    catalogSearchQuery = input.value.trim();
    clear?.classList.toggle('hidden', !catalogSearchQuery);
    renderCatalog();
  });
  clear?.addEventListener('click', () => {
    input.value = ''; catalogSearchQuery = ''; clear.classList.add('hidden'); renderCatalog(); input.focus();
  });
}

function initHeroSlideshow() {
  const hero = document.querySelector('.hero-photo');
  if (!hero) return;
  const photos = ['images/luk.jpg','images/dub.jpg','images/dub2.jpg','images/dub3.jpg','images/dubkas.jpg','images/veksos.jpg','images/poydubr.jpeg','images/lipnyaki.jpg','images/velikoe.jpg','images/moh.jpeg'];
  photos.forEach(src => { const img = new Image(); img.src = src; });
  let index = 0;
  setInterval(() => {
    hero.classList.add('is-changing');
    setTimeout(() => {
      index = (index + 1) % photos.length;
      hero.style.backgroundImage = `url("${photos[index]}")`;
      requestAnimationFrame(() => hero.classList.remove('is-changing'));
    }, 650);
  }, 30000);
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadLocale('ru');
  await loadData('ru');
  updateStats();

  map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([53.1384, 29.2223], 11);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  activeBaseLayer = tileLayers.hybrid.addTo(map);
  currentMarkerGroup = L.layerGroup().addTo(map);
  renderObjects();
  initSearch();
  initCatalogSearch();
  initHeroSlideshow();
  renderCatalogFilters();

  document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
  document.getElementById('brand-home').addEventListener('click', e => { e.preventDefault(); showView('home'); });
  document.getElementById('fit-all-btn').addEventListener('click', fitAllObjects);

  document.getElementById('mobile-menu').addEventListener('click', () => document.querySelector('.main-nav').classList.toggle('open'));
  document.querySelectorAll('.nav-link').forEach(btn => btn.addEventListener('click', () => document.querySelector('.main-nav').classList.remove('open')));

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const html = document.documentElement;
    const dark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', dark ? 'light' : 'dark');
    document.querySelector('.theme-icon').src = dark ? 'icons/sun.svg' : 'icons/moon.svg';
    localStorage.setItem('bobruisk-theme', dark ? 'light' : 'dark');
  });
  const savedTheme = localStorage.getItem('bobruisk-theme');
  if (savedTheme) { document.documentElement.setAttribute('data-theme', savedTheme); document.querySelector('.theme-icon').src = savedTheme === 'dark' ? 'icons/sun.svg' : 'icons/moon.svg'; }

  document.getElementById('map-layer-select').addEventListener('change', e => {
    const next = tileLayers[e.target.value];
    if (activeBaseLayer) map.removeLayer(activeBaseLayer);
    activeBaseLayer = next.addTo(map);
  });

  document.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderObjects();
  }));

  document.querySelector('.gallery-arrow.prev').onclick = () => switchImage(-1);
  document.querySelector('.gallery-arrow.next').onclick = () => switchImage(1);
  document.getElementById('modal-gallery-prev').onclick = () => switchModalImage(-1);
  document.getElementById('modal-gallery-next').onclick = () => switchModalImage(1);
  document.getElementById('expand-sidebar-btn').onclick = openModal;
  document.getElementById('close-right-sidebar').onclick = closeObjectPanel;
  document.getElementById('close-modal').onclick = closeModal;

  document.getElementById('modal-gallery-image').addEventListener('click', () => {
    const src = document.getElementById('modal-gallery-image').src;
    if (!src) return;
    document.getElementById('image-viewer-img').src = src;
    openOverlay('image-viewer');
  });
  document.getElementById('detail-image').addEventListener('click', () => {
    const src = document.getElementById('detail-image').src;
    if (!src) return;
    document.getElementById('image-viewer-img').src = src;
    openOverlay('image-viewer');
  });

  document.getElementById('about-btn').onclick = () => openOverlay('about-modal');
  document.getElementById('about-author-btn').onclick = () => openOverlay('author-modal');
  document.getElementById('about-details-btn').onclick = () => openOverlay('details-modal');
  bindModal('about-modal', 'close-about-modal');
  bindModal('author-modal', 'close-author-modal');
  bindModal('details-modal', 'close-details-modal');
  bindModal('full-modal', 'close-modal');

  document.getElementById('close-image-viewer').onclick = () => closeOverlay('image-viewer');
  document.getElementById('image-viewer').addEventListener('click', e => { if (e.target === e.currentTarget) closeOverlay('image-viewer'); });

  document.getElementById('modal-qr-expand').onclick = () => {
    document.getElementById('qr-viewer-img').src = document.getElementById('modal-qr-code').src;
    document.getElementById('qr-viewer-sources').innerHTML = document.getElementById('modal-sources').innerHTML;
    openOverlay('qr-viewer');
  };
  bindModal('qr-viewer', 'close-qr-viewer');

  const langBtn = document.getElementById('lang-btn');
  const langDropdown = document.getElementById('lang-dropdown');
  langBtn.addEventListener('click', e => { e.stopPropagation(); langDropdown.classList.toggle('hidden'); });
  document.addEventListener('click', () => langDropdown.classList.add('hidden'));
  document.querySelectorAll('.lang-option').forEach(btn => btn.addEventListener('click', async e => {
    e.stopPropagation();
    const lang = btn.dataset.lang;
    if (lang === currentLang) return langDropdown.classList.add('hidden');
    const preservedView = lastView;
    const preservedObjectId = currentObject?.id || null;
    await loadLocale(lang);
    await loadData(lang);
    currentObject = preservedObjectId ? (currentData.find(obj => obj.id === preservedObjectId) || null) : null;
    renderCatalogFilters();
    renderObjects();
    renderCatalog();
    if (currentObject) {
      refreshSelectedObjectContent();
      if (!document.getElementById('full-modal').classList.contains('hidden')) openModal();
    } else {
      closeObjectPanel();
    }
    showView(preservedView);
    langDropdown.classList.add('hidden');
  }));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      ['full-modal','about-modal','author-modal','details-modal','image-viewer','qr-viewer'].forEach(id => closeOverlay(id));
      document.getElementById('sidebar-right').classList.remove('active');
    }
  });

  // Start at the landing page; the map is ready underneath and appears instantly after CTA.
  showView('home');
});
