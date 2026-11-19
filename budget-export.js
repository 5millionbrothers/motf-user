(function () {
  'use strict';
  const M = window.MotfBudget;
  const modal = document.createElement('dialog');
  modal.className = 'budget-export-dialog'; modal.setAttribute('aria-labelledby', 'budgetExportTitle'); document.body.append(modal);
  const state = { context: {}, ids: [], sources: [], options: {}, loading: false, busy: false, error: '', token: 0, organizationId: null };
  function closeModal() {
    ++state.token;
    Object.assign(state,{context:{}, sources:[], busy:false, loading:false, receiptRows:null});
    if (modal.open) modal.close();
  }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const options = () => M.exportReport(state.context, state.sources, state.options);
  function validReceipt(row) {
    try {
      const url = new URL(row.receiptUrl);
      return url.protocol === 'https:' && !url.username && !url.password && !url.port
        && /(^|\.)(tosspayments\.com|nicepay\.co\.kr)$/.test(url.hostname);
    } catch { return false; }
  }
  const receiptLink = (row, title) => `<a class="budget-download" href="${escape(row.receiptUrl)}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i>${title}</a>`;
  function renderReceipts(head) {
    const rows = state.receiptRows || [], direct = state.context.receiptOnly;
    const links = rows.filter(validReceipt);
    modal.innerHTML = `${head}<h2 id="budgetExportTitle" tabindex="-1">${direct || state.showReceipts ? '증빙자료(영수증)' : '결산 파일을 만들었어요'}</h2>
      ${state.loading ? '<p class="budget-status" role="status">결제 내역을 확인하고 있어요.</p>' : ''}
      ${state.error ? `<p class="budget-error" role="alert">${escape(state.error)} <button type="button" data-budget-retry>다시 시도</button></p>` : ''}
      ${!state.loading && !state.error ? `
        ${direct || state.showReceipts ? `<ul class="budget-receipt-list">${rows.map(row => `<li><div><strong>${escape(row.name)}</strong><small>${escape([row.kind === 'stay' ? '숙소' : '장보기', row.eventDate || row.paidAt?.slice(0, 10), row.cashPaid == null ? '' : row.cashPaid.toLocaleString('ko-KR') + '원', row.orderId].filter(Boolean).join(' · '))}</small></div>${validReceipt(row) ? receiptLink(row, '결제 전표 보기') : '<span>온라인 전표 없음</span>'}</li>`).join('')}</ul>` : '<p class="budget-context">엑셀 다운로드를 시작했어요. 영수증은 결제사 화면에서 별도로 확인할 수 있어요.</p>'}
        ${!links.length ? '<p class="budget-status">이 내역에서 열 수 있는 결제 전표가 없어요. 현장 결제 영수증은 이용한 업체에 문의해주세요.</p>' : !direct && !state.showReceipts ? rows.length === 1 ? receiptLink(links[0], '증빙자료(영수증) 받으러 가기') : '<button type="button" class="budget-download" data-budget-receipts><i data-lucide="receipt-text"></i>증빙자료(영수증) 받으러 가기</button>' : ''}
        ${links.length ? '<p class="budget-footnote">결제 전표는 결제사에서 제공하며, 현금영수증과는 별도입니다.</p>' : ''}
      ` : ''}`;
  }
  const count = kind => state.context.project
    ? (state.context.project.items || []).filter(row => row.status !== 'cancelled' && row.item_kind === (kind === 'stay' ? 'stay' : 'shopping')).length
    : state.sources.filter(row => row.paid && row.kind === kind).length;
  function render() {
    const head = `<div class="budget-dialog-head"><span class="budget-dialog-icon"><i data-lucide="file-spreadsheet"></i></span><button type="button" class="budget-icon-button" data-budget-close aria-label="닫기"><i data-lucide="x"></i></button></div>`;
    if (state.context.receiptOnly || state.receiptRows) {
      renderReceipts(head);
      window.lucide?.createIcons({ root: modal });
      return;
    }
    const budget = !!state.context.project;
    const report = options(), hasData = budget ? report.budget.length > 0 : report.sources.length > 0;
    const check = (name, title, detail, disabled = false) => `<label class="budget-option"><input type="checkbox" data-budget-option="${name}" ${state.options[name] ? 'checked' : ''} ${disabled || state.busy ? 'disabled' : ''}><span><strong>${title}</strong><small>${detail}</small></span></label>`;
    modal.innerHTML = `${head}<h2 id="budgetExportTitle">${budget ? '예산 엑셀 받기' : '결산 엑셀 받기'}</h2><p class="budget-context">${escape(state.context.project?.title || '선택한 실결제 내역')}</p>
      ${state.loading ? '<p class="budget-status" role="status">실제 결제 내역을 확인하고 있어요.</p>' : `<div class="budget-options">${check('stay', '숙소 비용', `${count('stay')}건`, !count('stay'))}${check('market', '장보기 비용', `${count('market')}건`, !count('market'))}${budget ? check('other', '기타 예상 비용', '내 MT에 직접 추가한 항목') : ''}</div>`}
      ${state.error ? `<p class="budget-error" role="alert">${escape(state.error)} <button type="button" data-budget-retry>다시 시도</button></p>` : !state.loading && !hasData ? '<p class="budget-status">내 MT나 이용 내역에서 포함할 항목을 선택해주세요.</p>' : ''}
      ${!state.loading && hasData ? `<div class="budget-total"><span>${budget ? '예상 지출 합계' : '확인된 실제 결제액'}</span><strong>${(budget ? report.totals.budgetExpense : report.totals.cashOut).toLocaleString('ko-KR')}원</strong></div>` : ''}
      <p class="budget-footnote">${budget ? '내 MT에 예산 반영한 비용만 담아요. 결제나 영수증 없이도 만들 수 있는 참고용 예산안이에요.' : '결제가 확인된 내역만 담아요. 현장 추가금은 포함되지 않아요.'}</p><button type="button" class="budget-download" data-budget-download ${state.loading || state.busy || state.error || !hasData ? 'disabled' : ''}><i data-lucide="${state.busy ? 'loader-circle' : 'download'}"></i>${state.busy ? '파일 만드는 중' : '엑셀 다운로드'}</button>${!state.loading && !hasData && !state.error ? '<button type="button" class="budget-usage-link" data-budget-usage>이용 내역 선택하기</button>' : ''}`;
    window.lucide?.createIcons({ root: modal });
  }
  async function request() {
    const organizationId = state.organizationId, ids = [...state.ids];
    const selection = state.context.receiptOnly ? { selections: [{ kind: state.context.kind, id: ids[0] }] } : { transactionIds: ids };
    const session = (await window.motfSupabase?.auth.getSession())?.data?.session;
    if (!session?.access_token) throw new Error('로그인 후 이용해주세요.');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/budget-sources', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ organizationId, ...selection, mode: 'settlement' }) });
      let result;
      try { result = await response.json(); } catch { throw new Error('주문 내역을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'); }
      if (!response.ok || !result.ok) throw new Error(result.message || '주문 내역을 확인하지 못했습니다.');
      return result;
    } finally { clearTimeout(timer); }
  }
  async function load(token) {
    state.loading = true; state.error = ''; render();
    try {
      const result = state.ids.length ? await request() : { sources: [] };
      if (token === state.token) {
        state.sources = result.sources;
        if (state.context.receiptOnly) state.receiptRows = result.sources;
      }
    } catch (error) { if (token === state.token) state.error = error.message; }
    finally { if (token === state.token) { state.loading = false; render(); } }
  }
  async function open(selectedIds = [], context = {}) {
    const token = ++state.token;
    const session = (await window.motfSupabase?.auth.getSession())?.data?.session;
    if (token !== state.token) return;
    if (!session?.user) { window.toast?.('로그인 후 이용해주세요.'); return; }
    state.context = { ...context, organizationName: context.organizationName || window.motfGetOrganizationName?.() || '' };
    state.organizationId = context.project ? context.project.organization_id || null : window.motfGetOrganizationId?.() || null;
    state.ids = context.project ? [] : [...new Set((Array.isArray(selectedIds) ? selectedIds : [selectedIds]).filter(Boolean))];
    state.sources = []; state.busy = false;
    state.options = { stay: true, market: true, other: true };
    state.receiptRows = null; state.showReceipts = false;
    if (!modal.open) modal.showModal();
    await load(token);
  }
  const libraries = new Map();
  function library(name, src) {
    if (window[name]) return Promise.resolve(window[name]);
    if (!libraries.has(name)) libraries.set(name, new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = src;
      script.onload = () => resolve(window[name]);
      script.onerror = () => { libraries.delete(name); script.remove(); reject(new Error('다운로드 도구를 불러오지 못했습니다. 다시 시도해주세요.')); };
      document.head.append(script);
    }));
    return libraries.get(name);
  }
  function saveFile(blob, name) {
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function download() {
    if (state.loading || state.busy || state.error) return;
    const token = state.token, selectedOptions = { ...state.options }, context = structuredClone(state.context);
    state.busy = true; render();
    try {
      const result = state.ids.length ? await request() : { sources: [] };
      if (token !== state.token) return;
      const report = M.exportReport(context, result.sources, selectedOptions);
      if (context.project ? !report.budget.length : !report.sources.length) throw new Error(context.project ? '포함할 예상 비용을 선택해주세요.' : '선택한 내역 중 결제가 확인된 거래가 없습니다.');
      const ExcelJS = await library('ExcelJS', '/vendor/exceljs-4.4.0.min.js');
      const workbook = await M.workbook(report, ExcelJS), bytes = await workbook.xlsx.writeBuffer();
      const name = `${(context.project?.title || '모티프 이용내역').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 80)}_${context.project ? '예산안' : '결산'}`;
      if (token !== state.token) return;
      saveFile(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`);
      if (context.project) { closeModal(); window.toast?.('예산안을 만들었어요.'); }
      else state.receiptRows = report.sources;
    } catch (error) { if (token === state.token) { state.error = error.message; render(); } }
    finally { if (token === state.token) { state.busy = false; if (modal.open) { render(); if (state.receiptRows) modal.querySelector('h2')?.focus(); } } }
  }
  modal.addEventListener('change', event => { if (event.target.matches('[data-budget-option]')) { const name = event.target.dataset.budgetOption; state.options[name] = event.target.checked; render(); modal.querySelector(`[data-budget-option="${name}"]`)?.focus(); } });
  modal.addEventListener('click', event => {
    if (event.target.closest('[data-budget-close]') || event.target === modal && (event.clientX < modal.getBoundingClientRect().left || event.clientX > modal.getBoundingClientRect().right || event.clientY < modal.getBoundingClientRect().top || event.clientY > modal.getBoundingClientRect().bottom)) closeModal();
    if (event.target.closest('[data-budget-download]')) void download();
    if (event.target.closest('[data-budget-receipts]')) { state.showReceipts = true; render(); modal.querySelector('h2')?.focus(); }
    if (event.target.closest('[data-budget-retry]') && !state.busy) void load(state.token);
    if (event.target.closest('[data-budget-usage]')) { closeModal(); window.motfNavigate?.('myUsage'); }
  });
  modal.addEventListener('cancel', event => { event.preventDefault(); closeModal(); });
  window.addEventListener('motf:organization-changed', closeModal);
  window.addEventListener('motf:auth-ready', closeModal);
  window.motfOpenBudgetPreview = open;
})();
