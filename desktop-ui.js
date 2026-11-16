(() => {
  'use strict';
  if (!matchMedia('(min-width:1024px)').matches) return;
  const $ = (s, root = document) => root.querySelector(s), $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = escapeHtml, icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const model = window.MotfDesktopModel;
  const dialog = document.createElement('dialog'); dialog.className = 'desktop-dialog'; document.body.append(dialog);
  let dialogAction, activityRows = [], activityKey = '', activityVersion = 0, activityPending = false;
  let boardQuery = '', boardId = '', queued = false;
  function show(title, fields, action) {
    dialogAction = action;
    dialog.innerHTML = `<form data-desktop-dialog><h2 id="desktopDialogTitle">${esc(title)}</h2>${fields}<p class="desktop-error" role="alert" hidden></p><div class="desktop-dialog-actions"><button type="button" class="secondary-btn" data-desktop-close>취소</button><button type="submit" class="primary-btn">확인</button></div></form>`;
    dialog.setAttribute('aria-labelledby', 'desktopDialogTitle'); dialog.showModal(); refreshIcons();
  }
  function join() {
    motfRequireLogin(() => show('초대받은 MT에 참여', '<p>전달받은 초대코드를 입력해주세요.</p><label>초대코드<input name="code" required maxlength="160" autocomplete="off" autofocus></label>', async form => {
      const code = form.elements.code.value.trim(); if (!code) throw Error('초대코드를 입력해주세요.');
      const id = await window.motfAcceptMtInvite(code);
      state.mtDirectoryFilter = 'invited'; renderMyMt();
      if (id) await window.motfSelectMtProject(id);
      toast('초대받은 MT에 참여했습니다.');
    }));
  }
  function calendar() {
    $$('.flatpickr-calendar').forEach(node => {
      if (node.classList.contains('hasTime') && !node.querySelector('.flatpickr-months')) return;
      node.classList.add('desktop-calendar');
      const year = $('.cur-year', node);
      if (year) { year.readOnly = true; year.tabIndex = -1; year.setAttribute('aria-label', '현재 연도'); }
    });
  }
  function collapsible(form, name) {
    if (!form || form.dataset.desktopFilter) return;
    form.dataset.desktopFilter = 'true'; form.classList.add('desktop-collapsible-filter');
    if (!form.id) form.id = 'desktopRecordFilters';
    const bar = document.createElement('div'); bar.className = 'desktop-filter-bar';
    bar.innerHTML = `<button class="desktop-filter-toggle" type="button" data-desktop-filter="${form.id}" aria-expanded="false" aria-controls="${form.id}">${icon('sliders-horizontal')}${name}${icon('chevron-down')}</button>`;
    form.before(bar); form.hidden = true;
  }
  function boardSearch() {
    if (currentRoute() !== 'boardDetail') return;
    const active = activeBoard();
    if (boardId !== active.id) { boardId = active.id; boardQuery = ''; $('.desktop-board-search')?.remove(); }
    const list = $('#boardPostList'); if (!list) return;
    if (!$('.desktop-board-search')) {
      const form = document.createElement('form'); form.className = 'desktop-board-search';
      form.innerHTML = '<input name="query" maxlength="100" placeholder="제목·내용 검색" aria-label="게시판 제목·내용 검색"><button class="secondary-btn" type="submit">검색</button><button class="icon-button" type="reset" aria-label="검색 초기화">'+icon('rotate-ccw')+'</button>';
      list.before(form);
      form.addEventListener('submit', e => { e.preventDefault(); boardQuery = form.elements.query.value; filterBoard(); });
      form.addEventListener('reset', () => { boardQuery = ''; filterBoard(); });
    }
    filterBoard();
  }
  function filterBoard() {
    let count = 0;
    $$('#boardPostList>[data-post-id]').forEach(card => { const row = activeBoard().posts.find(p => p.id === card.dataset.postId); card.hidden = !model.search(`${row?.title || ''} ${row?.body || ''}`, boardQuery); if (!card.hidden) count++; });
    let empty = $('#desktopBoardEmpty');
    if (!empty) { empty = document.createElement('p'); empty.id = 'desktopBoardEmpty'; empty.className = 'empty-state'; $('#boardPostList')?.after(empty); }
    empty.hidden = !boardQuery || count > 0;
    if (!empty.textContent) empty.textContent = '검색어에 맞는 게시글이 없습니다.';
  }
  function recreation() {
    if (currentRoute() !== 'community' || new URLSearchParams(location.search).get('section') !== 'recreation') return;
    const mainHeading = $('#community>.page-heading'), inner = $('#community .community-section-heading');
    if (!mainHeading || !inner) return;
    mainHeading.classList.add('desktop-recreation-heading');
    const actions = $('.community-panel-actions', inner);
    if (actions) mainHeading.append(actions);
    inner.hidden = true;
  }
  function merchant() {
    $$('.product-price-action').forEach(button => { button.classList.remove('primary'); });
    const tabs = $('#market .category-tabs') || $('#storeDetail .category-tabs');
    if (tabs && !tabs.dataset.desktopOrdered) {
      const children = [...tabs.children];
      children.sort((a,b) => { const ai = model.categoryOrder.indexOf(a.textContent.trim()), bi = model.categoryOrder.indexOf(b.textContent.trim()); return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi); });
      tabs.append(...children); tabs.dataset.desktopOrdered = 'true';
    }
    const notice = $('.mt-save-receipt');
    if (notice && !$('.desktop-mt-jump', notice)) {
      const target = $('[data-mt-jump]', notice); if (!target) return;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'desktop-mt-jump'; button.dataset.mtJump = target.dataset.mtJump; button.textContent = '내 MT로 이동';
      $('[data-mt-receipt-close]', notice)?.before(button);
    }
  }
  function costs() {
    const project = state.mtProject; if (currentRoute() !== 'myMt' || !project || project.is_owner === false) return;
    $$('#mtOtherCosts .mt-expense-row').forEach(row => {
      if (row.classList.contains('desktop-editable-cost')) return;
      const remove = $('[data-remove-mt-item]', row), item = project.items?.find(item => item.id === remove?.dataset.removeMtItem); if (!item) return;
      row.classList.add('desktop-editable-cost'); row.dataset.costId = item.id;
      row.innerHTML = `<input data-desktop-cost="title" value="${esc(item.title)}" maxlength="100" aria-label="기타 비용 항목"><label class="desktop-expense-price"><input data-desktop-cost="amount" value="${Number(item.amount || 0)}" type="number" min="0" max="100000000" aria-label="기타 비용 금액"><span>원</span></label>`;
      row.append(remove);
    });
  }
  async function saveCost(row) {
    if (row.dataset.saving) return;
    const project = state.mtProject, item = project.items.find(item => item.id === row.dataset.costId);
    const title = $('[data-desktop-cost=title]',row).value.trim(), amount = Number($('[data-desktop-cost=amount]',row).value);
    if (!item || !title || !Number.isSafeInteger(amount) || amount < 0 || amount > 100000000) { toast('항목명과 0원 이상의 금액을 확인해주세요.'); return; }
    if (title === item.title && amount === Number(item.amount)) return;
    row.dataset.saving = 'true'; $$('input',row).forEach(input => input.disabled = true);
    try {
      const {data,error} = await motfSupabase.from('mt_project_items').update({title,amount}).eq('id',item.id).eq('project_id',project.id).select('id').single();
      if(error || !data) throw error || Error('변경 권한을 확인해주세요.');
      await motfSelectMtProject(project.id); toast('비용을 저장했습니다.');
    } catch(error) { toast(error.message || '비용을 저장하지 못했습니다.'); }
    finally { delete row.dataset.saving; $$('input',row).forEach(input => input.disabled = false); }
  }
  function guide() {
    const node = $('#marketGuideDialog'); if (!node) return;
    const key = 'motf.desktop.market-guide.20261116';
    if (!node.dataset.desktopGuide) {
      node.dataset.desktopGuide = 'true';
      node.addEventListener('cancel', event => event.preventDefault());
      node.addEventListener('click', event => { if(event.target === node || event.target.closest('[data-close-motf-dialog]')) {event.preventDefault();event.stopImmediatePropagation();} }, true);
      $('form',node).addEventListener('submit', () => { sessionStorage.setItem(key,'1'); });
    }
    if (currentRoute() === 'market' && !sessionStorage.getItem(key) && !node.open) { node.showModal(); refreshIcons(); }
  }
  function authNote() {
    $$('#authMessage').forEach(node => node.classList.toggle('desktop-auth-note', node.textContent.trim() === '이 기능은 로그인 후 이용할 수 있어요.'));
  }
  function decorate() {
    calendar(); collapsible($('#usagePeriodFilter'), '기간 검색'); collapsible($('[data-record-filter]'), '검색·필터');
    boardSearch(); recreation(); merchant(); costs(); authNote();
    const cost = window.motfLocalDesign?.getCosts();
    if (cost?.tier) {
      const foot = $('#home .calculator-foot span');
      const text = `예산을 ${cost.tier} 준비하는 예시입니다. 이동·레크 비용과 약 8%의 예비비를 포함하며 실제 견적과 다릅니다.`;
      if (foot && foot.textContent !== text) foot.textContent = text;
    }
  }
  async function renderMyActivity(force = false) {
    const user = window.motfCurrentUserId, client = window.motfSupabase, host = $('#myActivityList');
    if (!user || !client || !host || activityPending || !force && activityKey === user) return;
    const version = ++activityVersion; activityPending = true; activityKey = user;
    try {
      const {data,error} = await client.rpc('get_my_community_activity');
      if (version !== activityVersion || user !== window.motfCurrentUserId) return;
      if (error) throw error;
      activityRows = data || [];
      host.innerHTML = `<p class="desktop-policy-note">댓글이 달린 글·답글이 달린 댓글은 수정할 수 없습니다. 삭제한 내용은 안내 문구로 바뀌며 대화 기록은 유지됩니다.</p>` + (activityRows.length ? activityRows.map(row => {
        const policy = model.authorPolicy({owned:true,deleted:row.deleted_at,replyCount:row.reply_count});
        const type = {post:'게시글',comment:'댓글',submission:'레크 추천'}[row.kind];
        return `<article class="desktop-activity-card"><div class="desktop-activity-copy"><span class="pill">${type}</span><button class="desktop-activity-title" data-desktop-activity-open="${row.id}">${esc(row.kind === 'comment' ? row.body : row.title)}</button><small>${new Date(row.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</small></div>${row.kind === 'submission' ? `<span>${esc(row.status)}</span>` : `<div class="desktop-author-actions"><button type="button" data-desktop-edit="${row.id}" ${policy.edit ? '' : 'disabled title="댓글·답글이 달려 수정할 수 없습니다"'}>${icon('pencil')}수정</button><button type="button" data-desktop-delete="${row.id}">${icon('trash-2')}삭제</button></div>`}</article>`;
      }).join('') : '<div class="empty-state">작성한 글이나 댓글이 없습니다.</div>'); refreshIcons();
    } catch(error) { activityKey = ''; host.innerHTML = `<p class="desktop-policy-note">내 활동을 불러오지 못했습니다. ${esc(error.message)} <button class="text-button" data-desktop-activity-retry>다시 시도</button></p>`; }
    finally { activityPending = false; }
  }
  function editActivity(id, remove) {
    const row = activityRows.find(item => item.id === id); if (!row || row.kind === 'submission') return;
    const fields = remove ? '<p>내용을 삭제할까요? 댓글과 답글은 삭제하지 않고 작성 내용만 지웁니다.</p>' : `${row.kind === 'post' ? `<label>제목<input name="title" required maxlength="100" value="${esc(row.title)}"></label>` : ''}<label>내용<textarea name="body" required maxlength="${row.kind === 'post' ? 10000 : 2000}">${esc(row.body)}</textarea></label>`;
    show(remove ? '작성 내용 삭제' : '작성 내용 수정', fields, async form => {
      const {error} = await motfSupabase.rpc('manage_my_community_item',{item_type:row.kind,item_id:row.id,operation:remove?'delete':'edit',new_title:form.elements.title?.value || '',new_body:form.elements.body?.value || ''});
      if(error) throw error;
      await renderMyActivity(true); await window.motfReloadDesktopCommunity?.();
      toast(remove ? '내용을 삭제했습니다.' : '변경사항을 저장했습니다.');
    });
  }
  async function openActivity(id) {
    const row=activityRows.find(item=>item.id===id), user=window.motfCurrentUserId;
    if(!row)return;
    if(row.kind==='submission')return navigate('recreation');
    const postId=row.post_id||row.id;
    let board=communityBoards.find(item=>item.posts.some(post=>post.id===postId));
    try {
      if(!board){
        const client=window.motfSupabase;
        const {data:post,error}=await client.from('community_posts').select('id,board_key,title,body,author_id,author_name,created_at,media_urls').eq('id',postId).eq('is_hidden',false).maybeSingle();
        if(error)throw error;
        board=communityBoards.find(item=>item.id===post?.board_key);
        if(!post||!board)throw Error('삭제되었거나 공개되지 않은 게시글입니다.');
        const [comments,likes]=await Promise.all([client.from('community_comments').select('id,user_id,parent_comment_id,body,created_at').eq('post_id',postId).order('created_at'),client.from('community_post_likes').select('user_id').eq('post_id',postId)]);
        if(comments.error||likes.error)throw comments.error||likes.error;
        if(user!==window.motfCurrentUserId||currentRoute()!=='myUsage')return;
        const byId=new Map((comments.data||[]).map(item=>[item.id,item]));
        if(!board.posts.some(item=>item.id===post.id))board.posts.push({id:post.id,title:post.title,body:post.body,authorId:post.author_id,authorName:post.author_name,createdAt:post.created_at,media:post.media_urls?.length?`첨부 ${post.media_urls.length}`:'',likes:(likes.data||[]).length,comments:(comments.data||[]).map(item=>({body:item.body,userId:item.user_id,replyTo:byId.get(item.parent_comment_id)?.user_id||null,createdAt:item.created_at}))});
      }
      state.activeBoardId=board.id;state.activePostId=postId;navigate('postDetail');
    }catch(error){toast(error.message||'게시글을 불러오지 못했습니다.');}
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.matches('[data-join-mt-invite]')) {event.preventDefault();event.stopImmediatePropagation();join();return;}
    if (button.matches('[data-desktop-close]')) dialog.close();
    if (button.matches('[data-desktop-filter]')) {const target = document.getElementById(button.dataset.desktopFilter); target.hidden = !target.hidden; button.setAttribute('aria-expanded',String(!target.hidden));}
    if (button.matches('[data-desktop-edit],[data-desktop-delete]')) editActivity(button.dataset.desktopEdit || button.dataset.desktopDelete,button.hasAttribute('data-desktop-delete'));
    if (button.matches('[data-desktop-activity-retry]')) void renderMyActivity(true);
    if (button.matches('[data-desktop-activity-open]')) {
      void openActivity(button.dataset.desktopActivityOpen);
    }
  },true);
  document.addEventListener('submit', async event => {
    if (!event.target.matches('[data-desktop-dialog]')) return;
    event.preventDefault(); const form = event.target, button = $('[type=submit]',form), errorNode = $('.desktop-error',form); button.disabled = true;
    try {await dialogAction(form);dialog.close();}catch(error){errorNode.hidden=false;errorNode.textContent=error.message || '처리하지 못했습니다.';}finally{button.disabled=false;}
  });
  document.addEventListener('focusout', event => { const row = event.target.closest('.desktop-editable-cost'); if (row && event.target.matches('input') && !row.contains(event.relatedTarget)) void saveCost(row); });
  document.addEventListener('keydown', event => {if(event.key === 'Enter' && event.target.matches('[data-desktop-cost]')) {event.preventDefault();event.target.blur();}});
  window.addEventListener('motf:routechange', () => {decorate();guide();if(currentRoute()==='myUsage')void renderMyActivity(true);});
  window.addEventListener('motf:auth-ready', () => { activityVersion++; activityKey=''; activityPending=false;activityRows=[];if(currentRoute()==='myUsage')void renderMyActivity(true); });
  new MutationObserver(() => { if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate();}); }).observe(document.body,{childList:true,subtree:true});
  window.motfDesktopUI = {renderMyActivity,showMarketGuide:guide};
  decorate(); guide(); if(currentRoute()==='myUsage')void renderMyActivity();
})();
