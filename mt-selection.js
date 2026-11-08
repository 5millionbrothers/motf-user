(() => {
  const $ = (query, root = document) => root.querySelector(query);
  const esc = escapeHtml, icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const dialog = document.createElement('dialog');
  dialog.className = 'motf-dialog mt-selection-dialog';
  dialog.setAttribute('aria-label','내 MT에 담기'); document.body.append(dialog);
  let pending = null, version = 0, awaitingCreate = false;
  const label = project => project.organization_id
    ? window.motfGetOrganizations?.().find(org => org.id === project.organization_id)?.name || '단체 MT'
    : '개인 MT';
  function shell(body) {
    dialog.innerHTML = `<div class="modal-top"><h2>내 MT에 담기</h2><button class="icon-button" type="button" data-selection-close aria-label="닫기">${icon('x')}</button></div>${body}<p class="selection-error" role="alert"></p>`;
    if (!dialog.open) dialog.showModal(); refreshIcons();
  }
  async function projects() {
    await window.motfOrganizationReady;
    await window.motfReloadMtProjects?.();
    if (!window.motfListWritableMtProjects) throw new Error('내 MT 연결을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
    return window.motfListWritableMtProjects();
  }
  function renderProjects() {
    shell(`<p class="selection-lead">${pending.kind === 'stay' ? '숙소 객실을' : esc(pending.product.name) + ' 상품을'} 담을 MT를 선택해주세요.</p><div class="selection-projects">${pending.projects.map(project => `<button type="button" data-selection-project="${project.id}"><span class="selection-project-symbol">${icon(project.organization_id ? 'users-round' : 'folder-heart')}</span><span><small>${esc(label(project))}</small><strong>${esc(project.title)}</strong><small>${esc(project.starts_on)} ~ ${esc(project.ends_on)} · ${project.guest_count}명</small></span>${icon('chevron-right')}</button>`).join('') || '<p class="selection-lead">준비 중인 MT가 없어요. 먼저 새 MT를 만들어주세요.</p>'}</div><button class="secondary selection-new" type="button" data-selection-new>${icon('plus')} 새 MT 만들기</button>`);
  }
  async function open(value) {
    window.motfRequireLogin(async () => {
      const stamp = ++version; pending = {...value,rooms:new Set()}; awaitingCreate = false;
      shell('<p class="selection-lead">준비 중인 MT를 불러오고 있어요.</p>');
      try {
        const list = await projects();
        if (stamp !== version || !pending) return;
        pending.projects = list; renderProjects();
      } catch (error) { if (stamp === version) $('.selection-error',dialog).textContent = error.message; }
    });
  }
  window.motfOpenStayPicker = (businessId,preferredRoom = '') => open({kind:'stay',businessId,preferredRoom});
  window.motfOpenShoppingPicker = (product,quantity) => open({kind:'shopping',product,quantity});

  function roomFooter() {
    if (!pending?.project) return;
    const stay = stays.find(stay => String(stay.id) === String(pending.businessId));
    const selected = stay.rooms.filter(room => pending.rooms.has(String(room.id)));
    $('[data-selection-count]',dialog).textContent = `${selected.length}개 객실 · ${money(selected.reduce((sum,room) => sum + mtRoomRangeTotal(stay,room,pending.project),0))}`;
    $('[data-selection-save]',dialog).disabled = !selected.length;
  }
  async function chooseProject(id) {
    pending.project = pending.projects.find(project => String(project.id) === String(id));
    if (!pending.project) throw new Error('선택한 MT를 찾을 수 없습니다.');
    if (pending.kind === 'shopping') { renderProduct(); return; }
    const stamp = ++version;
    shell('<p class="selection-lead">MT 일정에 가능한 객실을 확인하고 있어요.</p>');
    const availability = await window.motfGetCandidateRoomAvailability(id,pending.businessId);
    if (stamp !== version || !pending) return;
    pending.project = availability.project;
    const stay = stays.find(stay => String(stay.id) === String(pending.businessId));
    if (!stay) throw new Error('숙소 정보를 찾을 수 없습니다.');
    const unavailable = new Set(availability.unavailableOfferingIds.map(String));
    pending.rooms = new Set(stay.rooms.filter(room => String(room.id) === pending.preferredRoom && !unavailable.has(String(room.id))).map(room => String(room.id)));
    shell(`<button class="text-button" type="button" data-selection-back>${icon('arrow-left')} MT 다시 선택</button><div class="selection-context"><strong>${esc(stay.name)}</strong><span>${esc(pending.project.title)} · ${esc(pending.project.starts_on)} ~ ${esc(pending.project.ends_on)}</span></div><p class="selection-lead">필요한 객실을 여러 개 선택하세요. 예약은 아직 접수되지 않아요.</p><div class="selection-room-list">${stay.rooms.map(room => {
      const soldOut = unavailable.has(String(room.id));
      return `<label class="selection-room ${soldOut ? 'unavailable' : ''}"><input type="checkbox" data-selection-room="${room.id}" ${soldOut ? 'disabled' : ''} ${pending.rooms.has(String(room.id)) ? 'checked' : ''}><img src="${esc(room.image || stay.image)}" alt=""><span><strong>${esc(room.name)}</strong><small>기준 ${room.basePeople || '-'}명 / 최대 ${room.maxPeople || roomCapacityMax(room) || '-'}명</small><small>${soldOut ? '선택 일정 예약 마감' : money(mtRoomRangeTotal(stay,room,pending.project))}</small></span></label>`;
    }).join('')}</div><div class="selection-footer"><strong data-selection-count></strong><button class="primary" type="button" data-selection-save>선택한 객실 담기 ${icon('folder-plus')}</button></div>`);
    roomFooter();
  }
  function renderProduct() {
    const product = pending.product, rules = productOrderRules(product), variants = productVariants(product);
    pending.quantity = normalizeProductQuantity(product,pending.quantity);
    shell(`<button class="text-button" type="button" data-selection-back>${icon('arrow-left')} MT 다시 선택</button><div class="selection-context"><strong>${esc(pending.project.title)}</strong><span>${esc(label(pending.project))} · 장보기 후보</span></div><div class="selection-product"><img src="${esc(product.image)}" alt=""><div><h3>${esc(product.name)}</h3><span>${money(product.price)} / ${esc(product.unit)}</span></div></div>${variants.length > 1 ? `<label class="selection-field">상품 옵션<select data-selection-variant>${variants.map(item => `<option value="${item.id}" ${item.id === product.id ? 'selected' : ''}>${esc(item.variantLabel || item.unit)} · ${money(item.price)}</option>`).join('')}</select></label>` : ''}<label class="selection-field">수량 (${esc(rules.unit)})<input type="number" data-selection-quantity min="${rules.minimum}" max="1000" step="${rules.step}" value="${pending.quantity}" aria-label="담을 상품 수량"></label><p class="selection-lead">최소 ${rules.minimum}${esc(rules.unit)} · ${rules.step}${esc(rules.unit)} 단위. 내 MT 후보에 담으며 장바구니나 결제에는 영향을 주지 않아요.</p><div class="selection-footer"><strong data-selection-product-total>${money(product.price * pending.quantity)}</strong><button class="primary" type="button" data-selection-save>이 MT에 상품 담기 ${icon('folder-plus')}</button></div>`);
  }
  dialog.addEventListener('change',event => {
    const input = event.target;
    if (input.hasAttribute('data-selection-room')) {
      if (input.checked) pending.rooms.add(input.dataset.selectionRoom); else pending.rooms.delete(input.dataset.selectionRoom);
      roomFooter();
    }
    if (input.hasAttribute('data-selection-variant')) {
      pending.product = findProduct(input.value).product; renderProduct();
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
      if (button.hasAttribute('data-selection-project')) await chooseProject(button.dataset.selectionProject);
      if (button.hasAttribute('data-selection-save')) {
        if (pending.kind === 'stay') await window.motfSaveRoomsToProject(pending.project.id,pending.businessId,[...pending.rooms]);
        else {
          pending.quantity = normalizeProductQuantity(pending.product,$('[data-selection-quantity]',dialog).value);
          await window.motfSaveShoppingToProject(pending.project.id,pending.product.id,pending.quantity);
        }
        dialog.close(); pending = null;
        toast('선택한 내 MT에 담았어요.');
      }
    } catch (error) { $('.selection-error',dialog).textContent = error.message || '내 MT에 담지 못했습니다.'; }
    finally { button.disabled = false; }
  });
  dialog.addEventListener('cancel',() => { pending = null; version++; awaitingCreate = false; });
  window.motfResumeMtSelection = async project => {
    if (!awaitingCreate || !pending) return;
    awaitingCreate = false; pending.projects = [project]; await chooseProject(project.id);
  };
  document.addEventListener('keydown',event => {
    if (event.key === 'Enter' && event.target.matches('.home-post[data-post-id]')) event.target.click();
  });
})();
