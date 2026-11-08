(function connectOrganizations() {
  const client = window.motfSupabase;
  if (!client) return;
  const $ = (query, root = document) => root.querySelector(query);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const say = text => window.toast?.(text);
  const categories = [
    ['university_department','대학교 학과'],['university_college','대학교 단과대'],
    ['university_council','대학교 총학생회'],['university_club','대학교 동아리'],
    ['university_other','대학교 기타 단체'],['company','회사·워크숍'],['religious','종교·수련회'],
    ['youth','청소년·교육 단체'],['club','동호회·모임'],['other','기타 단체'],
  ];
  let user = null, selected = '', managedId = '', managerTab = 'info';
  let dashboard = {organizations:[],members:[],invites:[],transfers:[]}, management = null, historyData = null;
  let queue = Promise.resolve(), managerVersion = 0;
  const inviteLinks = new Map();
  const page = document.createElement('section');
  page.id = 'organizations'; page.className = 'view detail-app organization-page';
  $('main').append(page);
  const dialog = document.createElement('dialog');
  dialog.className = 'motf-dialog group-dialog'; document.body.append(dialog);
  const scopeDialog = document.createElement('dialog');
  scopeDialog.className = 'motf-dialog group-scope-dialog'; document.body.append(scopeDialog);
  const pendingKey = 'motf.organizationInvite';
  const incoming = new URLSearchParams(location.search).get('organization_invite');
  if (incoming) sessionStorage.setItem(pendingKey,incoming);
  const current = () => dashboard.organizations.find(org => org.id === selected);
  const managed = () => dashboard.organizations.find(org => org.id === managedId);
  const label = kind => categories.find(([key]) => key === kind)?.[1] || '단체 정보 보완 필요';
  const fmt = value => Number(value || 0).toLocaleString('ko-KR');
  const date = value => value ? new Date(value).toLocaleDateString('ko-KR') : '-';
  window.motfGetOrganizationId = () => selected || null;
  window.motfGetOrganizationName = () => current()?.name || '';
  window.motfCanEditOrganization = id => dashboard.organizations.some(org => org.id === id);
  window.motfGetOrganizations = () => dashboard.organizations.map(org => ({...org}));
  window.motfGetOrganizationWallet = () => ({account:dashboard.wallet || {},ledger:dashboard.ledger || []});

  function refreshIcons() { window.refreshIcons?.(); }
  function scopeOptions(value = selected) {
    return `<option value="">개인으로 준비</option>` + dashboard.organizations.map(org =>
      `<option value="${esc(org.id)}" ${org.id === value ? 'selected' : ''}>${esc(org.name)}</option>`).join('');
  }
  function renderScope() {
    document.querySelectorAll('.organization-scope').forEach(node => node.remove());
    if (user) {
      for (const id of ['myMt','myUsage','bookingForm','orderForm','chat']) {
        const host = document.getElementById(id);
        if (!host || (id === 'myMt' && window.motfIsMtDetail?.())) continue;
        const node = document.createElement('div'); node.className = 'preparation-context';
        node.innerHTML = `<button type="button" class="context-switch" data-group-scope-open>${icon(selected ? 'users-round' : 'user-round')}<span>${esc(current()?.name || '개인으로 준비')}</span>${icon('chevron-down')}</button>`;
        const old = host.querySelector(':scope > .preparation-context');
        if (old) old.replaceWith(node); else host.prepend(node);
      }
    }
    document.querySelectorAll('.preparation-context').forEach(node => {
      if (!user || (node.parentElement.id === 'myMt' && window.motfIsMtDetail?.())) node.remove();
    });
    const form = $('#mtProjectForm');
    if (form) {
      let row = $('[data-project-context]',form);
      if (!row) {
        row = document.createElement('label'); row.dataset.projectContext = '';
        row.innerHTML = '누구의 MT인가요?<select name="preparation_organization" data-project-organization></select>';
        form.prepend(row);
      }
      const select = $('select',row), editing = form.dataset.mode === 'edit';
      const value = editing ? window.motfActiveMtOrganization?.() || '' : select.dataset.initialized ? select.value : selected;
      select.innerHTML = scopeOptions(value); select.disabled = editing;
      select.dataset.initialized = 'true';
    }
    document.querySelectorAll('[data-point-wallet]').forEach(node => node.title = `${current()?.name || '개인'} 포인트`);
    refreshIcons();
  }

  function actionButton(action,title,id = '',key = 'user_id') {
    return `<button type="button" class="secondary" data-group-action="${action}" data-group-key="${key}" data-group-id="${esc(id)}">${title}</button>`;
  }
  function managerInfo(org) {
    return `<div class="group-info-heading"><h2>단체 정보</h2>${org.member_role === 'representative' ? '<button class="text-button" data-group-edit>정보 수정 <i data-lucide="pencil"></i></button>' : ''}</div>
      ${!org.profile_completed_at ? '<p class="group-info-note">기존 단체예요. 유형과 담당자 정보를 보완해주세요.</p>' : ''}
      <dl class="group-facts">${[['단체 유형',label(org.category)],['학교·기관',org.institution || org.affiliation],['세부 소속',org.department],['단체 규모',org.expected_members ? `${fmt(org.expected_members)}명` : '미입력'],['담당자',org.manager_name],['담당 역할',org.manager_role],['연락처',org.manager_phone],['이메일',org.manager_email]].map(([name,value]) => `<div><dt>${name}</dt><dd>${esc(value || '미입력')}</dd></div>`).join('')}</dl>
      ${org.description ? `<p class="group-description">${esc(org.description)}</p>` : ''}`;
  }
  function managerMembers(org) {
    const data = management || {}, rep = org.member_role === 'representative';
    const link = inviteLinks.get(org.id);
    return `<div class="group-info-heading"><h2>담당자와 인계</h2>${rep ? actionButton('invite','담당자 초대') : ''}</div>
      <p class="group-info-note">각자 개인 계정으로 참여해요. 새 담당자의 초대 수락 → 대표 승인 후 참여하며, 대표 인계는 후임의 본인확인·수락과 기존 대표의 확정이 필요해요.</p>
      ${link ? `<div class="group-invite-link"><label>담당자 초대 링크<input readonly value="${esc(link)}" data-group-invite-link></label><button class="secondary" data-group-copy>링크 복사</button></div>` : ''}
      <div class="group-member-list">${(data.members || []).map(member => `<article><div><strong>${esc(member.name || '담당자')}</strong><span>${member.status === 'pending' ? '승인 대기' : member.role === 'representative' ? '대표 담당자' : '담당자'}</span></div><div class="group-row-actions">${rep && member.status === 'pending' ? actionButton('approve','참여 승인',member.user_id) + actionButton('reject','반려',member.user_id) : ''}${rep && member.status === 'active' && member.role !== 'representative' ? actionButton('handoff_request','대표 인계',member.user_id) + actionButton('remove','권한 해제',member.user_id) : ''}</div></article>`).join('')}</div>
      ${(data.transfers || []).map(transfer => `<section class="group-transfer"><strong>대표 인계 ${transfer.status === 'accepted' ? '후임 수락 완료' : '후임 수락 대기'}</strong><div class="group-row-actions">${transfer.recipient_id === user.id && transfer.status === 'requested' ? actionButton('handoff_accept','본인확인 후 수락',transfer.id,'transfer_id') : ''}${rep && transfer.status === 'accepted' ? actionButton('handoff_confirm','인계 확정',transfer.id,'transfer_id') : ''}${rep ? actionButton('handoff_cancel','인계 취소') : ''}</div></section>`).join('')}
      ${(data.invites || []).filter(invite => !invite.accepted_by).map(invite => `<div class="group-pending-invite"><span>미수락 초대 · ${date(invite.expires_at)}까지</span>${rep ? actionButton('revoke_invite','초대 취소',invite.id,'invite_id') : ''}</div>`).join('')}
      <details class="group-danger"><summary>단체 이용 종료</summary><p>진행 중인 예약·정산과 단체 포인트가 없어야 폐쇄할 수 있어요. 기존 거래 기록은 보존됩니다.</p>${rep ? actionButton('close','단체 폐쇄') : actionButton('leave','단체 나가기')}</details>`;
  }
  function managerHistory() {
    if (!historyData) return '<p class="group-info-note">단체 기록을 불러오고 있어요.</p>';
    const statuses = {planning:'준비 중',booking:'예약 중',pending:'대기',confirmed:'확정',completed:'완료',cancelled:'취소',rejected:'거절'};
    return `<h2>그동안의 MT</h2><div class="group-history-list">${historyData.projects.map(project => `<button type="button" data-group-project="${project.id}"><span><strong>${esc(project.title)}</strong><small>${esc(project.starts_on)} ~ ${esc(project.ends_on)} · ${project.guest_count}명</small></span><span>${statuses[project.status] || esc(project.status)} ${icon('chevron-right')}</span></button>`).join('') || '<p class="group-info-note">이 단체로 만든 MT가 아직 없어요.</p>'}</div>
      <div class="group-info-heading"><h2>예약·장보기 기록</h2><button class="text-button" data-group-usage>전체 이용 내역 ${icon('arrow-up-right')}</button></div><div class="group-history-list">${historyData.transactions.map(row => `<article><span><small>${row.kind === 'stay' ? '숙소 예약' : 'MT 장보기 주문'} · ${date(row.created_at)}</small><strong>${esc(row.title)}</strong></span><span>${statuses[row.status] || esc(row.status)}</span></article>`).join('') || '<p class="group-info-note">이 단체의 예약·주문 내역이 아직 없어요.</p>'}</div>`;
  }
  function renderManager() {
    page.classList.toggle('active',window.currentRoute?.() === 'organizations');
    const org = managed();
    page.innerHTML = `<div class="page-heading"><div><h1>우리 단체</h1><span class="page-description">담당자가 바뀌어도, 준비 기록은 한곳에.</span></div><button class="primary" data-group-new>${icon('plus')} 단체 만들기</button></div>
      ${!user ? '<div class="group-empty"><h2>우리 단체의 준비 기록을 이어가세요.</h2><button class="primary" data-group-login>로그인하고 시작하기</button></div>' : !dashboard.organizations.length ? '<div class="group-empty"><i data-lucide="users-round"></i><h2>첫 번째 단체를 만들어볼까요?</h2><p>학생회, 동아리, 회사, 모임의 MT와 예약·장보기 기록을 함께 관리해요.</p><button class="primary" data-group-new>우리 단체 만들기</button><p>받은 담당자 초대는 초대 링크를 열어 수락할 수 있어요.</p></div>' : `<div class="group-workspace"><aside class="group-directory" aria-label="내 단체">${dashboard.organizations.map(item => `<button type="button" data-group-select="${item.id}" aria-current="${item.id === managedId ? 'page' : 'false'}">${icon('users-round')}<span><strong>${esc(item.name)}</strong><small>${label(item.category)}</small></span>${icon('chevron-right')}</button>`).join('')}</aside><div class="group-main">${org ? `<header class="group-overview"><span class="pill">${label(org.category)}</span><h2>${esc(org.name)}</h2><p>${esc(org.institution || org.affiliation || '')}</p><button class="secondary" data-group-prepare>이 단체로 MT 준비하기 ${icon('arrow-up-right')}</button></header><nav class="group-tabs" aria-label="단체 관리 메뉴">${[['info','단체 정보'],['members','담당자·인계'],['history','준비 기록']].map(([key,title]) => `<button data-group-tab="${key}" aria-current="${managerTab === key ? 'page' : 'false'}">${title}</button>`).join('')}</nav><section class="group-tab-content">${managerTab === 'info' ? managerInfo(org) : managerTab === 'members' ? managerMembers(org) : managerHistory()}</section>` : '<p>단체를 선택해주세요.</p>'}</div></div>`}`;
    refreshIcons();
  }
  async function loadManager(id = managedId) {
    const stamp = ++managerVersion;
    managedId = dashboard.organizations.some(org => org.id === id) ? id : dashboard.organizations[0]?.id || '';
    if (!managedId) { management = null; historyData = null; renderManager(); return; }
    const target = managedId;
    const {data,error} = await client.rpc('organization_dashboard',{target_id:target});
    if (stamp !== managerVersion) return;
    if (error) throw error;
    management = data;
    historyData = null;
    renderManager();
    const result = await client.rpc('organization_history',{target_id:target});
    if (stamp !== managerVersion) return;
    if (result.error) throw result.error;
    historyData = result.data; renderManager();
  }
  async function reload() {
    const previous = selected;
    const {data:auth,error:authError} = await client.auth.getSession();
    if (authError) throw authError;
    user = auth.session?.user || null;
    const saved = user ? sessionStorage.getItem('motf.organizationScope.' + user.id) || '' : '';
    dashboard = {organizations:[],members:[],invites:[],transfers:[]}; selected = '';
    if (user) {
      const {data,error} = await client.rpc('organization_dashboard',{target_id:null});
      if (error) { renderScope(); renderManager(); throw error; }
      dashboard = data;
      if (dashboard.organizations.some(org => org.id === saved)) {
        const result = await client.rpc('organization_dashboard',{target_id:saved});
        if (result.error) throw result.error;
        dashboard = result.data; selected = saved;
      }
      sessionStorage.setItem('motf.organizationScope.' + user.id,selected);
      const token = sessionStorage.getItem(pendingKey);
      if (token) {
        const result = await client.rpc('manage_organization',{action:'accept_invite',payload:{token}});
        if (result.error) throw result.error;
        sessionStorage.removeItem(pendingKey);
        const url = new URL(location.href); url.searchParams.delete('organization_invite');
        history.replaceState(history.state,'',url.pathname + url.search + url.hash);
        say('초대를 수락했어요. 대표 담당자가 승인하면 단체에 참여할 수 있습니다.');
      }
    }
    renderScope();
    if (previous && !selected) {
      window.dispatchEvent(new CustomEvent('motf:organization-changed'));
      window.motfResetMtDirectory?.();
      queueMicrotask(() => {
        Promise.all([window.motfReloadMtProjects?.(),window.motfReloadTransactions?.()])
          .catch(error => say(error.message || '준비 소속을 새로 불러오지 못했습니다.'));
      });
    }
    if (window.currentRoute?.() === 'organizations') await loadManager();
  }
  window.motfReloadOrganization = () => { queue = queue.catch(() => {}).then(reload); return queue; };
  async function changeScope(id,options = {}) {
    if (!user) throw new Error('로그인 후 준비 소속을 선택해주세요.');
    if (window.motfCheckoutPending || window.motfChatPending) throw new Error('결제 준비나 메시지 전송이 끝난 뒤 변경해주세요.');
    if (id && !dashboard.organizations.some(org => org.id === id)) throw new Error('참여 중인 단체를 선택해주세요.');
    if (selected === (id || '')) return;
    sessionStorage.setItem('motf.organizationScope.' + user.id,id || '');
    await window.motfReloadOrganization();
    window.dispatchEvent(new CustomEvent('motf:organization-changed'));
    window.motfResetMtDirectory?.();
    if (!options.skipProjects) await window.motfReloadMtProjects?.();
    await window.motfReloadTransactions?.();
  }
  window.motfSetOrganizationScope = changeScope;
  window.motfRefreshOrganizationUI = renderScope;
  window.motfOpenOrganization = () => window.motfRequireLogin(async () => {
    try { await window.motfReloadOrganization(); window.navigate('organizations'); await loadManager(); }
    catch (error) { say(error.message || '단체 정보를 불러오지 못했습니다.'); }
  });

  function openProfile(editing = false) {
    const org = editing ? managed() : {}, person = window.motfCurrentUserProfile || {};
    dialog.innerHTML = `<div class="modal-top"><h2>${editing ? '단체 정보 수정' : '우리 단체 만들기'}</h2><button class="icon-button" data-group-close aria-label="닫기">${icon('x')}</button></div><form class="group-profile-form" data-group-profile="${editing ? org.id : ''}">
      <div class="form-grid"><label>단체 유형<select name="category" required><option value="">유형 선택</option>${categories.map(([key,title]) => `<option value="${key}" ${org.category === key ? 'selected' : ''}>${title}</option>`).join('')}</select></label><label>학교·기관·모임명<input name="institution" required minlength="2" maxlength="120" value="${esc(org.institution || org.affiliation || '')}" placeholder="예: 고려대학교"></label></div>
      <label>단체 이름<input name="name" required minlength="2" maxlength="80" value="${esc(org.name || '')}" placeholder="예: 국제학부 제24대 학생회"></label>
      <div class="form-grid"><label>세부 소속 (선택)<input name="department" maxlength="120" value="${esc(org.department || '')}" placeholder="예: 국제학부 / 중앙동아리"></label><label>단체 규모 (선택)<input name="expected_members" type="number" min="1" max="100000" value="${esc(org.expected_members || '')}" placeholder="전체 구성원 수"></label></div>
      <fieldset><legend>대표 담당자</legend><div class="form-grid"><label>담당자 이름<input name="manager_name" required minlength="2" maxlength="80" autocomplete="name" value="${esc(org.manager_name || person.full_name || '')}"></label><label>역할<input name="manager_role" required maxlength="60" value="${esc(org.manager_role || '')}" placeholder="예: 총무 / 학생회장"></label><label>연락처<input name="manager_phone" required type="tel" autocomplete="tel" maxlength="20" value="${esc(org.manager_phone || person.phone || '')}"></label><label>이메일 (선택)<input name="manager_email" type="email" maxlength="254" autocomplete="email" value="${esc(org.manager_email || '')}"></label></div></fieldset>
      <label>단체 소개 (선택)<textarea name="description" rows="3" maxlength="1000" placeholder="활동 내용이나 다음 담당자에게 남길 단체 정보를 적어주세요.">${esc(org.description || '')}</textarea></label>
      <label class="group-consent"><input name="contact_consent" type="checkbox" required><span>이 단체를 관리할 권한이 있으며, 담당자 정보가 단체 운영·연락 및 승인된 담당자의 인수인계에 이용되는 것을 확인합니다. 공개 게시판에는 노출되지 않습니다.</span></label>
      <p class="group-form-error" role="alert"></p><button class="primary" type="submit">${editing ? '변경 저장' : '단체 만들고 관리하기'}</button></form>`;
    dialog.showModal(); refreshIcons();
  }
  document.addEventListener('click',async event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-org-open')) { window.motfOpenOrganization(); return; }
    if (button.hasAttribute('data-group-login')) { window.motfOpenOrganization(); return; }
    if (button.hasAttribute('data-group-new')) { window.motfRequireLogin(() => openProfile()); return; }
    if (button.hasAttribute('data-group-edit')) { openProfile(true); return; }
    if (button.hasAttribute('data-group-close')) { button.closest('dialog').close(); return; }
    if (button.hasAttribute('data-group-scope-open')) {
      scopeDialog.innerHTML = `<div class="modal-top"><h2>누구의 준비인가요?</h2><button class="icon-button" data-group-close aria-label="닫기">${icon('x')}</button></div><div class="group-context-choices"><button data-group-scope="" aria-pressed="${!selected}">${icon('user-round')} 개인으로 준비 ${!selected ? icon('check') : ''}</button>${dashboard.organizations.map(org => `<button data-group-scope="${org.id}" aria-pressed="${org.id === selected}">${icon('users-round')} ${esc(org.name)} ${org.id === selected ? icon('check') : ''}</button>`).join('')}</div><button class="text-button" data-group-manage>단체 생성·관리 ${icon('arrow-up-right')}</button>`;
      scopeDialog.showModal(); refreshIcons(); return;
    }
    try {
      if (button.hasAttribute('data-group-manage')) { scopeDialog.close(); window.motfOpenOrganization(); return; }
      if (button.hasAttribute('data-group-scope')) { button.disabled = true; await changeScope(button.dataset.groupScope); scopeDialog.close(); return; }
      if (button.hasAttribute('data-group-select')) { await loadManager(button.dataset.groupSelect); return; }
      if (button.hasAttribute('data-group-tab')) { managerTab = button.dataset.groupTab; renderManager(); return; }
      if (button.hasAttribute('data-group-copy')) { await navigator.clipboard.writeText($('[data-group-invite-link]').value); say('초대 링크를 복사했어요.'); return; }
      if (button.hasAttribute('data-group-prepare') || button.hasAttribute('data-group-usage')) {
        await changeScope(managedId); window.navigate(button.hasAttribute('data-group-usage') ? 'myUsage' : 'myMt'); return;
      }
      if (button.hasAttribute('data-group-project')) {
        await changeScope(managedId); await window.motfOpenMtProjectWorkspace(button.dataset.groupProject); return;
      }
      if (!button.hasAttribute('data-group-action') || button.disabled) return;
      const action = button.dataset.groupAction, payload = {organization_id:managedId};
      if (button.dataset.groupId) payload[button.dataset.groupKey] = button.dataset.groupId;
      if (['remove','leave','reject','handoff_request','handoff_cancel','revoke_invite'].includes(action) && !confirm('이 작업을 진행할까요?')) return;
      if (action === 'handoff_accept' && !await window.motfVerifyIdentityForTransfer()) return;
      if (action === 'handoff_confirm') {
        if (!confirm('후임에게 대표 권한을 넘길까요?')) return;
        payload.remove_previous = confirm('인계 후 내 단체 접근 권한도 해제할까요?');
      }
      if (action === 'close') {
        payload.reason = prompt('폐쇄 사유를 6~500자로 입력해주세요.','');
        if (payload.reason === null || !confirm('단체를 폐쇄할까요? 기존 거래 기록은 보존됩니다.')) return;
      }
      button.disabled = true;
      const {data,error} = await client.rpc('manage_organization',{action,payload});
      if (error) throw error;
      if (action === 'invite') {
        const url = new URL('/organizations',location.origin); url.searchParams.set('organization_invite',data.token);
        inviteLinks.set(managedId,url.href);
      }
      await window.motfReloadOrganization();
      await loadManager();
      say(action === 'invite' ? '초대 링크를 전달해주세요.' : '단체 정보를 반영했어요.');
    } catch (error) { say(error.message || '단체 작업을 완료하지 못했습니다.'); }
    finally { button.disabled = false; }
  });
  dialog.addEventListener('submit',async event => {
    const form = event.target; if (!form.matches('[data-group-profile]')) return;
    event.preventDefault(); const button = $('button[type="submit"]',form); button.disabled = true;
    try {
      const formData = new FormData(form), payload = Object.fromEntries(formData); payload.contact_consent = formData.has('contact_consent');
      const editing = form.dataset.groupProfile;
      if (editing) payload.organization_id = editing;
      const {data,error} = await client.rpc('manage_organization',{action:editing ? 'update_profile' : 'create',payload});
      if (error) throw error;
      managedId = data.organization_id; managerTab = 'info';
      await window.motfReloadOrganization();
      dialog.close(); window.navigate('organizations'); await loadManager(managedId);
      say(editing ? '단체 정보를 수정했어요.' : '우리 단체를 만들었어요.');
    } catch (error) { $('.group-form-error',form).textContent = error.message || '단체 정보를 저장하지 못했습니다.'; }
    finally { button.disabled = false; }
  });
  document.addEventListener('click',event => {
    if (event.target.closest('[data-create-mt-project]')) queueMicrotask(() => {
      const select = $('[data-project-organization]'); if (select) delete select.dataset.initialized;
      renderScope();
    });
  });
  window.addEventListener('motf:auth-ready',() => window.motfReloadOrganization().then(() => window.motfReloadMtProjects?.()).catch(error => say(error.message)));
  window.addEventListener('motf:routechange',event => {
    renderScope();
    if (!event.detail?.preserveDesignDialogs) { scopeDialog.close(); dialog.close(); }
    if (event.detail?.route === 'organizations') loadManager().catch(error => say(error.message));
  });
  renderScope(); renderManager();
})();
