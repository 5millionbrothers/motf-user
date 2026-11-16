(() => {
  'use strict';
  if (!matchMedia('(min-width:1024px)').matches) return;
  const $ = (s, root = document) => root.querySelector(s);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const owner = Boolean($('#chatMessageInput')), input = () => $(owner ? '#chatMessageInput' : '#chatText');
  if (!input()) return;
  const presets = owner ? [
    ['전화 안내','안녕하세요. 전화로 문의 주시면 더 자세하게 안내드리겠습니다. 편하신 연락 시간도 남겨주세요.'],
    ['확인 중','문의 주셔서 감사합니다. 예약 일정과 요청하신 내용을 확인한 뒤 답변드리겠습니다.'],
  ] : [['예약 문의','안녕하세요. 해당 일정과 인원으로 예약 가능한지, 추가 비용은 있는지 문의드립니다.'],['픽업 문의','안녕하세요. 주문 상품의 픽업 장소와 가능한 시간을 확인하고 싶습니다.']];
  const bar = document.createElement('div'); bar.className = 'desktop-reply-bar';
  bar.innerHTML = `<span>빠른 답변</span>${presets.map(([title],i)=>`<button type="button" data-reply-preset="${i}" title="메시지 입력란에 넣기">${title}</button>`).join('')}<button type="button" data-replies-manage>내 문구</button><span class="desktop-reply-feedback" role="status"></span><button type="button" data-replies-refresh aria-label="대화 새로고침" title="대화 새로고침"><i data-lucide="refresh-cw"></i></button>`;
  (owner ? input().closest('.chat-footer') : input().closest('form')).before(bar);
  const dialog = document.createElement('dialog'); dialog.className = 'desktop-replies-dialog'; dialog.setAttribute('aria-label','내 빠른 답변'); document.body.append(dialog);
  let rows = [], version = 0, editing = '', busy = false, account = '', pendingDelete = '';
  const client = () => window.motfSupabase;
  const currentId = () => owner ? window.motfCurrentProfile?.id : window.motfCurrentUserId;
  function put(text) {
    const field = input(); if (!field || field.disabled) return;
    const start = field.selectionStart ?? field.value.length, end = field.selectionEnd ?? start;
    field.setRangeText(text,start,end,'end'); field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();
    $('.desktop-reply-feedback',bar).textContent = '입력했어요';
    setTimeout(()=>$('.desktop-reply-feedback',bar).textContent='',1800);
  }
  function render(error = '', draft) {
    const item = draft || rows.find(row=>row.id===editing);
    dialog.innerHTML = `<div class="desktop-replies-top"><h2>내 빠른 답변</h2><button type="button" data-replies-close aria-label="닫기" title="닫기">×</button></div><div class="desktop-replies-list">${rows.map(row=>`<article><button type="button" data-reply-use="${row.id}" title="메시지 입력란에 넣기">${esc(row.title)}</button><button type="button" data-reply-edit="${row.id}" aria-label="${esc(row.title)} 수정" title="수정">수정</button><button type="button" data-reply-delete="${row.id}" title="삭제">${pendingDelete===row.id?'삭제 확인':'삭제'}</button></article>`).join('')||`<p>${busy?'문구를 불러오는 중입니다.':'저장한 문구가 없습니다.'}</p>`}</div><form data-reply-form><h3>${editing?'문구 수정':'새 문구'}</h3><label>이름<input name="title" required maxlength="30" value="${esc(item?.title||'')}" placeholder="예: 입실 안내" ${busy?'disabled':''}></label><label>내용<textarea name="body" required maxlength="2000" rows="4" ${busy?'disabled':''}>${esc(item?.body||'')}</textarea></label><p class="desktop-reply-error" role="alert">${esc(error)}</p><div class="desktop-replies-actions">${editing?'<button type="button" data-reply-new>새 문구</button>':''}<button type="submit" ${busy?'disabled':''}>${busy?'처리 중':'저장'}</button></div></form>`;
  }
  async function load() {
    const token = ++version; account = currentId();
    if (!account || !client()) throw Error('로그인 후 이용해주세요.');
    const {data,error} = await client().from('chat_reply_templates').select('id,title,body').eq('user_id',account).order('created_at').limit(100);
    if (token!==version || account!==currentId()) return;
    if (error) throw Error('문구를 불러오지 못했습니다. 94번 SQL 적용을 확인해주세요.');
    rows=data||[];busy=false;render();
  }
  bar.addEventListener('click', async event=>{
    const refresh=event.target.closest('[data-replies-refresh]');
    if(refresh){refresh.disabled=true;try{const reload=owner?window.loadMotfPartnerChats:window.motfReloadChats;await reload?.();}catch{ $('.desktop-reply-feedback',bar).textContent='연결을 확인해주세요.';}finally{refresh.disabled=false;}return;}
    const preset=event.target.closest('[data-reply-preset]'); if(preset)return put(presets[Number(preset.dataset.replyPreset)][1]);
    if (!event.target.closest('[data-replies-manage]')) return;
    editing='';pendingDelete='';rows=[];busy=true;render();dialog.showModal();
    try{await load();}catch(error){busy=false;render(error.message);}
  });
  dialog.addEventListener('click',async event=>{
    const target=event.target.closest('button');if(!target)return;
    if(target.hasAttribute('data-replies-close'))dialog.close();
    if(busy)return;
    if(target.dataset.replyUse){const row=rows.find(row=>row.id===target.dataset.replyUse);if(row&&account===currentId()){dialog.close();put(row.body);}}
    if(target.dataset.replyEdit){editing=target.dataset.replyEdit;pendingDelete='';render();}
    if(target.hasAttribute('data-reply-new')){editing='';render();}
    if(target.dataset.replyDelete&&!busy){
      const id=target.dataset.replyDelete;if(pendingDelete!==id){pendingDelete=id;render();return;}
      const token=version;busy=true;target.disabled=true;
      try{if(account!==currentId())throw Error('로그인 정보가 변경되었습니다.');const {error}=await client().from('chat_reply_templates').delete().eq('id',id).eq('user_id',account);if(error)throw error;if(token===version){pendingDelete='';editing='';busy=false;await load();}}
      catch(error){if(token===version){busy=false;render(error.message);}}finally{busy=false;}
    }
  });
  dialog.addEventListener('submit',async event=>{
    if(!event.target.matches('[data-reply-form]'))return;event.preventDefault();if(busy)return;
    const form=event.target,title=form.elements.title.value.trim(),body=form.elements.body.value.trim(),token=version;
    if(!title||!body)return render('이름과 내용을 입력해주세요.');
    busy=true;$('[type=submit]',form).disabled=true;
    try{
      if(account!==currentId()||!account)throw Error('로그인 정보가 변경되었습니다.');
      let query=client().from('chat_reply_templates');
      query=editing?query.update({title,body}).eq('id',editing).eq('user_id',account):query.insert({title,body,user_id:account});
      const {data,error}=await query.select('id').single();if(error||!data)throw error||Error('문구를 저장하지 못했습니다.');
      if(token===version){editing='';busy=false;await load();}
    }catch(error){if(token===version){busy=false;render(error.message,{title,body});}}finally{busy=false;}
  });
  dialog.addEventListener('close',()=>{version++;rows=[];editing='';pendingDelete='';busy=false;});
  const reset=()=>{if(account&&account!==currentId()){version++;rows=[];account='';dialog.close();}};
  window.addEventListener('motf:auth-ready',reset);
  client()?.auth.onAuthStateChange((event)=>{if(['SIGNED_OUT','SIGNED_IN'].includes(event)){version++;rows=[];account='';dialog.close();}});
  window.lucide?.createIcons({root:bar});
})();
