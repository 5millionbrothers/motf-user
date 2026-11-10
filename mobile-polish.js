/* moTF 모바일 보완 (2026-11-10)
   뒤로가기 버튼이 없던 화면(숙소·객실·상품 상세, 우리 단체 등)에 뒤로가기 버튼을 넣습니다.
   버튼은 mobile-polish.css에서 699px 이하 화면에서만 보이게 되어 있어 PC 화면은 그대로입니다.
   누르면 앱의 기존 [data-history-back] 동작(이전 화면, 없으면 fallback 화면)을 그대로 씁니다. */
(() => {
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
    const selected = list.querySelector('[aria-selected="true"]');
    (selected || list.querySelector('.mp-ss-option:not(:disabled)'))?.scrollIntoView({ block: 'center' });
    (selected || sheet.querySelector('.mp-ss-close')).focus({ preventScroll: true });
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
})();

/* 화면이 다시 그려진 뒤 새로 생긴 날짜칸(input[type=date])에도 사이트 달력(flatpickr)을 붙입니다.
   예: 숙소 상세에서 날짜를 바꾸면 날짜칸이 휴대폰 기본 날짜칸으로 바뀌던 문제. 모바일에서만 동작합니다. */
(() => {
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
