(function () {
  'use strict';
  const M = window.MotfBudget;
  const modal = document.createElement('dialog');
  modal.className = 'budget-export-dialog'; modal.setAttribute('aria-labelledby', 'budgetExportTitle'); document.body.append(modal);
  const state = { context: {}, ids: [], sources: [], options: {}, loading: false, busy: false, error: '', token: 0, organizationId: null };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const options = () => M.exportReport(state.context, state.sources, state.options);
  const count = kind => state.context.project
    ? (state.context.project.items || []).filter(row => row.status !== 'cancelled' && row.item_kind === (kind === 'stay' ? 'stay' : 'shopping')).length
    : state.sources.filter(row => row.paid && row.kind === kind).length;
  function render() {
    const budget = !!state.context.project;
    const report = options(), hasData = budget ? report.budget.length > 0 : report.sources.length > 0;
    const check = (name, title, detail, disabled = false) => `<label class="budget-option"><input type="checkbox" data-budget-option="${name}" ${state.options[name] ? 'checked' : ''} ${disabled || state.busy ? 'disabled' : ''}><span><strong>${title}</strong><small>${detail}</small></span></label>`;
    modal.innerHTML = `<div class="budget-dialog-head"><span class="budget-dialog-icon"><i data-lucide="file-spreadsheet"></i></span><button type="button" class="budget-icon-button" data-budget-close aria-label="닫기"><i data-lucide="x"></i></button></div><h2 id="budgetExportTitle">${budget ? '예산 엑셀 받기' : '결산·증빙 받기'}</h2><p class="budget-context">${escape(state.context.project?.title || '선택한 실결제 내역')}</p>
      ${state.loading ? '<p class="budget-status" role="status">실제 결제 내역을 확인하고 있어요.</p>' : `<div class="budget-options">${check('stay', '숙소 비용', `${count('stay')}건`, !count('stay'))}${check('market', '장보기 비용', `${count('market')}건`, !count('market'))}${budget ? check('other', '기타 예상 비용', '내 MT에 직접 추가한 항목') : check('evidence', '영수증 링크·주문 내역서 함께 받기', '엑셀과 증빙을 ZIP으로 · 공식 영수증은 연결된 결제사에서 확인')}</div>`}
      ${state.error ? `<p class="budget-error" role="alert">${escape(state.error)} <button type="button" data-budget-retry>다시 시도</button></p>` : !state.loading && !hasData ? '<p class="budget-status">내 MT나 이용 내역에서 포함할 항목을 선택해주세요.</p>' : ''}
      ${!state.loading && hasData ? `<div class="budget-total"><span>${budget ? '예상 지출 합계' : '확인된 실제 결제액'}</span><strong>${(budget ? report.totals.budgetExpense : report.totals.cashOut).toLocaleString('ko-KR')}원</strong></div>` : ''}
      <p class="budget-footnote">${budget ? '내 MT에 예산 반영한 비용만 담아요. 결제나 영수증 없이도 만들 수 있는 참고용 예산안이에요.' : '결제가 확인된 내역만 담아요. 현장 추가금은 포함되지 않아요. 주문 내역서는 세금계산서·카드 매출전표·현금영수증을 대신하지 않아요.'}</p><button type="button" class="budget-download" data-budget-download ${state.loading || state.busy || state.error || !hasData ? 'disabled' : ''}><i data-lucide="${state.busy ? 'loader-circle' : 'download'}"></i>${state.busy ? '파일 만드는 중' : state.options.evidence ? '결산 + 증빙 받기' : '엑셀 다운로드'}</button>${!state.loading && !hasData && !state.error ? '<button type="button" class="budget-usage-link" data-budget-usage>이용 내역 선택하기</button>' : ''}`;
    window.lucide?.createIcons({ root: modal });
  }
  async function request(includeEvidence = false) {
    const organizationId = state.organizationId, ids = [...state.ids];
    const session = (await window.motfSupabase?.auth.getSession())?.data?.session;
    if (!session?.access_token) throw new Error('로그인 후 이용해주세요.');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/budget-sources', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ organizationId, transactionIds: ids, includeEvidence, mode: 'settlement' }) });
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
      if (token === state.token) state.sources = result.sources;
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
    state.options = { stay: true, market: true, other: true, evidence: !context.project };
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
      const result = state.ids.length ? await request(selectedOptions.evidence) : { sources: [], documents: [] };
      if (token !== state.token) return;
      const report = M.exportReport(context, result.sources, selectedOptions);
      if (context.project ? !report.budget.length : !report.sources.length) throw new Error(context.project ? '포함할 예상 비용을 선택해주세요.' : '선택한 내역 중 결제가 확인된 거래가 없습니다.');
      const ExcelJS = await library('ExcelJS', '/vendor/exceljs-4.4.0.min.js');
      const workbook = await M.workbook(report, ExcelJS), bytes = await workbook.xlsx.writeBuffer();
      const name = `${(context.project?.title || '모티프 이용내역').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 80)}_${context.project ? '예산안' : '결산'}`;
      let blob, extension = 'xlsx';
      if (selectedOptions.evidence) {
        const JSZip = await library('JSZip', '/vendor/jszip-3.10.1.min.js'), zip = new JSZip();
        zip.file(`${name}.xlsx`, bytes);
        const included = new Set(report.sources.map(row => row.evidenceId));
        result.documents.filter(doc => included.has(doc.id)).forEach(doc => zip.file(`증빙자료/${doc.fileName}`, doc.html));
        zip.file('안내.txt', '모티프 실결제 원장 기준 결산과 주문·결제내역서입니다.\n내역서 자체는 세금계산서·현금영수증·카드 매출전표가 아닙니다.\n공식 영수증은 증빙 목록의 결제사 링크에서 확인·인쇄·PDF 저장해주세요. 링크는 온라인 연결이 필요합니다.\n현금영수증은 결제사에서 발급 완료된 경우에만 제공됩니다. 현장 결제는 포함하지 않습니다.\n');
        blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }); extension = 'zip';
      } else blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      if (token !== state.token) return;
      saveFile(blob, `${name}.${extension}`); modal.close(); window.toast?.(context.project ? '예산안을 만들었어요.' : '결산 파일을 만들었어요.');
    } catch (error) { if (token === state.token) { state.error = error.message; render(); } }
    finally { if (token === state.token) { state.busy = false; if (modal.open) render(); } }
  }
  modal.addEventListener('change', event => { if (event.target.matches('[data-budget-option]')) { const name = event.target.dataset.budgetOption; state.options[name] = event.target.checked; render(); modal.querySelector(`[data-budget-option="${name}"]`)?.focus(); } });
  modal.addEventListener('click', event => {
    if (event.target.closest('[data-budget-close]') || event.target === modal && (event.clientX < modal.getBoundingClientRect().left || event.clientX > modal.getBoundingClientRect().right || event.clientY < modal.getBoundingClientRect().top || event.clientY > modal.getBoundingClientRect().bottom)) modal.close();
    if (event.target.closest('[data-budget-download]')) void download();
    if (event.target.closest('[data-budget-retry]') && !state.busy) void load(state.token);
    if (event.target.closest('[data-budget-usage]')) { modal.close(); window.motfNavigate?.('myUsage'); }
  });
  modal.addEventListener('close', () => { ++state.token; state.sources = []; state.context = {}; state.busy = false; });
  window.addEventListener('motf:organization-changed', () => modal.close());
  window.addEventListener('motf:auth-ready', () => modal.close());
  window.motfOpenBudgetPreview = open;
})();
