(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MotfBudget = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const sheets = { budget: '예산안', summary: '관항목 및 요약', ledger: '결산 세부내역', checklist: '물품 체크리스트', evidence: '증빙 목록' };
  const defaults = { budget: true, summary: true, ledger: true, checklist: true, evidence: false, links: true, prior: false, logistics: false, approval: false, noncash: true };
  const amount = value => value === '' || value === null || value === undefined ? null : Number(value);
  const text = value => String(value ?? '').slice(0, 2000);
  const day = value => {
    if (!value) return '';
    const parsed = new Date(String(value).length === 10 ? `${value}T00:00:00+09:00` : value);
    return Number.isNaN(parsed.getTime()) ? '' : new Date(parsed.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  };
  const inPeriod = (date, meta) => date && (!meta.start || date >= meta.start) && (!meta.end || date <= meta.end);
  const sum = (rows, key) => rows.reduce((total, row) => total + (Number.isFinite(row[key]) ? row[key] : 0), 0);
  const baseCode = (kind, category) => `${kind === 'income' || kind === 'transfer_in' ? '수' : '지'}-${category === '숙소' ? '111' : category === '장보기' ? '211' : '311'}`;
  function blankEntry(kind = 'expense') {
    return { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, kind, category: kind === 'income' ? '참가비' : '기타', division: 'MT', account: kind === 'income' ? '회비' : '행사비', code: '', name: '', price: '', quantity: 1, budget: '', actual: '', date: '', method: '', note: '', link: '', prior: '', storage: '', pickupPerson: '', arrival: '', pickupPlace: '', roster: '', ordered: false, delivered: false, evidence: '' };
  }
  function build(draft, available = [], planned = []) {
    const meta = draft.meta || {}, options = { ...defaults, ...draft.options };
    const selected = new Set(draft.selected || []), chosen = available.filter(row => selected.has(`${row.kind}:${row.id}`));
    const budget = [], ledger = [], checklist = [], warnings = [], errors = [];
    if (!text(meta.title).trim()) errors.push('문서 이름을 입력해주세요.');
    if (amount(meta.people) !== null && (!Number.isSafeInteger(Number(meta.people)) || Number(meta.people) < 1)) errors.push('인원은 1명 이상의 정수로 입력해주세요.');
    if (meta.start && meta.end && meta.start > meta.end) errors.push('집계 시작일이 종료일보다 늦습니다.');
    const opening = amount(meta.opening);
    if (opening !== null && (!Number.isSafeInteger(opening) || opening < 0)) errors.push('기초 잔액은 0 이상의 정수로 입력해주세요.');
    if (!['budget', 'summary', 'ledger', 'checklist', 'evidence'].some(key => options[key])) errors.push('생성할 시트를 하나 이상 선택해주세요.');
    function addBudget(row) { budget.push({ ...row, index: budget.length + 1 }); }
    chosen.forEach(source => {
      const category = source.kind === 'stay' ? '숙소' : '장보기', code = baseCode('expense', category);
      source.items.forEach((item, index) => {
        const annotation = draft.annotations?.[`${source.kind}:${source.id}:${index}`] || {};
        if (amount(annotation.prior) !== null && (!Number.isSafeInteger(Number(annotation.prior)) || Number(annotation.prior) < 0)) errors.push(`${item.name}: 전년도 금액을 확인해주세요.`);
        const line = { ...blankEntry(), ...annotation, kind: 'expense', category, division: 'MT', account: '행사비', code, name: `${source.name} / ${item.name}`, price: item.price, quantity: item.quantity, budget: item.price !== null && item.quantity !== null ? item.price * item.quantity : null, actual: null, method: source.methodLabel || source.method || '모티프 주문', note: annotation.note || '', sourceId: source.id, evidence: options.evidence ? source.evidenceId : '', verified: true };
        addBudget(line);
        checklist.push({ ...line, ordered: true, delivered: source.status === 'completed', storage: annotation.storage || '', pickupPerson: annotation.pickupPerson || '', arrival: annotation.arrival || '', pickupPlace: annotation.pickupPlace || '', roster: annotation.roster || '' });
      });
      if (source.paid && inPeriod(day(source.paidAt), meta)) ledger.push({ kind: 'expense', category, division: 'MT', account: '행사비', code, name: `${source.name} 결제`, date: day(source.paidAt), cashIn: 0, cashOut: source.cashPaid, evidence: options.evidence ? source.evidenceId : '', note: `상품 ${source.gross ?? '미확인'}원 / 포인트 ${source.points}P / 쿠폰 ${source.coupon}원`, sourceId: source.id, points: source.points, coupon: source.coupon, method: source.method });
      if (!source.paid) warnings.push(`${source.name}: 원결제 확인 전이므로 예산에만 포함됩니다.`);
      if (['cancelled', 'rejected'].includes(source.status)) warnings.push(`${source.name}: 취소·거절된 거래가 선택되어 있습니다. 예산 포함 여부를 확인해주세요.`);
      if (source.gross !== null && sum(source.items.map(item => ({ value: item.price !== null && item.quantity !== null ? item.price * item.quantity : 0 })), 'value') !== source.gross) warnings.push(`${source.name}: 품목 합계와 주문 금액이 다릅니다. 할인·추가 금액의 예산 반영을 확인해주세요.`);
      if (source.refundStatus === 'refunded' && source.refundedAt) {
        if (source.cashRefund === null) warnings.push(`${source.name}: 현금·포인트 환불 구분을 확인할 수 없어 환불액을 원장에 넣지 않았습니다.`);
        else if (source.cashRefund > 0 && inPeriod(day(source.refundedAt), meta)) ledger.push({ kind: 'income', category: '환불', division: 'MT', account: '환불', code: '수-411', name: `${source.name} 결제 취소`, date: day(source.refundedAt), cashIn: source.cashRefund, cashOut: 0, evidence: options.evidence ? source.evidenceId : '', note: 'PG 취소 완료일 기준. 실제 입금·한도 복원 시점은 결제수단별로 다름.', sourceId: source.id });
      } else if (['required', 'processing', 'failed'].includes(source.refundStatus)) warnings.push(`${source.name}: 환불 완료 확인 전이며 수입에 포함하지 않았습니다.`);
      if (source.paid && !inPeriod(day(source.paidAt), meta)) warnings.push(`${source.name}: 결제일이 집계 기간 밖이라 결산에서 제외했습니다.`);
    });
    const selectedPlans = new Set(draft.planned || []);
    planned.filter(row => selectedPlans.has(String(row.id))).forEach(row => {
      if (chosen.some(source => source.items.some(item => item.offeringId && item.offeringId === row.reference_id))) errors.push(`${row.title}: 주문 내역과 MT 후보가 겹칩니다. 예산에 넣을 항목을 하나만 선택해주세요.`);
      addBudget({ ...blankEntry(), kind: 'expense', category: row.item_kind === 'stay' ? '숙소' : row.item_kind === 'shopping' ? '장보기' : '기타', name: row.title, price: amount(row.amount), quantity: amount(row.quantity) ?? 1, budget: amount(row.amount) === null ? null : Number(row.amount) * (Number(row.quantity) || 1), note: 'MT 준비 후보 (미결제 예상 금액)', planned: true });
    });
    for (const [index, entry] of (draft.entries || []).entries()) {
      if (!text(entry.name).trim()) { errors.push(`직접 입력 ${index + 1}번 항목의 이름을 입력해주세요.`); continue; }
      const price = amount(entry.price), quantity = amount(entry.quantity), override = amount(entry.budget), actual = amount(entry.actual), prior = amount(entry.prior);
      for (const [label, value] of [['단가', price], ['수량', quantity], ['예산', override], ['결산', actual], ['전년도 금액', prior]]) if (value !== null && (!Number.isFinite(value) || value < 0 || (label !== '수량' && !Number.isSafeInteger(value)))) errors.push(`${entry.name}: ${label}을 확인해주세요.`);
      if (quantity !== null && quantity <= 0) errors.push(`${entry.name}: 수량은 0보다 커야 합니다.`);
      if (actual !== null && !day(entry.date)) errors.push(`${entry.name}: 결산 금액을 입력했다면 실제 거래일도 입력해주세요.`);
      const kind = ['income', 'expense', 'transfer_in', 'transfer_out'].includes(entry.kind) ? entry.kind : 'expense';
      const row = { ...entry, kind, category: text(entry.category) || '기타', name: text(entry.name), price, quantity, budget: override !== null ? override : price !== null && quantity !== null ? Math.round(price * quantity) : null, override: override !== null, actual, prior, code: text(entry.code) || baseCode(kind, entry.category), note: text(entry.note), verified: false };
      if (row.budget !== null && !Number.isSafeInteger(row.budget)) errors.push(`${entry.name}: 계산된 금액이 처리 가능한 범위를 넘습니다.`);
      addBudget(row);
      if (kind === 'expense') checklist.push(row);
      if (actual !== null && day(entry.date) && inPeriod(day(entry.date), meta)) ledger.push({ ...row, date: day(entry.date), cashIn: ['income', 'transfer_in'].includes(kind) ? actual : 0, cashOut: ['expense', 'transfer_out'].includes(kind) ? actual : 0, note: `${row.note}${row.note ? ' / ' : ''}사용자 직접 입력`, evidence: options.evidence ? text(entry.evidence) : '' });
      if (actual !== null && day(entry.date) && !inPeriod(day(entry.date), meta)) warnings.push(`${row.name}: 집계 기간 밖이라 결산에서 제외했습니다.`);
    }
    ledger.sort((a, b) => a.date.localeCompare(b.date));
    let balance = opening;
    ledger.forEach((row, index) => { if (balance !== null) balance += row.cashIn - row.cashOut; row.balance = balance; row.index = index + 1; });
    if (budget.some(row => row.budget === null)) warnings.push('미정 예산은 공란으로 남기며 합계는 확인된 금액만 더합니다.');
    if (opening === null && ledger.length) warnings.push('기초 잔액이 없어 누적잔액은 공란으로 남깁니다.');
    const totals = { budgetIncome: sum(budget.filter(row => row.kind === 'income'), 'budget'), budgetExpense: sum(budget.filter(row => row.kind === 'expense'), 'budget'), cashIn: sum(ledger, 'cashIn'), cashOut: sum(ledger, 'cashOut'), balance };
    return { meta, options, budget, ledger, checklist, sources: chosen, warnings: [...new Set(warnings)], errors: [...new Set(errors)], totals };
  }
  const F = (formula, result) => ({ formula, result });
  function column(index) { let name = ''; for (let value = index; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name; return name; }
  function sheet(name, headers, widths, report) {
    return { name, widths, rows: [[], [report.meta.title || 'MT 예결산', ...Array(headers.length - 1).fill(null)], [`${report.meta.organization || '개인 MT'} | 작성자 ${report.meta.preparer || '-'} | 작성일 ${report.meta.reportDate || '-'}`], [`집계 ${report.meta.start || '전체'} ~ ${report.meta.end || '전체'} | ${report.meta.people || '-'}명 | ${report.meta.account || '계좌 표기 안 함'}${report.options.approval ? ` | 검토 ${report.meta.reviewer || '-'} / 승인 ${report.meta.approver || '-'}` : ''}`], [], headers], header: 6, bands: [], totals: [], numeric: [], dates: [], entryRows: {}, merges: [`A2:${column(headers.length)}2`, `A3:${column(headers.length)}3`, `A4:${column(headers.length)}4`] };
  }
  function standardSpecs(report) {
    const output = [], o = report.options;
    if (o.budget) {
      const headers = ['수입·지출', '분류', '#', '항목', '단가', '수량', '합계', '구매 방식', '비고'];
      if (o.links) headers.push('구매링크');
      const s = sheet(sheets.budget, headers, [12, 16, 6, 34, 16, 9, 18, 17, 42, 32], report);
      const anchors = {};
      for (const [kind, label] of [['income', '수입'], ['expense', '지출'], ['transfer_in', '계좌이체 입금'], ['transfer_out', '계좌이체 출금']]) {
        const rows = report.budget.filter(row => row.kind === kind);
        if (!rows.length && kind.startsWith('transfer')) continue;
        s.bands.push(s.rows.length + 1); s.rows.push([label]);
        const start = s.rows.length + 1;
        rows.forEach((row, index) => {
          const n = s.rows.length + 1;
          s.entryRows[row.index] = n;
          s.rows.push([label, row.category, index + 1, row.name, row.price, row.quantity, row.override ? row.budget : F(`IF(COUNT(E${n}:F${n})=2,ROUND(E${n}*F${n},0),"")`, row.budget ?? ''), row.method, row.note, ...(o.links ? [row.link || ''] : [])]);
        });
        const n = s.rows.length + 1;
        s.rows.push([`${label} 소계`, null, null, null, null, null, F(rows.length ? `SUM(G${start}:G${n - 1})` : '0', sum(rows, 'budget'))]);
        anchors[kind] = n; s.totals.push(n);
      }
      s.rows.push(['수입 - 지출', null, null, null, null, null, F(`G${anchors.income}-G${anchors.expense}`, report.totals.budgetIncome - report.totals.budgetExpense)]); s.totals.push(s.rows.length);
      s.rows.push([], ['기타 사항', report.meta.note || ''], ['미정 금액', '공란은 미정이며 합계는 확인된 항목만 포함합니다. 계좌이체는 행사 손익과 분리합니다.']);
      s.merges.push(`B${s.rows.length - 1}:${column(headers.length)}${s.rows.length - 1}`, `B${s.rows.length}:${column(headers.length)}${s.rows.length}`);
      s.numeric = [5, 6, 7]; output.push(s);
    }
    if (o.ledger) {
      const headers = ['코드', '거래일자', '순서', '설명', '입금', '출금', '누적잔액', ...(o.evidence ? ['증빙자료'] : []), '비고'];
      if (o.noncash) headers.push('포인트 사용', '쿠폰 할인');
      const s = sheet(sheets.ledger, headers, [12, 14, 7, 34, 17, 17, 18, ...(o.evidence ? [44] : []), 48, 15, 15], report);
      s.rows[4] = ['기초 잔액', amount(report.meta.opening), '플랫폼 처리일·직접 입력 기준. 실제 은행 입출금·잔액과 다를 수 있습니다.']; s.merges.push(`C5:${column(headers.length)}5`);
      report.ledger.forEach((row, index) => {
        const n = s.rows.length + 1;
        const balance = F(`IF(ISNUMBER($B$5),${index ? `G${n - 1}` : '$B$5'}+E${n}-F${n},"")`, row.balance === null ? '' : row.balance);
        s.rows.push([row.code, new Date(`${row.date}T00:00:00Z`), index + 1, row.name, row.cashIn, row.cashOut, balance, ...(o.evidence ? [row.evidence] : []), row.note, ...(o.noncash ? [row.points || 0, row.coupon || 0] : [])]);
      });
      const n = s.rows.length + 1, end = n - 1;
      s.rows.push(['합계', null, null, null, F(end >= 7 ? `SUM(E7:E${end})` : '0', report.totals.cashIn), F(end >= 7 ? `SUM(F7:F${end})` : '0', report.totals.cashOut), report.totals.balance === null ? null : F(end >= 7 ? `G${end}` : String(amount(report.meta.opening)), report.totals.balance)]); s.totals.push(n);
      s.numeric = [5, 6, 7, ...(o.noncash ? [headers.length - 1, headers.length] : [])]; s.dates = [2]; output.push(s);
    }
    if (o.summary) {
      const headers = ['구분', '관', '항', '목 / 코드', '예산', '결산', '비율(%)', '예산 대비(%)', ...(o.prior ? ['전년도 금액', '전년 대비(%)'] : []), '예산 책정 근거 / 비고'];
      const s = sheet(sheets.summary, headers, [12, 17, 18, 26, 18, 18, 13, 16, ...(o.prior ? [18, 16] : []), 48], report);
      const categoryRows = [];
      for (const kind of ['income', 'expense', 'transfer_in', 'transfer_out']) {
        const classification = row => JSON.stringify([row.category, row.division || 'MT', row.account || (row.kind === 'income' ? '회비' : '행사비'), row.code || baseCode(row.kind, row.category)]);
        const categories = [...new Set([...report.budget.filter(row => row.kind === kind), ...report.ledger.filter(row => row.kind === kind)].map(classification))];
        const sameKind = report.ledger.filter(row => row.kind === kind), valueColumn = kind === 'income' || kind === 'transfer_in' ? 'cashIn' : 'cashOut';
        const subtotal = sum(sameKind, valueColumn), start = s.rows.length + 1;
        categories.forEach(group => {
          const b = report.budget.filter(row => row.kind === kind && classification(row) === group), l = report.ledger.filter(row => row.kind === kind && classification(row) === group);
          const category = (b[0] || l[0]).category;
          const bv = b.length && b.every(row => row.budget !== null) ? sum(b, 'budget') : null;
          const av = l.length ? sum(l, kind === 'income' || kind === 'transfer_in' ? 'cashIn' : 'cashOut') : null;
          const pv = b.length && b.every(row => amount(row.prior) !== null) ? sum(b.map(row => ({ prior: amount(row.prior) })), 'prior') : null;
          const n = s.rows.length + 1;
          const budgetRefs = output.find(item => item.name === sheets.budget);
          const ledgerRefs = output.find(item => item.name === sheets.ledger);
          const br = budgetRefs ? b.map(row => `'${sheets.budget}'!G${budgetRefs.entryRows[row.index]}`) : [];
          // Ledger descriptions are not unique; keep the source index mapping instead of matching text.
          const lr = ledgerRefs ? report.ledger.flatMap((row, index) => row.kind === kind && classification(row) === group ? [`'${sheets.ledger}'!${kind === 'income' || kind === 'transfer_in' ? 'E' : 'F'}${index + 7}`] : []) : [];
          s.rows.push([{ income: '수입', expense: '지출', transfer_in: '계좌이체 입금', transfer_out: '계좌이체 출금' }[kind], b[0]?.division || l[0]?.division || 'MT', b[0]?.account || l[0]?.account || category, `${category} / ${b[0]?.code || l[0]?.code || baseCode(kind, category)}`, bv === null ? null : br.length ? F(br.join('+'), bv) : bv, av === null ? null : lr.length ? F(lr.join('+'), av) : av, av === null || !subtotal ? null : F(`IFERROR(F${n}/SUM(F${start}:F${start + categories.length - 1}),"")`, av / subtotal), bv === null || bv === 0 || av === null ? null : F(`IFERROR(F${n}/E${n},"")`, av / bv), ...(o.prior ? [pv, pv === null || pv === 0 || av === null ? null : F(`IFERROR(F${n}/I${n},"")`, av / pv)] : []), b.map(row => row.note).filter(Boolean).join(' / ') || '결제액 기준 (할인·포인트 제외)']);
          categoryRows.push({ n, kind, budget: bv, actual: av });
        });
      }
      const summaryTotals = {};
      for (const [kind, label] of [['income', '수입 합계'], ['expense', '지출 합계']]) {
        const rows = categoryRows.filter(row => row.kind === kind), n = s.rows.length + 1;
        const budget = sum(rows.map(row => ({ value: row.budget })), 'value'), actual = sum(rows.map(row => ({ value: row.actual })), 'value');
        summaryTotals[kind] = { n, budget, actual };
        s.rows.push([label, null, null, null, F(rows.map(row => `E${row.n}`).join('+') || '0', budget), F(rows.map(row => `F${row.n}`).join('+') || '0', actual)]); s.totals.push(n);
      }
      s.rows.push(['수입 - 지출', null, null, null, F(`E${summaryTotals.income.n}-E${summaryTotals.expense.n}`, summaryTotals.income.budget - summaryTotals.expense.budget), F(`F${summaryTotals.income.n}-F${summaryTotals.expense.n}`, summaryTotals.income.actual - summaryTotals.expense.actual)]); s.totals.push(s.rows.length);
      s.rows.push([], ['비교 기준', '예산은 상품 금액, 결산은 실제 결제·직접 입력 금액입니다. 공란은 미입력/미확인이며 0%로 표시하지 않습니다.']); s.merges.push(`B${s.rows.length}:${column(headers.length)}${s.rows.length}`);
      s.numeric = [5, 6, ...(o.prior ? [9] : [])]; s.percent = [7, 8, ...(o.prior ? [10] : [])]; output.push(s);
    }
    if (o.checklist) {
      const headers = ['분류', '#', '항목', '수량', '주문 완료', '배송·수령 완료', ...(o.logistics ? ['보관 장소', '픽업인원', '도착', '픽업장소', '물품', '명단'] : []), '비고'];
      const s = sheet(sheets.checklist, headers, [16, 6, 38, 10, 14, 17, ...(o.logistics ? [23, 20, 19, 24, 30, 28] : []), 40], report);
      report.checklist.forEach((row, index) => s.rows.push([row.category, index + 1, row.name, row.quantity, row.ordered ? '완료' : '확인 필요', row.delivered ? '완료' : '확인 필요', ...(o.logistics ? [row.storage, row.pickupPerson, row.arrival, row.pickupPlace, row.name, row.roster] : []), row.note])); output.push(s);
    }
    if (o.evidence) {
      const s = sheet(sheets.evidence, ['증빙번호', '거래 / 품목', '결제일', '실제 결제액', '현금 취소액', '결제·환불 상태', '주문번호', '공식 영수증 링크', '제공 자료'], [45, 35, 15, 18, 18, 28, 43, 44, 44], report);
      report.sources.forEach(row => s.rows.push([row.evidenceId, row.name, row.paidAt ? new Date(`${day(row.paidAt)}T00:00:00Z`) : null, row.cashPaid, row.refundedAt ? row.cashRefund : null, `${row.paid ? '결제 확인' : '결제 확인 전'} / ${row.refundLabel || row.refundStatus}`, row.orderId, row.receiptUrl || '미제공', `증빙자료/${row.evidenceId}.html`]));
      report.budget.filter(row => !row.verified && row.evidence).forEach(row => s.rows.push([row.evidence, row.name, row.date ? new Date(`${day(row.date)}T00:00:00Z`) : null, row.actual, null, '사용자 직접 입력 / 외부 증빙', null, row.link || '', '외부 영수증 별도 첨부 필요']));
      s.numeric = [4, 5]; s.dates = [3]; output.push(s);
    }
    return output;
  }
  function quickReport(context = {}, sources = [], selected = {}) {
    const project = context.project || {}, include = { stay: true, market: true, ...selected };
    const chosen = sources.filter(row => row.kind === 'stay' ? include.stay : include.market);
    const plans = (project.items || []).filter(row => row.status !== 'cancelled'
      && (row.item_kind === 'stay' ? include.stay : row.item_kind === 'shopping' ? include.market : true)
      && !chosen.some(source => source.items.some(item => item.offeringId && item.offeringId === row.reference_id)));
    return build({ meta: { referenceOnly: true, title: `${project.title || 'MT'} 예결산안`, organization: context.organizationName || project.organization_name || '', people: project.guest_count || '', reportDate: day(new Date().toISOString()), opening: '', travelPeriod: project.starts_on ? `${project.starts_on} ~ ${project.ends_on || ''}` : '' }, options: { ...defaults, budget: true, summary: false, ledger: false, checklist: false, evidence: !!include.evidence, links: false, noncash: true }, selected: chosen.map(row => `${row.kind}:${row.id}`), planned: plans.map(row => String(row.id)), entries: [] }, chosen, plans);
  }
  function referenceSpecs(report) {
    const s = sheet('예결산안', ['구분', '분류', '#', '항목', '단가', '수량', '예상 금액', '실제 결제액', '환불액', '구매 방식', '비고'], [8, 12, 5, 32, 13, 7, 15, 15, 13, 11, 30], report);
    s.compact = true;
    const incomeStart = 8;
    s.bands.push(7); s.rows.push(['수입']);
    for (const [index, name] of ['참가비', '지원금'].entries()) {
      const n = s.rows.length + 1;
      s.rows.push(['수입', name, index + 1, name, null, null, F(`IF(COUNT(E${n}:F${n})=2,ROUND(E${n}*F${n},0),"")`, ''), null, null, null, '단가·수량 직접 입력']);
    }
    const incomeTotal = s.rows.length + 1;
    s.rows.push(['수입 소계', null, null, null, null, null, F(`IF(COUNT(G${incomeStart}:G${incomeTotal - 1})>0,SUM(G${incomeStart}:G${incomeTotal - 1}),"")`, '')]); s.totals.push(incomeTotal);
    s.bands.push(s.rows.length + 1); s.rows.push(['지출']);
    const start = s.rows.length + 1, sourceRows = new Map();
    for (const [index, row] of report.budget.entries()) {
      const n = s.rows.length + 1, source = report.sources.find(item => item.id === row.sourceId);
      const seen = source && sourceRows.has(source.evidenceId);
      const refund = source?.refundedAt ? source.cashRefund : source?.refundStatus === 'none' ? 0 : null;
      const note = source ? [source.paid ? '결제 완료' : '결제 확인 전', source.points ? `포인트 ${source.points.toLocaleString('ko-KR')}P` : '', source.coupon ? `쿠폰 ${source.coupon.toLocaleString('ko-KR')}원` : '', source.refundStatus !== 'none' ? source.refundLabel || source.refundStatus : ''].filter(Boolean).join(' · ') : '내 MT 예상 비용';
      s.rows.push(['지출', row.category, index + 1, row.name, row.price, row.quantity, F(`IF(COUNT(E${n}:F${n})=2,ROUND(E${n}*F${n},0),"")`, row.budget ?? ''), source && !seen ? source.cashPaid : null, source && !seen ? refund : null, row.method || '', note]);
      if (source) {
        const group = sourceRows.get(source.evidenceId) || [];
        group.push(n); sourceRows.set(source.evidenceId, group);
      }
    }
    for (const rows of sourceRows.values()) if (rows.length > 1) for (const col of ['H', 'I']) s.merges.push(`${col}${rows[0]}:${col}${rows.at(-1)}`);
    const total = s.rows.length + 1, last = total - 1;
    const paid = report.sources.filter(row => row.paid).reduce((value, row) => value + row.cashPaid, 0);
    const refund = report.sources.reduce((value, row) => value + (row.refundedAt ? row.cashRefund || 0 : 0), 0);
    s.rows.push(['지출 소계', null, null, null, null, null, F(report.budget.length ? `SUM(G${start}:G${last})` : '0', report.totals.budgetExpense), report.budget.length ? F(`IF(COUNT(H${start}:H${last})>0,SUM(H${start}:H${last}),"")`, report.sources.some(row => row.paid) ? paid : '') : null, report.budget.length ? F(`IF(COUNT(I${start}:I${last})>0,SUM(I${start}:I${last}),"")`, report.sources.some(row => row.paid && (row.refundedAt || row.refundStatus === 'none')) ? refund : '') : null]); s.totals.push(total);
    s.rows.push(['예상 잔액', null, null, null, null, null, F(`IF(ISNUMBER(G${incomeTotal}),G${incomeTotal}-G${total},"")`, '')]); s.totals.push(s.rows.length);
    s.rows.push(['실제 순지출', null, null, null, null, null, null, F(`IF(ISNUMBER(H${total}),H${total}-I${total},"")`, report.sources.some(row => row.paid) ? paid - refund : ''), null, null, '확인된 결제액 - 확인된 환불액']); s.totals.push(s.rows.length);
    s.rows.push([], ['참고 사항', '예상 금액은 상품 가격, 실제 결제액은 포인트·쿠폰을 제외한 결제 금액입니다. 미확인 금액은 공란입니다.']);
    s.merges.push(`B${s.rows.length}:K${s.rows.length}`);
    s.bands.forEach(n => s.merges.push(`A${n}:K${n}`));
    s.totals.forEach(n => s.merges.push(`A${n}:F${n}`));
    s.numeric = [5, 6, 7, 8, 9];
    const extras = standardSpecs({ ...report, checklist: report.checklist.filter(row => row.category !== '숙소'), options: { ...report.options, budget: false, summary: false, ledger: false } });
    for (const spec of [s, ...extras]) {
      spec.rows[2] = [`${report.meta.organization || 'MT 준비'}${report.meta.people ? ` · ${report.meta.people}명` : ''}${report.meta.travelPeriod ? ` · ${report.meta.travelPeriod}` : ''}`];
      spec.rows[3] = [`참고용 · 작성일 ${report.meta.reportDate} · 단위: 원`];
      spec.rows[4] = [];
    }
    return [s, ...extras];
  }
  function specs(report) { return report.meta.referenceOnly ? referenceSpecs(report) : standardSpecs(report); }
  async function workbook(report, ExcelJS) {
    if (report.errors.length) throw new Error(report.errors.join('\n'));
    const wb = new ExcelJS.Workbook(); wb.creator = '모티프(moTF)'; wb.calcProperties.fullCalcOnLoad = true;
    for (const spec of specs(report)) {
      const ws = wb.addWorksheet(spec.name, { views: [{ state: 'frozen', ySplit: 6, showGridLines: false }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:6', margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 } } });
      ws.columns = spec.widths.slice(0, spec.rows[5].length).map(width => ({ width }));
      spec.rows.forEach((values, index) => {
        const row = ws.addRow(Array.from({ length: spec.rows[5].length }, (_, col) => values[col] === '' ? null : values[col] ?? null)); row.height = index === 1 ? 30 : 28;
        row.eachCell({ includeEmpty: true }, cell => {
          cell.font = { name: '맑은 고딕', size: 11, color: { argb: 'FF242B27' } };
          cell.alignment = { vertical: 'middle', wrapText: true, indent: 1, horizontal: typeof cell.value === 'number' || cell.value?.formula ? 'right' : 'left' };
          if (index >= 6) cell.border = { bottom: { style: 'hair', color: { argb: 'FFD9DFD6' } } };
          if (index === 5 || spec.bands.includes(index + 1) || spec.totals.includes(index + 1)) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index === 5 ? 'FFFFE599' : spec.bands.includes(index + 1) ? (String(values[0]).includes('지출') ? 'FFF4CCCC' : 'FFFFF2CC') : 'FFEDF1E8' } };
            cell.font.bold = true;
          }
          if (index === 5) cell.alignment.horizontal = 'center';
          if (index >= 6 && spec.numeric?.includes(cell.col)) cell.numFmt = '#,##0;[Red](#,##0);"-"';
          if (index >= 6 && spec.percent?.includes(cell.col)) cell.numFmt = '0.0%;[Red](0.0%);"-"';
          if (index >= 6 && spec.dates?.includes(cell.col)) cell.numFmt = 'yyyy-mm-dd';
          if (cell.value?.formula) cell.font.color = { argb: spec.name !== sheets.summary && cell.value.formula.includes('!') ? 'FF496344' : 'FF242B27' };
          if (index >= 6 && typeof cell.value === 'string' && ['구매링크', '공식 영수증 링크'].includes(spec.rows[5][cell.col - 1]) && /^https?:\/\//i.test(cell.value)) {
            cell.value = { text: cell.value, hyperlink: cell.value };
            cell.font.color = { argb: 'FF265B9B' }; cell.font.underline = true;
          }
          if (index >= 6 && spec.name === sheets.evidence && cell.col === 9 && typeof cell.value === 'string' && /^증빙자료\/[SM]-[a-f0-9-]+\.html$/i.test(cell.value)) {
            cell.value = { text: cell.value, hyperlink: cell.value };
            cell.font.color = { argb: 'FF265B9B' }; cell.font.underline = true;
          }
        });
        const longest = Math.max(0, ...values.map((value, col) => Math.ceil(String(value instanceof Date ? '2026-11-09' : value?.formula ? value.result : value ?? '').length / Math.max(8, (spec.widths[col] || 22) / 1.5))));
        if (index >= 6) row.height = Math.max(28, longest * 16 + 10);
      });
      spec.merges.forEach(range => ws.mergeCells(range));
      spec.merges.forEach(range => { const [from, to] = range.split(':').map(cell => Number(cell.match(/\d+/)[0])); if (from > 6 && from === to) ws.getRow(from).height = 38; });
      if (spec.name === sheets.ledger) ws.getCell('B5').numFmt = '#,##0';
      ws.getCell('A2').font = { name: '맑은 고딕', size: 16, bold: true, color: { argb: 'FF242B27' } };
      if (spec.compact) {
        ws.getRow(1).height = 10;
        ws.getRow(3).height = 22;
        ws.getRow(4).height = 22;
        ws.getRow(5).height = 10;
        ws.getRow(6).height = 32;
        ws.views = [{ state: 'frozen', ySplit: 6, showGridLines: false, zoomScale: 90 }];
        for (let n = 6; n <= ws.rowCount; n++) {
          const row = ws.getRow(n), band = spec.bands.includes(n), total = spec.totals.includes(n);
          if (n > 6) row.height = Math.max(30, row.height);
          row.eachCell({ includeEmpty: true }, cell => {
            const fill = n === 6 ? 'FFF4E7B8' : band ? 'FFF5F6F1' : total ? 'FFEDF1E8' : null;
            if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
            if (band || total) cell.border = { top: { style: 'thin', color: { argb: 'FFD6DDCF' } }, bottom: { style: 'thin', color: { argb: 'FFD6DDCF' } } };
            if (n > 6 && n < spec.totals.at(-1) && !band && !total && [1, 2, 3, 6, 10].includes(cell.col)) cell.alignment = { ...cell.alignment, horizontal: 'center', indent: 0 };
          });
        }
        for (const n of [8, 9]) for (const col of ['E', 'F']) {
          ws.getCell(`${col}${n}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFAEB' } };
        }
        ws.getCell('A4').font = { name: '맑은 고딕', size: 10, color: { argb: 'FF77806E' } };
      }
      if (spec.widths.reduce((total, width) => total + width, 0) > 180) ws.pageSetup.paperSize = 8;
      ws.pageSetup.printArea = `A1:${column(ws.columnCount)}${ws.rowCount}`;
      ws.headerFooter.oddFooter = '&L모티프 예결산&R&P / &N';
    }
    return wb;
  }
  return { defaults, sheets, amount, day, blankEntry, build, quickReport, specs, workbook };
});
