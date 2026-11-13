(() => {
  const $ = (query, root = document) => root.querySelector(query);
  const esc = escapeHtml, icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const dialog = document.createElement('dialog');
  dialog.className = 'motf-dialog mt-selection-dialog';
  dialog.setAttribute('aria-label','내 MT에 담기'); document.body.append(dialog);
  let pending = null, version = 0, awaitingCreate = false;
  const workflow = window.motfMtWorkflow;
  let activeProject = null, snapshot = null, activeUserId = '', refreshVersion = 0, receiptTimer, scheduled = false;
  const preferenceKey = () => window.motfCurrentUserId ? `motf.currentMt.${window.motfCurrentUserId}` : '';
  const preferredId = () => { try { return localStorage.getItem(preferenceKey()) || ''; } catch { return ''; } };
  function selectCurrent(project, nextSnapshot) {
    activeProject = project;
    snapshot = nextSnapshot || null;
    try { if (preferenceKey()) localStorage.setItem(preferenceKey(), project?.id || ''); } catch { /* Storage may be disabled. */ }
    syncButtons();
  }
  async function refreshCurrent() {
    const stamp = ++refreshVersion;
    if (activeUserId !== (window.motfCurrentUserId || '')) {
      activeUserId=window.motfCurrentUserId || ''; activeProject=null; snapshot=null;
      pending=null; version++; dialog.close(); document.querySelector('.mt-save-receipt')?.remove(); syncButtons();
    }
    if (!window.motfCurrentUserId) { selectCurrent(null); return; }
    try {
      const list = await window.motfListWritableMtProjects();
      const project = workflow.activeProject(list, preferredId());
      const next = project ? await window.motfReadMtSelection(project.id) : null;
      if (stamp === refreshVersion) selectCurrent(project, next);
    } catch {
      if (stamp === refreshVersion) { activeProject=null; snapshot=null; syncButtons(); }
    }
  }
  function syncButtons() {
    let changed = false;
    document.querySelectorAll('[data-add-mt-candidate],[data-add-mt-shopping],[data-add-current-to-mt],.mp-pb-mt').forEach(button => {
      const shopping = button.hasAttribute('data-add-mt-shopping') || button.hasAttribute('data-add-current-to-mt') || button.classList.contains('mp-pb-mt');
      const product = shopping && findProduct(button.dataset.addMtShopping || state.selectedProduct?.id)?.product;
      const ids = product ? productVariants(product).map(item => String(item.id)) : [];
      const count = shopping ? (snapshot?.items || []).filter(item => item.item_kind === 'shopping' && ids.includes(String(item.reference_id))).reduce((sum,item) => sum + Number(item.quantity || 0),0) : workflow.roomCount(snapshot, button.dataset.addMtCandidate, button.dataset.preferredRoom);
      const signature = [activeProject?.id || '', activeProject?.title || '', count, shopping].join(':');
      if (button.dataset.mtSignature === signature) return;
      button.dataset.mtSignature = signature; button.classList.add('mt-save-action'); button.classList.toggle('is-saved', count > 0);
      button.setAttribute('aria-pressed', String(count > 0));
      const title = count ? `내 MT에 ${count}${shopping ? '개' : '객실'} 담김` : '내 MT에 담기';
      button.title = activeProject ? `${activeProject.title} · ${title}` : title;
      button.setAttribute('aria-label', button.title);
      button.innerHTML = `${icon(count ? 'bookmark-check' : 'bookmark-plus')}<span class="mt-save-text">${count ? `MT 담김 ${count}${shopping ? '개' : '실'}` : 'MT 담기'}</span>`;
      changed = true;
    });
    document.querySelectorAll('#stays>.view-title,#market>.view-title,#mtProjectDirectory>.mt-directory-head,#mtProjectWorkspace>.mt-project-hero').forEach(host => {
      let context = host.querySelector('.mt-current-context');
      if (!context) { context = document.createElement('button'); context.type = 'button'; context.className = 'text-button mt-current-context'; context.dataset.selectCurrentMt = ''; host.append(context); }
      const text = activeProject ? `현재 MT: ${activeProject.title}` : '담을 MT 선택';
      if (context.textContent !== text) { context.textContent = text; context.title = '현재 MT 변경'; }
    });
    if (changed) refreshIcons();
  }
  function showReceipt(project, text) {
    document.querySelector('.mt-save-receipt')?.remove(); clearTimeout(receiptTimer);
    const notice = document.createElement('div'); notice.className = 'mt-save-receipt'; notice.setAttribute('role','status');
    notice.innerHTML = `<span>${esc(text)}<small>${esc(project.title)}</small></span><button class="secondary-btn" type="button" data-mt-jump="${project.id}">내 MT 보기 ${icon('arrow-up-right')}</button><button class="icon-button" type="button" data-mt-receipt-close aria-label="알림 닫기">${icon('x')}</button>`;
    document.body.append(notice); refreshIcons(); receiptTimer = setTimeout(() => notice.remove(), 10000);
  }
  async function saved(project, text) {
    if (!pending || pending.userId !== window.motfCurrentUserId) return;
    const userId = pending.userId;
    dialog.close(); pending = null; await refreshCurrent();
    if (userId === window.motfCurrentUserId) showReceipt(project, text);
  }
  const label = project => project.organization_id
    ? window.motfGetOrganizations?.().find(org => org.id === project.organization_id)?.name || '단체 MT'
    : '개인 MT';
  function shell(body) {
    dialog.innerHTML = `<div class="modal-top"><h2>내 MT에 담기</h2><button class="icon-button" type="button" data-selection-close aria-label="닫기">${icon('x')}</button></div>${body}<p class="selection-error" role="alert"></p>`;
    if (!dialog.open) dialog.showModal(); refreshIcons();
  }
  async function projects() {
    await window.motfOrganizationReady;
    if (!window.motfListWritableMtProjects) throw new Error('내 MT 연결을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
    return window.motfListWritableMtProjects();
  }
  function renderProjects() {
    shell(`<p class="selection-lead">${pending.kind === 'select' ? '앞으로 담을 현재 MT를 선택해주세요.' : pending.kind === 'stay' ? '숙소 객실을 담을 MT를 선택해주세요.' : esc(pending.product.name) + ' 상품을 담을 MT를 선택해주세요.'}</p><div class="selection-projects">${pending.projects.map(project => `<button type="button" data-selection-project="${project.id}"><span class="selection-project-symbol">${icon(project.organization_id ? 'users-round' : 'folder-heart')}</span><span><small>${esc(label(project))}</small><strong>${esc(project.title)}</strong><small>${esc(project.starts_on)} ~ ${esc(project.ends_on)} · ${project.guest_count}명</small></span>${icon('chevron-right')}</button>`).join('') || '<p class="selection-lead">준비 중인 MT가 없어요. 먼저 새 MT를 만들어주세요.</p>'}</div><button class="secondary selection-new" type="button" data-selection-new>${icon('plus')} 새 MT 만들기</button>`);
  }
  async function open(value) {
    window.motfRequireLogin(async () => {
      const stamp = ++version; pending = {...value,rooms:new Set(),userId:window.motfCurrentUserId}; awaitingCreate = false;
      const request = pending;
      shell('<p class="selection-lead">준비 중인 MT를 불러오고 있어요.</p>');
      try {
        const list = await projects();
        if (stamp !== version || !pending) return;
        pending.projects = list;
        const current = workflow.activeProject(list, preferredId());
        if (current && pending.kind !== 'select') await chooseProject(current.id);
        else renderProjects();
      } catch (error) { if (pending === request) $('.selection-error',dialog).textContent = error.message; }
    });
  }
  window.motfOpenStayPicker = (businessId,preferredRoom = '') => open({kind:'stay',businessId,preferredRoom});
  window.motfOpenShoppingPicker = (product,quantity) => open({kind:'shopping',product,quantity});

  function roomFooter() {
    if (!pending?.project) return;
    const stay = stays.find(stay => String(stay.id) === String(pending.businessId));
    const selected = stay.rooms.filter(room => pending.rooms.has(String(room.id)));
    $('[data-selection-count]',dialog).textContent = `${selected.length}개 객실 · ${money(selected.reduce((sum,room) => sum + mtRoomRangeTotal(stay,room,pending.project),0))}`;
    $('[data-selection-save]',dialog).disabled = !selected.some(room => !workflow.roomCount(snapshot, pending.businessId, room.id));
  }
  async function chooseProject(id) {
    pending.project = pending.projects.find(project => String(project.id) === String(id));
    if (!pending.project) throw new Error('선택한 MT를 찾을 수 없습니다.');
    const chosen = pending.project;
    const request = pending;
    const next = await window.motfReadMtSelection(id);
    if (pending !== request) return;
    selectCurrent(chosen, next);
    if (pending.kind === 'select') { dialog.close(); pending = null; toast(`현재 MT를 ${chosen.title}(으)로 선택했어요.`); return; }
    if (pending.kind === 'shopping') {
      const existing = workflow.shoppingItem(snapshot, pending.product.id);
      if (existing) pending.quantity = existing.quantity;
      if (!existing && productVariants(pending.product).length === 1) {
        await window.motfSetMtShoppingQuantity(id, pending.product.id, pending.quantity);
        await saved(chosen,'장보기 후보에 담았어요.'); return;
      }
      renderProduct(); return;
    }
    const stamp = ++version;
    shell('<p class="selection-lead">MT 일정에 가능한 객실을 확인하고 있어요.</p>');
    const availability = await window.motfGetCandidateRoomAvailability(id,pending.businessId);
    if (stamp !== version || !pending) return;
    pending.project = availability.project;
    const stay = stays.find(stay => String(stay.id) === String(pending.businessId));
    if (!stay) throw new Error('숙소 정보를 찾을 수 없습니다.');
    const unavailable = new Set(availability.unavailableOfferingIds.map(String));
    pending.rooms = new Set(stay.rooms.filter(room => workflow.roomCount(snapshot, pending.businessId, room.id) || String(room.id) === pending.preferredRoom && !unavailable.has(String(room.id))).map(room => String(room.id)));
    if (pending.preferredRoom && workflow.roomCount(snapshot, pending.businessId, pending.preferredRoom)) { await saved(chosen,'이미 담긴 객실이에요. 내 MT에서 확인해주세요.'); return; }
    shell(`<button class="text-button" type="button" data-selection-back>${icon('arrow-left')} MT 다시 선택</button><div class="selection-context"><strong>${esc(stay.name)}</strong><span>${esc(pending.project.title)} · ${esc(pending.project.starts_on)} ~ ${esc(pending.project.ends_on)}</span></div><p class="selection-lead">필요한 객실을 여러 개 선택하세요. 예약은 아직 접수되지 않아요.</p><div class="selection-room-list">${stay.rooms.map(room => {
      const soldOut = unavailable.has(String(room.id)), already = workflow.roomCount(snapshot, pending.businessId, room.id);
      return `<label class="selection-room ${soldOut ? 'unavailable' : ''}"><input type="checkbox" data-selection-room="${room.id}" ${soldOut || already ? 'disabled' : ''} ${pending.rooms.has(String(room.id)) ? 'checked' : ''}><img src="${esc(room.image || stay.image)}" alt=""><span><strong>${esc(room.name)}${already ? ' · 담긴 객실' : ''}</strong><small>기준 ${room.basePeople || '-'}명 / 최대 ${room.maxPeople || roomCapacityMax(room) || '-'}명</small><small>${soldOut ? '선택 일정 예약 마감' : money(mtRoomRangeTotal(stay,room,pending.project))}</small></span></label>`;
    }).join('')}</div><div class="selection-footer"><strong data-selection-count></strong><button class="primary" type="button" data-selection-save>선택한 객실 담기 ${icon('folder-plus')}</button></div>`);
    roomFooter();
  }
  function renderProduct() {
    const product = pending.product, rules = productOrderRules(product), variants = productVariants(product);
    const existing = workflow.shoppingItem(snapshot, product.id);
    pending.quantity = normalizeProductQuantity(product,pending.quantity);
    shell(`<button class="text-button" type="button" data-selection-back>${icon('arrow-left')} MT 다시 선택</button><div class="selection-context"><strong>${esc(pending.project.title)}</strong><span>${esc(label(pending.project))} · 장보기 후보</span></div><div class="selection-product"><img src="${esc(product.image)}" alt=""><div><h3>${esc(product.name)}</h3><span>${money(product.price)} / ${esc(product.unit)}</span></div></div>${variants.length > 1 ? `<label class="selection-field">상품 옵션<select data-selection-variant>${variants.map(item => `<option value="${item.id}" ${item.id === product.id ? 'selected' : ''}>${esc(item.variantLabel || item.unit)} · ${money(item.price)}</option>`).join('')}</select></label>` : ''}<label class="selection-field">수량 (${esc(rules.unit)})<input type="number" data-selection-quantity min="${rules.minimum}" max="1000" step="${rules.step}" value="${pending.quantity}" aria-label="담을 상품 수량"></label><p class="selection-lead">최소 ${rules.minimum}${esc(rules.unit)} · ${rules.step}${esc(rules.unit)} 단위. 내 MT 후보에 담으며 장바구니나 결제에는 영향을 주지 않아요.</p><div class="selection-footer"><strong data-selection-product-total>${money(product.price * pending.quantity)}</strong><button class="primary" type="button" data-selection-save>이 MT에 상품 담기 ${icon('folder-plus')}</button></div>`);
    if (existing) {
      $('[data-selection-save]',dialog).textContent = '담긴 수량 변경';
      $('.selection-footer',dialog).insertAdjacentHTML('beforeend','<button type="button" class="text-button" data-selection-delete>후보에서 삭제</button>');
    }
  }
  dialog.addEventListener('change',event => {
    const input = event.target;
    if (input.hasAttribute('data-selection-room')) {
      if (input.checked) pending.rooms.add(input.dataset.selectionRoom); else pending.rooms.delete(input.dataset.selectionRoom);
      roomFooter();
    }
    if (input.hasAttribute('data-selection-variant')) {
      pending.product = findProduct(input.value).product;
      pending.quantity = workflow.shoppingItem(snapshot, pending.product.id)?.quantity || productOrderRules(pending.product).minimum;
      renderProduct();
    }
    if (input.hasAttribute('data-selection-quantity')) {
      pending.quantity = normalizeProductQuantity(pending.product,input.value); input.value = pending.quantity;
      $('[data-selection-product-total]',dialog).textContent = money(pending.product.price * pending.quantity);
    }
  });
  dialog.addEventListener('click',async event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-selection-close')) { pending = null; version++; dialog.close(); return; }
    if (button.hasAttribute('data-selection-back')) { version++; renderProjects(); return; }
    if (button.hasAttribute('data-selection-new')) {
      awaitingCreate = true; dialog.close(); navigate('myMt');
      document.querySelector('#mtProjectDirectory [data-create-mt-project]').click(); return;
    }
    const errorNode = $('.selection-error',dialog); errorNode.textContent = ''; button.disabled = true;
    try {
      if (button.hasAttribute('data-selection-delete')) {
        const chosen = pending.project;
        await window.motfSetMtShoppingQuantity(chosen.id,pending.product.id,0);
        await saved(chosen,'장보기 후보에서 삭제했어요.'); return;
      }
      if (button.hasAttribute('data-selection-project')) await chooseProject(button.dataset.selectionProject);
      if (button.hasAttribute('data-selection-save')) {
        const chosen = pending.project;
        if (pending.kind === 'stay') {
          const newRooms = [...pending.rooms].filter(id => !workflow.roomCount(snapshot, pending.businessId, id));
          if (!newRooms.length) { await saved(chosen,'이미 담긴 객실이에요.'); return; }
          await window.motfSaveRoomsToProject(chosen.id,pending.businessId,newRooms);
        }
        else {
          pending.quantity = normalizeProductQuantity(pending.product,$('[data-selection-quantity]',dialog).value);
          await window.motfSetMtShoppingQuantity(chosen.id,pending.product.id,pending.quantity);
        }
        await saved(chosen, '내 MT 후보를 저장했어요.');
      }
    } catch (error) { $('.selection-error',dialog).textContent = error.message || '내 MT에 담지 못했습니다.'; }
    finally { button.disabled = false; }
  });
  dialog.addEventListener('cancel',() => { pending = null; version++; awaitingCreate = false; });
  window.motfResumeMtSelection = async project => {
    if (!awaitingCreate || !pending) return;
    awaitingCreate = false; pending.projects = [project]; await chooseProject(project.id);
  };
  document.addEventListener('click', async event => {
    const jump = event.target.closest('[data-mt-jump]');
    if (jump) { try { await window.motfOpenMtProjectWorkspace(jump.dataset.mtJump); jump.closest('.mt-save-receipt')?.remove(); } catch (error) { toast(error.message); } return; }
    if (event.target.closest('[data-mt-receipt-close]')) event.target.closest('.mt-save-receipt').remove();
    if (event.target.closest('[data-select-current-mt]')) open({kind:'select'});
    const stepper = event.target.closest('[data-mt-quantity-delta]');
    if (!stepper) return;
    const item = state.mtProject.items.find(item => item.id === stepper.dataset.mtItem);
    if (!item) return;
    const product = findProduct(item.reference_id)?.product;
    const rules = product ? productOrderRules(product) : {minimum:1,step:1};
    const next = Number(item.quantity) + Number(stepper.dataset.mtQuantityDelta) * rules.step;
    const quantity = next < rules.minimum ? 0 : workflow.quantity(next, rules.minimum, rules.step);
    const row = stepper.closest('.mt-shopping-row');
    row?.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { await window.motfSetMtShoppingQuantity(state.mtProject.id,item.reference_id,quantity); }
    catch (error) { toast(error.message || '수량을 변경하지 못했어요.'); }
    finally { row?.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
  });
  window.addEventListener('motf:mt-selected', event => {
    const project = event.detail.project;
    if (project.is_owner === false || ['completed','cancelled'].includes(project.status)) { refreshCurrent(); return; }
    selectCurrent(project, {projectId:project.id,items:project.items || [],candidates:(event.detail.candidates || []).map(item => ({business_id:item.businessId,offering_id:item.offeringId}))});
  });
  ['motf:mt-projects-loaded','motf:auth-ready','motf:mt-items-changed'].forEach(name => window.addEventListener(name,refreshCurrent));
  new MutationObserver(() => { if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; syncButtons(); }); } }).observe(document.body,{childList:true,subtree:true});
  window.motfRefreshMtSaveButtons = syncButtons;
  refreshCurrent();
  document.addEventListener('keydown',event => {
    if (event.key === 'Enter' && event.target.matches('.home-post[data-post-id]')) event.target.click();
  });
})();
