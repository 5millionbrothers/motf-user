(function () {
  'use strict';
  const M = window.MotfBudget;
  const modal = document.createElement('dialog');
  modal.className = 'budget-export-dialog'; modal.setAttribute('aria-labelledby', 'budgetExportTitle'); document.body.append(modal);
  const state = { context: {}, ids: [], sources: [], options: {}, loading: false, busy: false, error: '', token: 0, organizationId: null };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const options = () => M.quickReport(state.context, state.sources, state.options);
  const count = kind => state.sources.filter(row => row.kind === kind).length + (state.context.project?.items || []).filter(row => row.status !== 'cancelled' && row.item_kind === (kind === 'stay' ? 'stay' : 'shopping') && !state.sources.some(source => source.items.some(item => item.offeringId && item.offeringId === row.reference_id))).length;
  function render() {
    const report = options(), hasData = report.budget.length > 0;
    const check = (name, title, detail, disabled = false) => `<label class="budget-option"><input type="checkbox" data-budget-option="${name}" ${state.options[name] ? 'checked' : ''} ${disabled || state.busy ? 'disabled' : ''}><span><strong>${title}</strong><small>${detail}</small></span></label>`;
    modal.innerHTML = `<div class="budget-dialog-head"><span class="budget-dialog-icon"><i data-lucide="file-spreadsheet"></i></span><button type="button" class="budget-icon-button" data-budget-close aria-label="닫기"><i data-lucide="x"></i></button></div><h2 id="budgetExportTitle">예결산 엑셀 받기</h2><p class="budget-context">${escape(state.context.project?.title || '선택한 이용 내역')}</p>
      ${state.loading ? '<p class="budget-status" role="status">예약·주문 내역을 확인하고 있어요.</p>' : `<div class="budget-options">${check('stay', '숙소 비용', `${count('stay')}건`, !count('stay'))}${check('market', '장보기 비용', `${count('market')}건`, !count('market'))}${check('evidence', '주문·결제 내역서 함께 받기', '엑셀과 함께 ZIP으로 · 공식 영수증과 별도')}</div>`}
      ${state.error ? `<p class="budget-error" role="alert">${escape(state.error)} <button type="button" data-budget-retry>다시 시도</button></p>` : !state.loading && !hasData ? '<p class="budget-status">내 MT나 이용 내역에서 포함할 항목을 선택해주세요.</p>' : ''}
      ${!state.loading && hasData ? `<div class="budget-total"><span>예상 지출 합계</span><strong>${report.totals.budgetExpense.toLocaleString('ko-KR')}원</strong></div>` : ''}
      <p class="budget-footnote">참고용 파일이에요. 참가비나 추가 지출은 받은 엑셀에서 자유롭게 수정할 수 있어요.</p><button type="button" class="budget-download" data-budget-download ${state.loading || state.busy || state.error || !hasData ? 'disabled' : ''}><i data-lucide="${state.busy ? 'loader-circle' : 'download'}"></i>${state.busy ? '파일 만드는 중' : state.options.evidence ? '엑셀 + 내역서 받기' : '엑셀 다운로드'}</button>${!state.loading && !hasData && !state.error ? '<button type="button" class="budget-usage-link" data-budget-usage>이용 내역 선택하기</button>' : ''}`;
    window.lucide?.createIcons({ root: modal });
  }
  async function request(includeEvidence = false) {
    const organizationId = state.organizationId, ids = [...state.ids];
    const session = (await window.motfSupabase?.auth.getSession())?.data?.session;
    if (!session?.access_token) throw new Error('로그인 후 이용해주세요.');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/budget-sources', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ organizationId, transactionIds: ids, includeEvidence }) });
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
    state.ids = [...new Set((Array.isArray(selectedIds) ? selectedIds : [selectedIds]).filter(Boolean))];
    state.sources = []; state.busy = false;
    state.options = { stay: true, market: true, evidence: false };
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
      const report = M.quickReport(context, result.sources, selectedOptions);
      if (!report.budget.length) throw new Error('포함할 숙소나 장보기 비용을 선택해주세요.');
      const ExcelJS = await library('ExcelJS', '/vendor/exceljs-4.4.0.min.js');
      const workbook = await M.workbook(report, ExcelJS), bytes = await workbook.xlsx.writeBuffer();
      const name = `${(context.project?.title || 'MT').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 80)}_예결산_참고`;
      let blob, extension = 'xlsx';
      if (selectedOptions.evidence) {
        const JSZip = await library('JSZip', '/vendor/jszip-3.10.1.min.js'), zip = new JSZip();
        zip.file(`${name}.xlsx`, bytes);
        const included = new Set(report.sources.map(row => row.evidenceId));
        result.documents.filter(doc => included.has(doc.id)).forEach(doc => zip.file(`증빙자료/${doc.fileName}`, doc.html));
        zip.file('안내.txt', '참고용 예결산 파일과 모티프 주문·결제내역서입니다. 세금계산서·현금영수증·카드 매출전표가 아닙니다.\n내역서는 브라우저에서 열어 인쇄하거나 PDF로 저장할 수 있습니다.\n');
        blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }); extension = 'zip';
      } else blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      if (token !== state.token) return;
      saveFile(blob, `${name}.${extension}`); modal.close(); window.toast?.('예결산 참고 파일을 만들었어요.');
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
