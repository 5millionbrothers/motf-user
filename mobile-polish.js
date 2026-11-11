/* moTF 모바일 보완 (2026-11-10)
   뒤로가기 버튼이 없던 화면(숙소·객실·상품 상세, 우리 단체 등)에 뒤로가기 버튼을 넣습니다.
   버튼은 mobile-polish.css에서 699px 이하 화면에서만 보이게 되어 있어 PC 화면은 그대로입니다.
   누르면 앱의 기존 [data-history-back] 동작(이전 화면, 없으면 fallback 화면)을 그대로 씁니다. */
(() => {
  if (window.__mpModule1) return;
  window.__mpModule1 = true;
  const targets = {
    stayDetail: ['stays', '숙소 목록'],
    roomDetail: ['stayDetail', '숙소로'],
    booking: ['stays', '뒤로'],
    storeDetail: ['market', '장보기'],
    productDetail: ['market', '장보기'],
    payment: ['cart', '뒤로'],
    chat: ['home', '뒤로'],
    review: ['mypage', '뒤로'],
    organizations: ['mypage', '마이페이지'],
  };
  const chevron = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';

  function ensure(view) {
    const target = targets[view.id];
    if (!target) return;
    const first = view.firstElementChild;
    if (first && first.classList.contains('mp-back')) return;
    if (view.querySelector(':scope > .back-btn, :scope > [data-history-back]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mp-back';
    button.dataset.historyBack = '';
    button.dataset.fallbackRoute = target[0];
    button.setAttribute('aria-label', '뒤로가기');
    button.innerHTML = chevron + '<span>' + target[1] + '</span>';
    view.prepend(button);
  }

  function run() {
    Object.keys(targets).forEach(id => {
      const view = document.getElementById(id);
      if (view) ensure(view);
    });
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.target.id && targets[record.target.id]) ensure(record.target);
      if (record.type === 'childList') record.addedNodes.forEach(node => { if (node.id && targets[node.id]) ensure(node); });
    }
  });

  function start() {
    run();
    const main = document.querySelector('main') || document.body;
    observer.observe(main, { childList: true, subtree: true });
    window.addEventListener('motf:routechange', run);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

/* 선택칸(select)을 누르면 휴대폰 기본 목록 대신 사이트 디자인의 아래 시트로 고르게 합니다.
   699px 이하 화면에서만 동작하고, 고르면 원래 select 값이 바뀌고 change 이벤트가 그대로 발생합니다. */
(() => {
  if (window.__mpModule2) return;
  window.__mpModule2 = true;
  const mobile = window.matchMedia('(max-width: 699px)');
  const check = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  const close = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  let sheet = null;
  let current = null;
  let lastOpen = 0;

  const usable = select => select instanceof HTMLSelectElement && mobile.matches && !select.multiple && !(select.size > 1) && !select.disabled && !select.closest('.flatpickr-calendar') && select.dataset.mpNative === undefined;

  function labelOf(select) {
    const aria = select.getAttribute('aria-label');
    if (aria) return aria.replace(/^검색\s*/, '');
    const label = select.closest('label') || (select.id && document.querySelector(`label[for="${CSS.escape(select.id)}"]`));
    if (label) {
      const text = [...label.childNodes].filter(node => node.nodeType === 3 || (node.nodeType === 1 && !node.matches('select, input, textarea, button'))).map(node => node.textContent).join(' ').replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    return '선택';
  }

  function build() {
    sheet = document.createElement('div');
    sheet.className = 'mp-select-sheet';
    sheet.hidden = true;
    sheet.innerHTML = `<button type="button" class="mp-ss-backdrop" aria-label="닫기" tabindex="-1"></button><div class="mp-ss-panel" role="dialog" aria-modal="true"><div class="mp-ss-grip"></div><div class="mp-ss-head"><strong></strong><button type="button" class="mp-ss-close" aria-label="닫기">${close}</button></div><div class="mp-ss-list" role="listbox"></div></div>`;
    sheet.addEventListener('click', event => {
      if (event.target.closest('.mp-ss-backdrop, .mp-ss-close')) { hide(); return; }
      const option = event.target.closest('.mp-ss-option');
      if (!option || option.disabled || !current) return;
      const select = current;
      const changed = select.selectedIndex !== Number(option.dataset.index);
      select.selectedIndex = Number(option.dataset.index);
      hide();
      if (changed) {
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    sheet.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  }

  function host(select) {
    // 팝업(dialog) 안의 선택칸이면 시트도 그 팝업 안에 붙여야 위에 보입니다.
    return select.closest('dialog[open]') || document.body;
  }

  function show(select) {
    if (!sheet) build();
    current = select;
    lastOpen = Date.now();
    sheet.querySelector('.mp-ss-head strong').textContent = labelOf(select);
    const list = sheet.querySelector('.mp-ss-list');
    list.innerHTML = '';
    let group = null;
    [...select.options].forEach((option, index) => {
      if (option.hidden) return;
      const parent = option.parentElement;
      if (parent && parent.tagName === 'OPTGROUP' && parent !== group) {
        group = parent;
        const head = document.createElement('div');
        head.className = 'mp-ss-group';
        head.textContent = parent.label;
        list.append(head);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mp-ss-option' + (option.value === '' ? ' is-placeholder' : '');
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === select.selectedIndex));
      button.dataset.index = String(index);
      button.disabled = option.disabled || (parent && parent.disabled);
      const text = document.createElement('span');
      text.textContent = option.label || option.textContent;
      button.append(text);
      button.insertAdjacentHTML('beforeend', check);
      list.append(button);
    });
    host(select).append(sheet);
    sheet.hidden = false;
    // 선택칸 바로 아래로 펼쳐지는 목록 (아래 공간이 부족하면 위로)
    const panel = sheet.querySelector('.mp-ss-panel');
    const rect = select.getBoundingClientRect();
    const gap = 6;
    const below = window.innerHeight - rect.bottom - gap - 12;
    const above = rect.top - gap - 12;
    const natural = Math.min(list.scrollHeight + 12, 320);
    const up = below < Math.min(natural, 200) && above > below;
    const width = Math.max(rect.width, 160);
    panel.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.max(120, Math.min(320, up ? above : below))}px`;
    panel.style.top = up ? 'auto' : `${rect.bottom + gap}px`;
    panel.style.bottom = up ? `${window.innerHeight - rect.top + gap}px` : 'auto';
    const selected = list.querySelector('[aria-selected="true"]');
    if (selected) list.scrollTop = Math.max(0, selected.offsetTop - list.clientHeight / 2 + selected.offsetHeight / 2);
    (selected || list.querySelector('.mp-ss-option:not(:disabled)'))?.focus({ preventScroll: true });
  }

  function hide() {
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    const select = current;
    current = null;
    select?.focus({ preventScroll: true });
  }

  let touch = null;
  document.addEventListener('touchstart', event => {
    const select = event.target.closest?.('select');
    touch = usable(select) ? { select, x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }, { passive: true, capture: true });
  document.addEventListener('touchend', event => {
    if (!touch) return;
    const point = event.changedTouches[0];
    const moved = Math.abs(point.clientX - touch.x) > 10 || Math.abs(point.clientY - touch.y) > 10;
    const select = touch.select;
    touch = null;
    if (moved) return;
    event.preventDefault();
    show(select);
  }, { passive: false, capture: true });
  document.addEventListener('mousedown', event => {
    const select = event.target.closest?.('select');
    if (!usable(select)) return;
    event.preventDefault();
    if (Date.now() - lastOpen > 400) show(select);
  }, true);
  document.addEventListener('keydown', event => {
    const select = event.target;
    if (!usable(select)) return;
    if (event.key === 'Enter' || event.key === ' ' || (event.altKey && event.key === 'ArrowDown')) {
      event.preventDefault();
      show(select);
    }
  }, true);
  window.addEventListener('motf:routechange', hide);
  window.addEventListener('scroll', () => { if (sheet && !sheet.hidden && Date.now() - lastOpen > 300) hide(); }, true);
  window.addEventListener('resize', hide);
})();

/* 화면이 다시 그려진 뒤 새로 생긴 날짜칸(input[type=date])에도 사이트 달력(flatpickr)을 붙입니다.
   예: 숙소 상세에서 날짜를 바꾸면 날짜칸이 휴대폰 기본 날짜칸으로 바뀌던 문제. 모바일에서만 동작합니다. */
(() => {
  if (window.__mpModule3) return;
  window.__mpModule3 = true;
  const mobile = window.matchMedia('(max-width: 699px)');
  let timer = 0;
  const upgrade = () => {
    timer = 0;
    if (!mobile.matches || typeof window.motfInitializeDatePickers !== 'function') return;
    if (!document.querySelector('input[type="date"]:not(.flatpickr-input)')) return;
    try { window.motfInitializeDatePickers(); } catch (error) { /* 달력을 못 붙여도 기본 날짜칸은 그대로 동작합니다. */ }
  };
  const schedule = () => { if (!timer) timer = window.setTimeout(upgrade, 60); };
  const start = () => {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('motf:routechange', schedule);
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

/* ==========================================================================
   2026-11-11 모바일 공통 도구 + 숙소 목록(지도/시트) + 숙소 상세 개편
   모두 699px 이하에서만 동작합니다. PC 화면에는 아무것도 하지 않습니다.
   ========================================================================== */
(() => {
  if (window.__mpModule4) return;
  window.__mpModule4 = true;
  const mobile = window.matchMedia('(max-width: 699px)');
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const route = () => (typeof currentRoute === 'function' ? currentRoute() : document.querySelector('.view.active')?.id) || 'home';
  const svg = {
    search: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    sliders: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
    map: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>',
    list: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    calendar: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    user: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    users: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/></svg>',
    close: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    minus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
    plus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    chevronDown: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    share: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
    images: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
  };
  const DAY = ['일', '월', '화', '수', '목', '금', '토'];
  const parse = value => { const [y, m, d] = String(value || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
  const short = value => { const date = parse(value); return date ? `${date.getMonth() + 1}.${date.getDate()}(${DAY[date.getDay()]})` : ''; };
  const nights = (a, b) => { const x = parse(a), y = parse(b); return x && y ? Math.max(0, Math.round((y - x) / 86400000)) : 0; };
  const values = () => (typeof staySearchValues === 'function' ? staySearchValues() : { checkIn: $('#stayCheckInDate')?.value, checkOut: $('#stayCheckOutDate')?.value, region: $('#stayRegion')?.value, people: Number($('#stayPeople')?.value || 10) });
  const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
  const won = value => (typeof money === 'function' ? money(value) : `${Number(value || 0).toLocaleString('ko-KR')}원`);

  /* ---------- 공통: 현재 화면 표시 ---------- */
  function markRoute() {
    document.body.dataset.mpRoute = route();
    const header = $('.site-header');
    const nav = $('.mobile-bottom-nav');
    document.body.style.setProperty('--mp-top', `${header ? Math.round(header.getBoundingClientRect().bottom > 0 ? header.offsetHeight : 0) : 0}px`);
    document.body.style.setProperty('--mp-bottom', `${nav && getComputedStyle(nav).display !== 'none' ? nav.offsetHeight : 0}px`);
  }

  /* ---------- 숙소 목록: 검색바 ---------- */
  function renderSearchbar() {
    const view = $('#stays');
    if (!view) return;
    let bar = $('.mp-searchbar', view);
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'mp-searchbar';
      bar.innerHTML = `<button type="button" class="mp-sb-main" data-local-filter-open aria-label="지역, 날짜, 인원 바꾸기">${svg.search}<span class="mp-sb-text"><strong></strong><span></span></span></button><button type="button" class="mp-sb-filter" data-local-filter-open aria-label="필터">${svg.sliders}<b></b></button>`;
      const anchor = $('.mobile-stay-search', view) || $('.split-layout', view);
      anchor.before(bar);
    }
    const v = values();
    const n = nights(v.checkIn, v.checkOut);
    setText(bar.querySelector('strong'), v.region || '지역 선택');
    setText(bar.querySelector('.mp-sb-text span'), `${short(v.checkIn)} – ${short(v.checkOut)}${n ? ` · ${n}박` : ''} · ${v.people}명`);
    const active = $$('[data-stay-filter]:checked').length + (Number($('#stayMinRooms')?.value || 0) > 0 ? 1 : 0) + (Number($('#stayPrice')?.value || 0) < Number($('#stayPrice')?.max || 0) ? 1 : 0);
    setText(bar.querySelector('b'), active ? String(active) : '');
  }

  /* ---------- 숙소 목록: 지도 위 끌어올리는 목록 시트 ---------- */
  const sheet = { el: null, state: 'half', y: 0, height: 0, top: 0 };
  function sheetSnaps() {
    const h = sheet.height;
    return { full: 0, half: Math.round(h * 0.46), peek: Math.max(0, h - 92) };
  }
  function setSheet(state, animate = true) {
    if (!sheet.el) return;
    sheet.state = state;
    sheet.y = sheetSnaps()[state];
    sheet.el.classList.toggle('mp-dragging', !animate);
    sheet.el.style.setProperty('--mp-sheet-y', `${sheet.y}px`);
    if (state !== 'full') sheet.el.scrollTop = 0;
    const toggle = $('#stays .mp-map-toggle');
    if (toggle) {
      toggle.hidden = state === 'half';
      const mode = state === 'full' ? 'map' : 'list';
      if (toggle.dataset.mode !== mode) { toggle.dataset.mode = mode; toggle.innerHTML = mode === 'map' ? `${svg.map}지도 보기` : `${svg.list}목록 보기`; }
    }
  }
  function layoutSheet() {
    const on = mobile.matches && route() === 'stays';
    document.body.classList.toggle('mp-sheet-on', on);
    if (!on) return;
    markRoute();
    const view = $('#stays');
    const section = $('.split-layout > section', view);
    if (!section) return;
    if (sheet.el !== section) {
      sheet.el = section;
      bindSheet(section);
    }
    if (!$('.mp-sheet-handle', section)) {
      const handle = document.createElement('div');
      handle.className = 'mp-sheet-handle';
      handle.innerHTML = '<strong></strong>';
      section.prepend(handle);
    }
    const count = $('#stayCount')?.textContent?.trim();
    setText($('.mp-sheet-handle strong', section), count ? `숙소 ${count.replace(/숙소/, '').trim()}` : '숙소 목록');
    if (!$('.mp-map-toggle', view)) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'mp-map-toggle';
      toggle.addEventListener('click', () => setSheet(sheet.state === 'full' ? 'peek' : 'full'));
      view.append(toggle);
    }
    const bar = $('.mp-searchbar', view);
    const top = parseFloat(getComputedStyle(document.body).getPropertyValue('--mp-top')) || 0;
    const bottom = parseFloat(getComputedStyle(document.body).getPropertyValue('--mp-bottom')) || 0;
    sheet.top = top + (bar ? bar.offsetHeight + 16 : 72);
    sheet.height = window.innerHeight - sheet.top - bottom;
    document.body.style.setProperty('--mp-sheet-top', `${sheet.top}px`);
    setSheet(sheet.state, false);
    requestAnimationFrame(() => {
      sheet.el?.classList.remove('mp-dragging');
      try { mapState?.stays?.map?.autoResize(); } catch (error) { /* 지도는 다음 그리기 때 맞춰집니다 */ }
    });
  }
  function bindSheet(section) {
    let drag = null;
    const begin = (y, fromHandle) => { drag = { startY: y, startOffset: sheet.y, fromHandle, moved: false }; };
    const move = (y, event) => {
      if (!drag) return;
      const dy = y - drag.startY;
      if (!drag.fromHandle) {
        // 목록 내용에서 시작한 끌기: 맨 위에서 아래로 당기거나, 시트가 덜 올라온 상태에서 위로 밀 때만 시트를 움직임
        const pullDown = dy > 0 && section.scrollTop <= 0;
        const pushUp = dy < 0 && sheet.state !== 'full' && drag.startOffset > 0;
        if (!drag.moved && !pullDown && !pushUp) { drag = null; return; }
      }
      if (Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      event?.cancelable && event.preventDefault();
      const snaps = sheetSnaps();
      sheet.y = Math.min(snaps.peek, Math.max(0, drag.startOffset + dy));
      section.classList.add('mp-dragging');
      section.style.setProperty('--mp-sheet-y', `${sheet.y}px`);
    };
    const end = () => {
      if (!drag) return;
      const moved = drag.moved;
      const delta = sheet.y - drag.startOffset;
      drag = null;
      section.classList.remove('mp-dragging');
      if (!moved) return;
      const snaps = sheetSnaps();
      const order = ['full', 'half', 'peek'];
      let target = order.reduce((best, name) => (Math.abs(snaps[name] - sheet.y) < Math.abs(snaps[best] - sheet.y) ? name : best), 'half');
      if (Math.abs(delta) > 40 && target === sheet.state) target = order[Math.max(0, Math.min(2, order.indexOf(sheet.state) + (delta > 0 ? 1 : -1)))];
      setSheet(target);
    };
    section.addEventListener('touchstart', event => begin(event.touches[0].clientY, !!event.target.closest('.mp-sheet-handle')), { passive: true });
    section.addEventListener('touchmove', event => move(event.touches[0].clientY, event), { passive: false });
    section.addEventListener('touchend', end);
    section.addEventListener('touchcancel', end);
    // 마우스(PC 브라우저에서 폰 화면 크기로 볼 때)는 손잡이로 끌기
    section.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' || !event.target.closest('.mp-sheet-handle')) return;
      begin(event.clientY, true);
      const onMove = e => move(e.clientY, e);
      const onUp = () => { end(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
    section.addEventListener('dragstart', event => event.preventDefault());
    section.addEventListener('click', event => {
      if (event.target.closest('.mp-sheet-handle') && sheet.state !== 'full') setSheet(sheet.state === 'peek' ? 'half' : 'full');
    });
  }

  function refreshStays() {
    if (!mobile.matches) { document.body.classList.remove('mp-sheet-on'); return; }
    renderSearchbar();
    layoutSheet();
  }

  window.mpMobile = Object.assign(window.mpMobile || {}, { svg, short, nights, values, won, route, markRoute, refreshStays, setSheet });

  const start = () => {
    markRoute();
    refreshStays();
    const stays = $('#stays');
    if (stays) new MutationObserver(() => { if (route() === 'stays') { clearTimeout(start.t); start.t = setTimeout(refreshStays, 30); } }).observe(stays, { childList: true, subtree: true, characterData: true });
    window.addEventListener('motf:routechange', () => setTimeout(() => { markRoute(); refreshStays(); }, 0));
    window.addEventListener('resize', () => { markRoute(); refreshStays(); });
    document.addEventListener('change', event => { if (event.target.closest('#stayFilters, #stayAdvancedFilters, .local-filter-dialog')) setTimeout(refreshStays, 0); });
    mobile.addEventListener?.('change', () => { markRoute(); refreshStays(); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

/* ---------- 숙소 상세 (모바일): 사진 넘겨보기, 순서 정리, 더보기, 하단 예약 바, 날짜·인원 시트, 객실 카드 ---------- */
(() => {
  if (window.__mpModule5) return;
  window.__mpModule5 = true;
  const mobile = window.matchMedia('(max-width: 699px)');
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const M = () => window.mpMobile;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const selectedStay = () => (typeof state !== 'undefined' ? state.selectedStay : null);
  const galleryImages = () => (typeof state !== 'undefined' && Array.isArray(state.gallery?.images) ? state.gallery.images : []);

  let heroRetry = 0;
  function hero(root) {
    const images = galleryImages();
    if ($('.mp-hero', root)) return;
    if (!images.length) {
      // 사진 목록이 아직 안 불러와졌으면 잠시 뒤 다시 시도
      if (heroRetry++ < 10) setTimeout(enhance, 400);
      return;
    }
    heroRetry = 0;
    const stay = selectedStay();
    const box = document.createElement('div');
    box.className = 'mp-hero';
    box.innerHTML = `<div class="mp-hero-track">${images.map((src, index) => `<button type="button" data-open-gallery="${index}" aria-label="사진 ${index + 1} 크게 보기"><img src="${esc(src)}" alt="${esc(stay?.name || '숙소')} 사진 ${index + 1}" ${index ? 'loading="lazy"' : ''} decoding="async"></button>`).join('')}</div><span class="mp-hero-count"><b>1</b> / ${images.length}</span>`;
    root.prepend(box);
    const track = $('.mp-hero-track', box);
    const count = $('.mp-hero-count b', box);
    track.addEventListener('scroll', () => {
      const index = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      const text = String(Math.min(images.length, index + 1));
      if (count.textContent !== text) count.textContent = text;
    }, { passive: true });
  }

  function keywords(root, stay) {
    const top = $('.stay-detail-top', root);
    const title = $('.stay-detail-title', top);
    if (!top || !title || $('.mp-keywords', top)) return;
    const list = (stay.highlights || stay.detailTags || []).filter(item => item && !/화장실|욕실/.test(item)).slice(0, 3);
    if (!list.length) return;
    const line = document.createElement('p');
    line.className = 'mp-keywords';
    line.innerHTML = list.map(item => `<span>#${esc(String(item).replace(/\s+/g, ''))}</span>`).join('');
    title.after(line);
  }

  function fold(element, label, limit) {
    if (!element || element.dataset.mpFold) return;
    element.dataset.mpFold = '1';
    if (element.scrollHeight <= limit + 40) return;
    element.classList.add('mp-folded');
    element.style.setProperty('--mp-fold', `${limit}px`);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mp-fold-toggle';
    button.innerHTML = `<span>${label}</span>${M()?.svg.chevronDown || ''}`;
    button.addEventListener('click', () => {
      const open = element.classList.toggle('mp-unfolded');
      button.classList.toggle('open', open);
      button.querySelector('span').textContent = open ? '접기' : label;
    });
    element.after(button);
  }

  function rooms(root, stay) {
    const list = $('.room-list-vertical', root);
    if (!list) return;
    const section = list.closest('section');
    section.id = 'mpRooms';
    section.classList.add('mp-rooms');
    const toolbar = $('.section-toolbar', section);
    if (toolbar && !toolbar.dataset.mp) {
      toolbar.dataset.mp = '1';
      const h2 = $('h2', toolbar);
      if (h2) h2.textContent = '객실 선택';
      const sub = $('span', toolbar);
      const v = M()?.values();
      if (sub && v) sub.textContent = `${M().short(v.checkIn)} ~ ${M().short(v.checkOut)} · ${v.people}명 기준`;
    }
    $$('.room-option-card', list).forEach((card, index) => {
      if (card.dataset.mp) return;
      card.dataset.mp = '1';
      const room = stay.rooms?.[index];
      if (!room) return;
      const head = $('.room-option-body > div', card);
      const features = (Array.isArray(room.features) ? room.features : []).filter(item => !/화장실|욕실/.test(item)).slice(0, 3);
      const info = document.createElement('div');
      info.className = 'mp-room-info';
      info.innerHTML = `<p>${M()?.svg.user || ''}<span>${esc(room.capacity || '인원 확인 필요')}</span></p>${features.length ? `<p><span>${features.map(esc).join(' · ')}</span></p>` : ''}<div class="mp-room-price"><small>숙박</small><strong>${esc(M()?.won(room.price) || room.price)}</strong></div>`;
      head?.after(info);
    });
  }

  function minPrice(stay) {
    const prices = (stay.rooms || []).filter(room => !(typeof isRoomUnavailable === 'function' && isRoomUnavailable(room))).map(room => Number(room.price) || 0).filter(Boolean);
    return prices.length ? Math.min(...prices) : 0;
  }

  function bar(opts) {
    let el = $('.mp-detail-bar');
    if (!el) {
      el = document.createElement('div');
      el.className = 'mp-detail-bar';
      el.innerHTML = `<button type="button" class="mp-db-cond" data-mp-date-open><span class="mp-db-when"></span><span class="mp-db-price"></span></button><button type="button" class="mp-db-go"></button>`;
      el.querySelector('.mp-db-go').addEventListener('click', () => el._onGo?.());
      document.body.append(el);
    }
    const v = M()?.values();
    if (!v) return;
    const n = M().nights(v.checkIn, v.checkOut);
    el.querySelector('.mp-db-when').textContent = `${M().short(v.checkIn)} ~ ${M().short(v.checkOut)}${n ? ` · ${n}박` : ''} · ${v.people}명`;
    el.querySelector('.mp-db-price').innerHTML = opts.price;
    const go = el.querySelector('.mp-db-go');
    go.textContent = opts.label;
    go.disabled = !!opts.disabled;
    el._onGo = opts.onGo;
  }
  const scrollToRooms = () => {
    const target = $('#mpRooms');
    if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' });
  };

  /* 날짜·인원 시트 */
  let dateSheet = null;
  let picker = null;
  function openDateSheet() {
    const v = M()?.values();
    if (!v) return;
    if (!dateSheet) {
      dateSheet = document.createElement('div');
      dateSheet.className = 'mp-date-sheet';
      dateSheet.hidden = true;
      dateSheet.innerHTML = `<button type="button" class="mp-ds-backdrop" aria-label="닫기" tabindex="-1"></button><section class="mp-ds-panel" role="dialog" aria-modal="true" aria-label="날짜, 인원 선택"><div class="mp-ds-grip"></div><header class="mp-ds-head"><h2>날짜, 인원 선택</h2><button type="button" class="mp-ds-close" aria-label="닫기">${M().svg.close}</button></header><div class="mp-ds-body"><div class="mp-ds-card"><p class="mp-ds-range">${M().svg.calendar}<strong></strong></p><div class="mp-ds-calendar"></div></div><div class="mp-ds-people"><span>${M().svg.users}<strong>인원</strong></span><div class="mp-ds-stepper"><button type="button" data-step="-1" aria-label="인원 줄이기">${M().svg.minus}</button><input type="number" inputmode="numeric" min="10" max="120" aria-label="인원"><button type="button" data-step="1" aria-label="인원 늘리기">${M().svg.plus}</button></div></div><p class="mp-ds-note">단체 숙소라 10명부터 예약할 수 있어요.</p></div><footer class="mp-ds-foot"><button type="button" class="mp-ds-apply">적용하기</button></footer></section>`;
      document.body.append(dateSheet);
      dateSheet.addEventListener('click', event => {
        if (event.target.closest('.mp-ds-backdrop, .mp-ds-close')) closeDateSheet();
        const step = event.target.closest('[data-step]');
        if (step) {
          const input = $('.mp-ds-stepper input', dateSheet);
          input.value = Math.min(120, Math.max(10, Number(input.value || 10) + Number(step.dataset.step)));
          updateRange();
        }
        if (event.target.closest('.mp-ds-apply')) applyDateSheet();
      });
      $('.mp-ds-stepper input', dateSheet).addEventListener('input', updateRange);
      dateSheet.addEventListener('keydown', event => { if (event.key === 'Escape') closeDateSheet(); });
    }
    $('.mp-ds-stepper input', dateSheet).value = v.people;
    const holder = $('.mp-ds-calendar', dateSheet);
    holder.innerHTML = '';
    if (window.flatpickr) {
      picker = window.flatpickr(holder, {
        inline: true,
        mode: 'range',
        minDate: 'today',
        maxDate: new Date().fp_incr(90),
        defaultDate: [v.checkIn, v.checkOut].filter(Boolean),
        dateFormat: 'Y-m-d',
        locale: window.flatpickr.l10ns?.ko || 'default',
        monthSelectorType: 'static',
        disableMobile: true,
        onChange: updateRange,
      });
    }
    dateSheet.hidden = false;
    document.body.classList.add('mp-date-open');
    updateRange();
    $('.mp-ds-apply', dateSheet).focus({ preventScroll: true });
  }
  function selectedRange() {
    const dates = picker?.selectedDates || [];
    const fmt = date => (window.flatpickr ? window.flatpickr.formatDate(date, 'Y-m-d') : '');
    return dates.length ? [fmt(dates[0]), dates[1] ? fmt(dates[1]) : ''] : ['', ''];
  }
  function updateRange() {
    if (!dateSheet) return;
    const [a, b] = selectedRange();
    const people = Number($('.mp-ds-stepper input', dateSheet).value || 10);
    const n = M().nights(a, b);
    $('.mp-ds-range strong', dateSheet).textContent = a ? (b ? `${M().short(a)} ~ ${M().short(b)} · ${n}박` : `${M().short(a)} ~ 체크아웃 날짜 선택`) : '체크인 날짜를 골라주세요';
    const apply = $('.mp-ds-apply', dateSheet);
    apply.disabled = !(a && b && n > 0);
    apply.textContent = apply.disabled ? '체크아웃 날짜를 골라주세요' : `${n}박 · ${Math.min(120, Math.max(10, people))}명 적용하기`;
  }
  function closeDateSheet() {
    if (!dateSheet || dateSheet.hidden) return;
    dateSheet.hidden = true;
    document.body.classList.remove('mp-date-open');
    try { picker?.destroy(); } catch (error) { /* 무시 */ }
    picker = null;
  }
  function applyDateSheet() {
    const [a, b] = selectedRange();
    if (!a || !b) return;
    const people = Math.min(120, Math.max(10, Number($('.mp-ds-stepper input', dateSheet).value || 10)));
    closeDateSheet();
    if (typeof applyStaySearchField === 'function') {
      applyStaySearchField('checkIn', a);
      applyStaySearchField('checkOut', b);
      applyStaySearchField('people', people);
      if (typeof syncStaySearchPanel === 'function') syncStaySearchPanel();
      const current = M().route();
      if (current === 'stayDetail' && typeof renderStayDetail === 'function') renderStayDetail();
      if (current === 'stays' && typeof renderStays === 'function') renderStays();
      if (current === 'roomDetail' && typeof renderRoomDetail === 'function') renderRoomDetail();
    }
    enhance();
  }
  document.addEventListener('click', event => {
    if (!mobile.matches) return;
    if (event.target.closest('[data-mp-date-open]')) { event.preventDefault(); openDateSheet(); }
  });

  function enhance() {
    if (!mobile.matches) return;
    if (M()?.route() === 'roomDetail') { enhanceRoom(); return; }
    if (M()?.route() !== 'stayDetail') return;
    const root = $('#stayDetailContent');
    const stay = selectedStay();
    if (!root || !stay || !$('.stay-detail-top', root)) return;
    hero(root);
    keywords(root, stay);
    rooms(root, stay);
    const facility = $('.stay-facility-showcase .amenity-checklist', root);
    if (facility && !facility.dataset.mpFold) {
      facility.dataset.mpFold = '1';
      const items = $$('li', facility);
      if (items.length > 6) {
        facility.classList.add('mp-list-folded');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mp-fold-toggle';
        button.innerHTML = `<span>편의시설 ${items.length}개 모두 보기</span>${M().svg.chevronDown}`;
        button.addEventListener('click', () => {
          const open = facility.classList.toggle('mp-list-open');
          button.classList.toggle('open', open);
          button.querySelector('span').textContent = open ? '접기' : `편의시설 ${items.length}개 모두 보기`;
        });
        facility.after(button);
      }
    }
    $$('.detail-sections-bottom > .info-panel', root).forEach(panel => fold(panel, '더보기', 128));
    const details = $('.stay-description-more', root);
    if (details) $('summary', details).textContent = '숙소 소개 더보기';
    const price = minPrice(stay);
    bar({ price: price ? `숙박 <strong>${esc(M().won(price))}</strong>~` : '객실 확인', label: '객실 선택', onGo: scrollToRooms });
  }

  /* 객실 상세: 사진 → 객실명 → 예약(일정·금액·버튼) → 세부 안내(더보기) */
  function enhanceRoom() {
    const root = $('#roomDetailContent');
    if (!root || !$('.room-detail-hero', root)) return;
    hero(root);
    const card = $('.room-reserve-card', root);
    if (card && !$('.mp-room-when', card)) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'mp-room-when';
      row.dataset.mpDateOpen = '';
      card.prepend(row);
    }
    const v = M()?.values();
    const row = $('.mp-room-when', root);
    if (row && v) {
      const n = M().nights(v.checkIn, v.checkOut);
      const text = `${M().svg.calendar}<span><small>예약 일정</small><strong>${M().short(v.checkIn)} ~ ${M().short(v.checkOut)}${n ? ` · ${n}박` : ''} · ${v.people}명</strong></span><em>변경</em>`;
      if (row.dataset.text !== text) { row.dataset.text = text; row.innerHTML = text; }
    }
    $$('.room-detail-grid > .info-panel', root).forEach(panel => fold(panel, '더보기', 150));
    const primary = $('.room-reserve-card .primary-btn', root);
    const amount = $('.room-reserve-card > strong', root)?.textContent?.trim();
    bar({
      price: amount ? `기본 숙박비 <strong>${esc(amount)}</strong>` : '',
      label: primary?.disabled ? '품절' : '바로 예약하기',
      disabled: !primary || primary.disabled,
      onGo: () => primary?.click(),
    });
  }

  window.mpMobile = Object.assign(window.mpMobile || {}, { openDateSheet, enhanceDetail: enhance });
  const start = () => {
    ['#stayDetailContent', '#roomDetailContent'].forEach(selector => {
      const root = $(selector);
      if (root) new MutationObserver(() => { clearTimeout(start.t); start.t = setTimeout(enhance, 20); }).observe(root, { childList: true });
    });
    window.addEventListener('motf:routechange', () => { closeDateSheet(); setTimeout(() => { M()?.markRoute(); enhance(); }, 30); });
    enhance();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

/* ---------- 장보기 (모바일): 안내 팝업, 공판장 소개, 상품 목록 정렬, 상품 상세 ---------- */
(() => {
  if (window.__mpModule6) return;
  window.__mpModule6 = true;
  const mobile = window.matchMedia('(max-width: 699px)');
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const M = () => window.mpMobile;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const appState = () => (typeof state !== 'undefined' ? state : null);

  /* 1) 장보기 안내 팝업: 모바일에서는 "확인했습니다"로만 닫히게 */
  const guide = () => $('#marketGuideDialog');
  document.addEventListener('cancel', event => {
    if (mobile.matches && event.target === guide()) event.preventDefault();
  }, true);
  document.addEventListener('click', event => {
    const dialog = guide();
    if (!mobile.matches || !dialog?.open) return;
    if (event.target === dialog || event.target.closest('#marketGuideDialog [data-close-motf-dialog]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  /* 사진 묶음을 사이트의 사진 크게 보기 창으로 여는 공통 동작 */
  function photoStrip(images, alt, className) {
    const box = document.createElement('div');
    box.className = `mp-hero ${className || ''}`.trim();
    box.innerHTML = `<div class="mp-hero-track">${images.map((src, index) => `<button type="button" data-open-gallery="${index}" data-mp-gallery aria-label="사진 ${index + 1} 크게 보기"><img src="${esc(src)}" alt="${esc(alt)} 사진 ${index + 1}" ${index ? 'loading="lazy"' : ''} decoding="async"></button>`).join('')}</div>${images.length > 1 ? `<span class="mp-hero-count"><b>1</b> / ${images.length}</span>` : ''}`;
    box._images = images;
    box._alt = alt;
    const track = $('.mp-hero-track', box);
    const count = $('.mp-hero-count b', box);
    track.addEventListener('scroll', () => {
      if (!count) return;
      const text = String(Math.min(images.length, Math.round(track.scrollLeft / Math.max(1, track.clientWidth)) + 1));
      if (count.textContent !== text) count.textContent = text;
    }, { passive: true });
    return box;
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-mp-gallery]');
    const box = button?.closest('.mp-hero');
    const s = appState();
    if (!box?._images || !s) return;
    s.gallery = { images: box._images, index: Number(button.dataset.openGallery || 0), alt: box._alt };
  }, true);

  /* 2) 공판장 소개 */
  function storeImages(store) {
    const list = [store.image, ...(Array.isArray(store.images) ? store.images : [])].filter(Boolean);
    if (store.image && /storefront-close/.test(store.image)) list.push(store.image.replace('storefront-close', 'storefront-wide'));
    return [...new Set(list)];
  }
  function storeTags(store) {
    const counts = {};
    (store.products || []).forEach(product => { const key = product.category || ''; if (key && !/기타|MT 세트/.test(key)) counts[key] = (counts[key] || 0) + 1; });
    const tags = Object.entries(counts).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([key]) => key.replace(/·/g, ''));
    tags.push(/대량/.test(store.intro || '') ? '대량주문가능' : '공판장픽업');
    return tags;
  }
  function enhanceIntro() {
    const intro = $('#marketIntro .market-intro');
    const store = appState()?.selectedStore;
    if (!intro || !store || $('.mp-hero', intro)) return;
    intro.prepend(photoStrip(storeImages(store), store.name, 'mp-store-photos'));
    const body = $('.market-intro-body', intro);
    const eyebrow = $('.eyebrow', body);
    const rating = $('.detail-meta .pill', body)?.textContent?.trim();
    if (eyebrow && rating) eyebrow.innerHTML = `${esc(eyebrow.textContent)} <span class="mp-store-rating">★ ${esc(rating)}</span>`;
    const title = $('h2', body);
    if (title && !$('.mp-store-tags', body)) {
      const tags = document.createElement('p');
      tags.className = 'mp-store-tags';
      tags.innerHTML = storeTags(store).map(tag => `<span>#${esc(tag)}</span>`).join('');
      title.after(tags);
    }
    const row = $('.button-row', body);
    const link = $('.merchant-info-link', body);
    if (row && link) row.prepend(link);
    if (row) intro.append(row);
  }

  /* 3) 상품 목록: 안내 문구 정리 + 정렬 */
  let sortMode = 'recommend';
  const SORTS = [['recommend', '추천순'], ['popular', '인기순'], ['low', '낮은 가격순'], ['high', '높은 가격순']];
  const priceOf = card => Number(($('.home-price', card)?.textContent || '').replace(/[^0-9]/g, '')) || 0;
  const reviewsOf = card => Number((($('.product-review-summary', card)?.textContent || '').match(/\((\d[\d,]*)\)/) || [])[1]?.replace(/,/g, '') || 0);
  function applySort(grid) {
    const cards = $$(':scope > .product-card', grid);
    cards.forEach((card, index) => { if (card.dataset.mpIndex === undefined) card.dataset.mpIndex = index; });
    const sorted = [...cards].sort((a, b) => {
      if (sortMode === 'low') return priceOf(a) - priceOf(b) || a.dataset.mpIndex - b.dataset.mpIndex;
      if (sortMode === 'high') return priceOf(b) - priceOf(a) || a.dataset.mpIndex - b.dataset.mpIndex;
      if (sortMode === 'popular') return reviewsOf(b) - reviewsOf(a) || a.dataset.mpIndex - b.dataset.mpIndex;
      return a.dataset.mpIndex - b.dataset.mpIndex;
    });
    sorted.forEach((card, order) => { card.style.order = String(order); });
  }
  function syncSort(bar) {
    const label = SORTS.find(([value]) => value === sortMode)?.[1] || '추천순';
    const span = $('.mp-sort-btn span', bar);
    if (span.textContent !== label) span.textContent = label;
    $$('[data-mp-sort]', bar).forEach(option => option.setAttribute('aria-selected', String(option.dataset.mpSort === sortMode)));
  }
  function enhanceProducts() {
    const section = $('#marketProducts');
    const grid = $('.product-grid', section);
    if (!section || !grid) return;
    let bar = $('.mp-sort-bar', section);
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'mp-sort-bar';
      bar.innerHTML = `<span class="mp-sort-count"></span><div class="mp-sort"><button type="button" class="mp-sort-btn" aria-haspopup="listbox" aria-expanded="false"><span></span>${M()?.svg.chevronDown || ''}</button><ul class="mp-sort-menu" role="listbox" hidden>${SORTS.map(([value, label]) => `<li><button type="button" role="option" data-mp-sort="${value}">${label}</button></li>`).join('')}</ul></div>`;
      const button = $('.mp-sort-btn', bar);
      const menu = $('.mp-sort-menu', bar);
      const close = () => { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); };
      button.addEventListener('click', () => { menu.hidden = !menu.hidden; button.setAttribute('aria-expanded', String(!menu.hidden)); });
      menu.addEventListener('click', event => {
        const option = event.target.closest('[data-mp-sort]');
        if (!option) return;
        sortMode = option.dataset.mpSort;
        close();
        syncSort(bar);
        applySort($('#marketProducts .product-grid'));
      });
      document.addEventListener('click', event => { if (!event.target.closest('.mp-sort')) close(); });
      grid.before(bar);
    }
    syncSort(bar);
    $$(':scope > .product-card', grid).forEach(card => {
      const actions = $('.product-card-actions', card);
      const mt = $('.home-card-meta > [data-add-mt-shopping]', card);
      if (actions && mt) actions.append(mt);
    });
    const count = $$(':scope > .product-card', grid).length;
    const text = count ? `총 ${count}개` : '';
    if ($('.mp-sort-count', bar).textContent !== text) $('.mp-sort-count', bar).textContent = text;
    applySort(grid);
  }

  /* 3-1) 목록에서 "담기": 옵션·수량을 고르는 창 */
  let cartModal = null;
  let cartState = null;
  function openCartModal(productId) {
    const found = typeof findProduct === 'function' ? findProduct(productId) : null;
    if (!found) return false;
    const variants = (typeof productVariants === 'function' ? productVariants(found.product) : [found.product]).filter(Boolean);
    if (!cartModal) {
      cartModal = document.createElement('div');
      cartModal.className = 'mp-cart-modal';
      cartModal.hidden = true;
      cartModal.innerHTML = `<button type="button" class="mp-cm-backdrop" aria-label="닫기" tabindex="-1"></button><section class="mp-cm-panel" role="dialog" aria-modal="true" aria-label="장바구니 담기"><header class="mp-cm-head"><img alt=""><div><strong></strong><span></span></div></header><div class="mp-cm-variants"></div><div class="mp-cm-qty"><span>수량</span><div class="mp-cm-stepper"><button type="button" data-cm-step="-1" aria-label="수량 줄이기">${M()?.svg.minus || '-'}</button><input type="number" inputmode="numeric" aria-label="수량"><button type="button" data-cm-step="1" aria-label="수량 늘리기">${M()?.svg.plus || '+'}</button></div></div><p class="mp-cm-note"></p><div class="mp-cm-total"><span>합계</span><strong></strong></div><footer class="mp-cm-foot"><button type="button" class="mp-cm-cancel">취소</button><button type="button" class="mp-cm-ok">장바구니 담기</button></footer></section>`;
      document.body.append(cartModal);
      cartModal.addEventListener('click', event => {
        if (event.target.closest('.mp-cm-backdrop, .mp-cm-cancel')) { closeCartModal(); return; }
        const variant = event.target.closest('[data-cm-variant]');
        if (variant) { cartState.productId = variant.dataset.cmVariant; renderCartModal(true); return; }
        const step = event.target.closest('[data-cm-step]');
        if (step) { const r = cartState.rules; cartState.qty = clampQty(cartState.qty + Number(step.dataset.cmStep) * r.step); renderCartModal(); return; }
        if (event.target.closest('.mp-cm-ok')) {
          const { productId: id, qty } = cartState;
          closeCartModal();
          if (typeof addToCart === 'function') addToCart(id, qty);
        }
      });
      $('.mp-cm-stepper input', cartModal).addEventListener('change', event => { cartState.qty = clampQty(Number(event.target.value)); renderCartModal(); });
      cartModal.addEventListener('keydown', event => { if (event.key === 'Escape') closeCartModal(); });
    }
    cartState = { productId: found.product.id, variants, qty: 0, rules: null };
    renderCartModal(true);
    cartModal.hidden = false;
    document.body.classList.add('mp-cart-open');
    $('.mp-cm-ok', cartModal).focus({ preventScroll: true });
    return true;
  }
  function clampQty(value) {
    const r = cartState.rules;
    const n = Math.max(r.minimum, Math.min(1000, Math.round((Number(value) || r.minimum) / r.step) * r.step));
    return n < r.minimum ? r.minimum : n;
  }
  function renderCartModal(reset) {
    const found = findProduct(cartState.productId);
    if (!found) return;
    const product = found.product;
    const rules = typeof productOrderRules === 'function' ? productOrderRules(product) : { minimum: 1, step: 1, unit: '개' };
    cartState.rules = rules;
    if (reset || !cartState.qty) cartState.qty = rules.minimum;
    $('.mp-cm-head img', cartModal).src = product.image;
    $('.mp-cm-head strong', cartModal).textContent = product.name;
    $('.mp-cm-head span', cartModal).textContent = product.variantLabel || product.unit || '';
    const variantsBox = $('.mp-cm-variants', cartModal);
    variantsBox.hidden = cartState.variants.length < 2;
    variantsBox.innerHTML = cartState.variants.length < 2 ? '' : `<p>옵션 선택</p>${cartState.variants.map(item => `<button type="button" data-cm-variant="${esc(item.id)}" class="${item.id === product.id ? 'active' : ''}"><span>${esc(item.variantLabel || item.unit || item.name)}</span><strong>${esc(M()?.won(item.price) || item.price)}</strong></button>`).join('')}`;
    $('.mp-cm-stepper input', cartModal).value = cartState.qty;
    $('.mp-cm-note', cartModal).textContent = rules.minimum > 1 ? `최소 ${rules.minimum}${rules.unit}부터 ${rules.step}${rules.unit} 단위로 주문할 수 있어요.` : '';
    $('.mp-cm-total strong', cartModal).textContent = M()?.won(product.price * cartState.qty) || '';
  }
  function closeCartModal() {
    if (!cartModal || cartModal.hidden) return;
    cartModal.hidden = true;
    document.body.classList.remove('mp-cart-open');
  }
  document.addEventListener('click', event => {
    if (!mobile.matches) return;
    const trigger = event.target.closest('.retained-market-grid [data-add-product], .retained-market-grid .product-option-button');
    if (!trigger) return;
    const id = trigger.dataset.addProduct || trigger.dataset.productId;
    if (openCartModal(id)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('motf:routechange', closeCartModal);

  /* 4) 상품 상세 */
  function enhanceProduct() {
    const root = $('#productDetailContent');
    const product = appState()?.selectedProduct;
    const detail = $('.product-detail', root);
    if (!root || !product || !detail) return;
    const panel = $('.info-panel', detail);
    if (!$('.mp-hero', detail)) {
      const images = [...new Set([product.image, ...(Array.isArray(product.images) ? product.images : [])].filter(Boolean))];
      const strip = photoStrip(images, product.name, 'mp-product-photos');
      if (/cutout/.test($(':scope > img', detail)?.className || '') || product.isCutout) strip.classList.add('is-cutout');
      detail.prepend(strip);
    }
    if (panel && !$('.mp-product-head', panel)) {
      const store = appState()?.selectedStore;
      const head = document.createElement('p');
      head.className = 'mp-product-head';
      head.innerHTML = `<span>${esc(product.isBundle ? 'moTF 할인 패키지' : product.category || '')}</span>${product.manufacturer ? `<span>${esc(product.manufacturer)}</span>` : ''}`;
      $('.eyebrow', panel)?.replaceWith(head);
      const price = $('.price', panel);
      const facts = document.createElement('dl');
      facts.className = 'mp-product-facts';
      const isAlcohol = typeof isAlcoholProduct === 'function' && isAlcoholProduct(product);
      facts.innerHTML = `<div><dt>수령</dt><dd>${esc(store?.name || '제휴 마트')} 픽업${isAlcohol ? ' · <b>성인 본인 수령</b>' : ''}</dd></div><div><dt>판매자</dt><dd>${esc(store?.name || '제휴 마트')}</dd></div><div><dt>용량</dt><dd>${esc(product.unit || '-')}</dd></div><div><dt>안내</dt><dd>수령 전까지 주문 변경 가능</dd></div>`;
      (price || panel.lastElementChild).after(facts);
      const qty = $('.quantity-control', panel);
      if (qty && !qty.parentElement.classList.contains('mp-qty-row')) {
        const row = document.createElement('div');
        row.className = 'mp-qty-row';
        row.innerHTML = '<span>수량</span>';
        qty.before(row);
        row.append(qty);
      }
    }
    const spec = $('.product-spec-table', root);
    if (spec && !spec.dataset.mpFold) {
      spec.dataset.mpFold = '1';
      const rows = $$(':scope > div', spec);
      if (rows.length > 5) {
        spec.classList.add('mp-list-folded');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mp-fold-toggle';
        button.innerHTML = `<span>상세정보 더보기</span>${M()?.svg.chevronDown || ''}`;
        button.addEventListener('click', () => {
          const open = spec.classList.toggle('mp-list-open');
          button.classList.toggle('open', open);
          button.querySelector('span').textContent = open ? '접기' : '상세정보 더보기';
        });
        spec.after(button);
      }
    }
    productBar();
  }
  function productBar() {
    let bar = $('.mp-product-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'mp-product-bar';
      bar.innerHTML = `<button type="button" class="mp-pb-mt" aria-label="내 MT에 담기"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6M9 13h6"/></svg><span>내 MT</span></button><button type="button" class="mp-pb-cart">장바구니 담기</button><button type="button" class="mp-pb-buy">바로 구매</button>`;
      bar.addEventListener('click', event => {
        const root = $('#productDetailContent');
        if (event.target.closest('.mp-pb-mt')) $('[data-add-current-to-mt]', root)?.click();
        if (event.target.closest('.mp-pb-cart')) $('[data-add-current]', root)?.click();
        if (event.target.closest('.mp-pb-buy')) $('[data-buy-current]', root)?.click();
      });
      document.body.append(bar);
    }
  }

  function placeContext() {
    $$('.view > .preparation-context').forEach(context => {
      const back = $(':scope > .back-btn, :scope > .mp-back, :scope > .mt-directory-back', context.parentElement);
      if (back && context.previousElementSibling !== back && back.compareDocumentPosition(context) & Node.DOCUMENT_POSITION_PRECEDING) back.after(context);
    });
  }
  function run() {
    if (!mobile.matches) return;
    placeContext();
    const current = M()?.route();
    if (current === 'market') { enhanceIntro(); enhanceProducts(); }
    if (current === 'productDetail') enhanceProduct();
  }
  const start = () => {
    ['#marketIntro', '#marketProducts', '#productDetailContent'].forEach(selector => {
      const root = $(selector);
      if (root) new MutationObserver(() => { clearTimeout(start.t); start.t = setTimeout(run, 20); }).observe(root, { childList: true });
    });
    window.addEventListener('motf:routechange', () => { setTimeout(run, 40); setTimeout(() => mobile.matches && placeContext(), 400); });
    run();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
