(() => {
  const $=(selector,root=document)=>root.querySelector(selector),$$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const esc=escapeHtml,icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`,won=value=>Math.round(value).toLocaleString('ko-KR');
  const day=offset=>{const date=new Date();date.setDate(date.getDate()+offset);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};
  const draft={name:'우리 MT 준비하기',people:32,budget:3000000,start:day(7),end:day(8),region:'가평',extraCosts:[],marketItems:[]};
  let templates,slides=[],slideIndex=0,step=100000,initialized=false,carry=false,destination='',timer,rankSignature='',rankedIds=[];
  document.body.classList.add('design-main');document.body.dataset.concept='home';
  const header=$('.app-header');header.className='site-header wrap';
  const brand=$('.brand',header);header.prepend(brand);$('.header-left',header).remove();
  $('.top-nav',header).className='site-nav';$('.header-account-actions',header).classList.add('header-actions');
  $$('.header-actions .icon-nav').forEach(button=>button.classList.add('icon-button'));
  $('.header-actions [data-route="mypage"]').classList.add('home-account');
  $('.header-actions').insertAdjacentHTML('beforeend',`<button class="icon-button" data-local-organization title="단체 관리" aria-label="단체 관리">${icon('users-round')}</button><button class="login" data-route="mypage" aria-label="로그인">로그인</button>`);
  $('.mobile-bottom-nav').classList.add('mobile-navigation');
  $('.site-footer').classList.add('wrap');
  const searchDialog=document.createElement('dialog');searchDialog.className='motf-dialog local-search-dialog';document.body.append(searchDialog);
  const filterDialog=document.createElement('dialog');filterDialog.className='motf-dialog local-filter-dialog';filterDialog.innerHTML=`<div class="modal-top"><h2>숙소 검색</h2><button class="icon-button" data-local-close aria-label="닫기">${icon('x')}</button></div>`;document.body.append(filterDialog);
  const filterForm=$('#stayFilters'),advanced=$('#stayAdvancedFilters'),filterAnchor=document.createElement('span');filterAnchor.hidden=true;filterForm.before(filterAnchor);
  const filterSummary=document.createElement('div');filterSummary.className='mobile-stay-search';filterAnchor.before(filterSummary);
  filterDialog.insertAdjacentHTML('beforeend','<button class="primary" data-local-filter-apply>이 조건으로 숙소 찾기</button>');
  function filterLayout(){if(innerWidth<700){if(filterForm.parentElement!==filterDialog){filterDialog.insertBefore(filterForm,$('[data-local-filter-apply]',filterDialog));filterDialog.insertBefore(advanced,$('[data-local-filter-apply]',filterDialog));}filterForm.classList.add('local-filter-open');}else{if(filterForm.parentElement===filterDialog)filterAnchor.after(filterForm,advanced);filterForm.classList.remove('local-filter-open');filterDialog.close();$$('input',filterForm).forEach(input=>{const picker=input._flatpickr;if(picker?.calendarContainer?.parentElement===filterDialog){picker.close();picker.config.appendTo=undefined;document.body.append(picker.calendarContainer);}});}const signature=[$('#stayRegion').value,$('#stayCheckInDate').value,$('#stayCheckOutDate').value,$('#stayPeople').value].join('|');if(filterSummary.dataset.signature!==signature){filterSummary.dataset.signature=signature;filterSummary.innerHTML=`<button data-local-filter-open>${icon('calendar-days')}<span>${esc($('#stayRegion').value)} · ${esc($('#stayCheckInDate').value.slice(5))}–${esc($('#stayCheckOutDate').value.slice(5))}</span></button><button data-local-filter-open>${icon('users-round')} ${esc($('#stayPeople').value)}명</button><button data-local-filter-open>${icon('sliders-horizontal')} 필터</button>`;refreshIcons();}}
  function datePickers(root){window.motfInitializeDatePickers?.();$$('input',root).forEach(input=>{const picker=input._flatpickr;if(picker?.calendarContainer&&root.tagName==='DIALOG'){picker.config.appendTo=root;root.append(picker.calendarContainer);}});}
  const handoff=document.createElement('dialog');handoff.className='motf-dialog local-handoff';handoff.innerHTML=`<div class="modal-top"><h2>내 MT에서 이어서 준비해요</h2><button class="icon-button" data-local-close aria-label="닫기">${icon('x')}</button></div><p class="modal-lead">새 MT를 만들거나 기존 MT를 선택해 실제 숙소와 장보기를 담아보세요.</p><div class="modal-actions"><button class="primary" data-local-new>새 MT 만들기 ${icon('plus')}</button><button class="secondary" data-local-existing>기존 MT 선택</button></div>`;document.body.append(handoff);

  function target(url){try{const value=new URL(url||'/events',location.origin);if(!['http:','https:'].includes(value.protocol))return{route:'events'};if(value.origin===location.origin||['motf.co.kr','www.motf.co.kr'].includes(value.hostname)){if(value.pathname==='/events/detail')return{event:value.searchParams.get('event')};const route=Object.entries(routePaths).find(([,path])=>path===value.pathname.replace(/\/$/,'')||path===value.pathname)?.[0];if(route)return{route};}return{url:value.href};}catch{return{route:'events'};}}
  function promos(){
    const cards=state.homepageCards.filter(card=>card.is_active!==false&&(!card.starts_at||Date.parse(card.starts_at)<=Date.now())&&(!card.ends_at||Date.parse(card.ends_at)>Date.now())).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order));
    const selected=new Set(cards.map(card=>target(card.link_url).event));
    return [{kind:'내 MT',title:'흩어진 MT 준비,\n우리 공간에 모아봐요.',description:'숙소 후보와 장보기, 예산을 함께 정리해요.',button:'내 MT 만들기',image:'design/mt-prep.jpg',theme:'guide',create:true},{kind:'우리 단체',title:'올해의 준비가,\n다음 총무의 시작이 되도록.',description:'학생회·동아리·모임의 MT 기록과 담당자를 한곳에서 관리하세요.',button:'우리 단체 만들기',image:'design/mt-prep.jpg',theme:'guide',organization:true},...cards.map(card=>({kind:card.placement==='card_news'?'CARD NEWS':'모티프 소식',title:card.title,description:card.subtitle||'',button:card.link_label||'자세히 보기',image:card.image_url,theme:'original',target:target(card.link_url)})),...state.platformEvents.filter(event=>!['draft','cancelled','completed'].includes(effectiveEventStatus(event))&&!selected.has(String(event.id))).slice(0,5).map(event=>({kind:'MOriginal',title:event.title,description:event.short_description||'',button:'프로그램 보기',image:event.poster_url,theme:'original',target:{event:String(event.id)}}))];
  }
  function context(){
    const signature=stays.map(stay=>[stay.id,stay.displayOrder,stay.discoveryWeight,stay.isFeatured].join(':')).join('|');
    if(signature!==rankSignature){rankSignature=signature;rankedIds=(window.motfRankStayExposure?window.motfRankStayExposure(stays,'home'):stays).slice(0,4).map(stay=>stay.id);}
    const ranked=rankedIds.map(id=>stays.find(stay=>stay.id===id)).filter(Boolean);
    const products=stores.flatMap(store=>{ensureMarketBundleProducts(store);return groupProductVariants(store.products).map(product=>({...product,storeName:catalogLabel(store.name),name:catalogLabel(product.name),unit:catalogLabel(product.unit||''),image:esc(product.image)}));}).slice(0,4);
    const posts=communityBoards.flatMap(board=>board.posts.map(post=>({...post,board}))).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,2);
    return {state:draft,budgetStep:step,stays:ranked.map(stay=>({id:stay.id,name:catalogLabel(stay.name),region:catalogLabel(stay.region),badge:catalogLabel(stay.amenities?.[0]||'단체 숙소'),maxPeople:stay.maxPeople||'문의',rooms:stay.roomCount||stay.rooms?.length||0,bathLabel:stay.bathCount?'화장실 '+stay.bathCount+'개':'화장실 수 확인 필요',price:estimateMtStayCost(stay).total,image:esc(stay.image)})),pageProducts:()=>products,homePosts:posts.map(post=>({id:post.id,author:esc(post.authorName||'익명'),time:relativeTime(post.createdAt),label:esc(post.board.title),title:esc(post.title),symbol:'messages-square'})),homePromos:slides.map(slide=>({...slide,title:esc(slide.title),description:esc(slide.description),kind:esc(slide.kind),button:esc(slide.button),image:esc(slide.image.startsWith('design/')?'assets/'+slide.image:slide.image)})),HomeStudy:{promo:slideIndex,isMobile:()=>innerWidth<700},regions:['가평','대성리','청평','양평']};
  }
  function wire(root){
    const attrs={'data-page-choose-stay':'data-add-mt-candidate','data-mt-start-product':'data-add-mt-shopping','data-home-product':'data-product-id','data-home-post':'data-post-id'};
    Object.entries(attrs).forEach(([from,to])=>$$( `[${from}]`,root).forEach(el=>{el.setAttribute(to,el.getAttribute(from));el.removeAttribute(from);}));
    $$('[data-action]',root).forEach(button=>{if(button.dataset.action==='organization'){button.dataset.localOrganization='';button.removeAttribute('data-action');return;}const route={workspace:'myMt',stays:'stays',market:'market',community:'community',original:'events',recreation:'recreation',budget:'budgetPreview'}[button.dataset.action];if(route&&!button.closest('.hardware-key')){button.dataset.route=route;button.removeAttribute('data-action');}});
    const form=$('[data-form="search"]',root);if(form){form.dataset.homeStaySearch='';[['region','region'],['start','checkIn'],['end','checkOut'],['people','people']].forEach(([name,field])=>{form.elements[name].dataset.staySearchField=field;});syncStaySearchPanel(form);}
    $$('.home-stay-card',root).forEach(card=>{const price=$('.home-price',card);if(price?.textContent.startsWith('0'))price.textContent='요금 확인 필요';});
    refreshIcons();
  }
  function banner(){
    const host=$('#homeLocalBanner');if(!host)return;
    host.innerHTML=templates.homeEditorial();const slide=slides[slideIndex];const promo=$('.home-promo',host);promo.className=`home-promo theme-${slide.theme}`;
    const image=$('.home-promo-visual img',host);image.src=slide.image.startsWith('design/')?'assets/'+slide.image:slide.image;
    const button=$('.home-promo-copy .text-button',host);button.removeAttribute('data-action');button.removeAttribute('data-page');if(slide.create)button.dataset.createMtProject='';else if(slide.organization)button.dataset.localOrganization='';else if(slide.target?.event){if(state.platformEvents.some(event=>String(event.id)===slide.target.event&&!['draft','cancelled'].includes(event.status)))button.dataset.eventId=slide.target.event;else button.dataset.route='events';}else if(slide.target?.url){const link=document.createElement('a');link.className=button.className;link.innerHTML=button.innerHTML;link.href=slide.target.url;link.target='_blank';link.rel='noopener noreferrer';button.replaceWith(link);}else button.dataset.route=slide.target?.route||'events';
    refreshIcons();
  }
  function render(){
    const oldId=slides[slideIndex]?.title;slides=promos();slideIndex=Math.max(0,slides.findIndex(slide=>slide.title===oldId));templates=motfLocalTemplates(context());
    const home=$('#home');home.classList.remove('home-view');home.classList.add('home','search-first');
    if(!initialized){home.innerHTML=`<section class="home-start wrap" id="home-start">${templates.homeSearch()}</section><div id="homeLocalBanner"></div><div id="homeLocalStays"></div><div id="homeLocalMarket"></div>${templates.homeCalculator()}<div id="homeLocalCommunity"></div>${templates.organizationBand()}`;initialized=true;wire(home);}
    const homeTemplates=motfLocalTemplates({...context(),state:{...draft,people:selectedStayPeople()}});
    $('#homeLocalStays').innerHTML=homeTemplates.homeStays();$('#homeLocalMarket').innerHTML=homeTemplates.homeMarket();$('#homeLocalCommunity').innerHTML=templates.homeCommunity();
    if(!stays.length)$('#homeLocalStays .home-stay-grid').innerHTML=`<div class="page-empty">${state.catalogLoading?'숙소를 불러오고 있어요.':state.catalogError?'숙소 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.':'공개된 숙소를 준비하고 있어요.'}</div>`;
    if(!stores.some(store=>store.products.length))$('#homeLocalMarket .home-product-grid').innerHTML='<div class="page-empty">공개된 상품을 준비하고 있어요.</div>';
    if(!context().homePosts.length)$('#homeLocalCommunity .home-posts').innerHTML='<div class="page-empty"><h3>함께 나누는 MT 이야기</h3><button class="text-button" data-route="community">커뮤니티 둘러보기 '+icon('arrow-right')+'</button></div>';
    wire(home);banner();clearTimeout(timer);const times=state.homepageCards.flatMap(card=>[card.starts_at,card.ends_at]).filter(Boolean).map(Date.parse).filter(time=>time>Date.now());if(times.length)timer=setTimeout(render,Math.min(2147483000,Math.min(...times)-Date.now()+100));
    update();
  }
  function update(){
    const cost=templates.costs(),parts=templates.budgetParts(),root=$('#home');
    const values={people:draft.people,remaining:won(cost.remaining),used:won(cost.used),'per-person':won(cost.perPerson),'other-cost':won(cost.other),dates:`${draft.start} / ${draft.end}`,region:draft.region};
    Object.entries(values).forEach(([key,value])=>$$(`[data-value="${key}"]`,root).forEach(el=>el.textContent=value));
    parts.forEach(part=>{$$(`.meter .${part.key}-meter`,root).forEach(el=>el.style.width=part.percent+'%');$$(`[data-part-amount="${part.key}"]`,root).forEach(el=>el.textContent=won(part.amount));$$(`[data-part-percent="${part.key}"]`,root).forEach(el=>el.textContent=Number(part.percent.toFixed(1))+'%');});
    $('.meter',root)?.setAttribute('aria-label',parts.map(part=>`${part.name} ${won(part.amount)}원`).join(', '));
    $$('[data-input="people"]',root).forEach(el=>el.value=draft.people);$$('[data-input="budget"],[data-input="budget-range"]',root).forEach(el=>{if(el!==document.activeElement)el.value=draft.budget;el.step=step;if(el.type==='range')el.max=Math.max(10000000,draft.budget);});
    $$('[data-budget-step]',root).forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.budgetStep)===step)));
    $('.kit-screen',root)?.classList.toggle('is-over-budget',cost.remaining<0);$('[data-budget-label]',root).textContent=cost.remaining<0?'예산을 초과했어요':'예시 배분 후 남은 예산';
    $('[data-budget-basis]',root).textContent=cost.remaining<0?'예산 초과 · 사용 예정액 기준':'예시 구성비 · 실제 견적 아님';
  }
  function extras(){const host=$('#expense-rows');host.innerHTML=templates.expenseRows();update();refreshIcons();}
  function openHandoff(route=''){if(!draft.start||draft.end<=draft.start)return toast('도착일은 출발일 이후로 선택해주세요.');destination=route;handoff.showModal();}
  async function afterProjectCreated(project){if(!carry)return;carry=false;const items=draft.extraCosts.filter(item=>item.amount>0).map(item=>({title:item.name,amount:item.amount}));if(items.length)try{await motfAddMtOtherItems(items);await motfSelectMtProject(project.id);}catch(error){toast(`MT는 만들었지만 기타 비용을 저장하지 못했습니다: ${error.message}`);}if(destination){const route=destination;destination='';navigate(route);}}
  function renderMtExtras(project){let host=$('#mtOtherCosts');if(!host){host=document.createElement('section');host.id='mtOtherCosts';host.className='mt-section';$('.mt-project-main')?.append(host);}host.innerHTML=`<div class="mt-section-heading"><h2>기타 비용</h2></div>${(project.items||[]).filter(item=>['other','transport','activity'].includes(item.item_kind)&&item.status!=='cancelled').map(item=>`<div class="mt-expense-row"><span>${esc(item.title)}</span><strong>${won(item.amount*item.quantity)}원</strong>${project.is_owner!==false?`<button class="icon-button" data-remove-mt-item="${item.id}" aria-label="비용 삭제">${icon('x')}</button>`:''}</div>`).join('')}${project.is_owner!==false?'<form data-local-other class="local-inline-form"><input name="title" required maxlength="100" placeholder="비용 항목" aria-label="비용 항목"><input name="amount" type="number" min="1" max="100000000" required placeholder="금액" aria-label="금액"><button class="secondary">추가</button></form>':''}`;window.motfCommunityDesign?.mountSharing(project);}
  function close(){handoff.close();searchDialog.close();filterDialog.close();}
  function routeStyle(){const route=currentRoute();$$('main>.view').forEach(el=>el.classList.toggle('detail-app',el.id!=='home'));$$('.site-nav [data-route],.mobile-navigation [data-route]').forEach(el=>{if(el.classList.contains('active'))el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});close();adapt();}
  function adapt(){
    const aliases={'.primary-btn':'primary','.secondary-btn':'secondary','.ghost-btn':'text-button','.icon-action':'icon-button','.view-title':'page-heading','.stay-list-layout':'stay-catalog-layout','.stay-card':'catalog-stay','.product-grid':'retained-market-grid','.mt-project-main':'mt-workspace-main','.mt-project-side':'mt-workspace-side','.mt-project-layout':'mt-workspace-layout','.mt-project-card':'mt-directory-item','.chat-shell':'local-chat-shell'};
    Object.entries(aliases).forEach(([selector,cl])=>$$(selector).forEach(el=>{if(!el.classList.contains(cl))el.classList.add(cl);}));
    if(currentRoute()==='stays')filterLayout();
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('button,a');if(!button)return;
    if(button.hasAttribute('data-local-close')){button.closest('dialog')?.close();return;}
    if(button.hasAttribute('data-local-organization')){motfRequireLogin(async()=>{for(let attempt=0;attempt<30&&!window.motfGetOrganizationId;attempt++)await new Promise(resolve=>setTimeout(resolve,100));if(!window.motfGetOrganizationId){navigate('mypage');return toast('단체 관리 정보를 불러오고 있어요. 잠시 후 다시 시도해주세요.');}const trigger=document.createElement('button');trigger.dataset.orgOpen='';trigger.hidden=true;document.body.append(trigger);trigger.click();trigger.remove();});return;}
    if(button.hasAttribute('data-local-filter-open')){filterLayout();filterDialog.showModal();datePickers(filterDialog);refreshIcons();return;}
    if(button.hasAttribute('data-local-filter-apply')){normalizeStaySearchDates();renderStays();filterDialog.close();filterLayout();return;}
    if(button.hasAttribute('data-market-info')){const store=state.selectedStore;if(!store)return;const info=document.createElement('dialog');info.className='motf-dialog merchant-dialog';info.innerHTML=`<div class="modal-top"><h2>${catalogLabel(store.name)}</h2><button class="icon-button" data-local-close aria-label="닫기">${icon('x')}</button></div><img class="merchant-modal-photo" src="${esc(store.image)}" alt="${catalogLabel(store.name)} 매장 사진"><div class="merchant-modal-copy">${$('#marketIntro .market-intro-body').innerHTML}</div>`;$$('[data-market-info],.merchant-modal-copy h2',info).forEach(el=>el.remove());document.body.append(info);info.addEventListener('close',()=>info.remove());info.showModal();refreshIcons();return;}
    if(button.hasAttribute('data-promo')||button.hasAttribute('data-promo-move')){slideIndex=button.hasAttribute('data-promo')?Number(button.dataset.promo):(slideIndex+Number(button.dataset.promoMove)+slides.length)%slides.length;templates=motfLocalTemplates(context());banner();return;}
    if(button.hasAttribute('data-count')){draft.people=Math.min(200,Math.max(2,draft.people+Number(button.dataset.count)));update();return;}
    if(button.hasAttribute('data-budget-step')){step=Number(button.dataset.budgetStep);update();return;}
    if(button.hasAttribute('data-budget-adjust')){draft.budget=Math.min(100000000,Math.max(0,draft.budget+Number(button.dataset.budgetAdjust)*step));update();return;}
    if(button.hasAttribute('data-planner-panel')){$('#my-mt').dataset.mobilePanel=button.dataset.plannerPanel;$$('[data-planner-panel]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));return;}
    if(button.hasAttribute('data-add-expense')){draft.extraCosts.push({id:crypto.randomUUID(),name:'',amount:0});$('.extra-expenses').classList.add('is-expanded');extras();return;}
    if(button.hasAttribute('data-remove-expense')){draft.extraCosts=draft.extraCosts.filter(item=>item.id!==button.dataset.removeExpense);extras();return;}
    if(button.hasAttribute('data-toggle-expenses')){const open=$('.extra-expenses').classList.toggle('is-expanded');button.setAttribute('aria-expanded',String(open));return;}
    const action=button.dataset.action;
    if(button.closest('#home')&&action==='search'){
      const source=motfLocalTemplates({...context(),HomeStudy:{promo:slideIndex,isMobile:()=>false}}).homeSearch();searchDialog.innerHTML=`<div class="modal-top"><h2>숙소 찾기</h2><button class="icon-button" data-local-close aria-label="닫기">${icon('x')}</button></div>${source}`;$('.home-search-intro',searchDialog).remove();wire(searchDialog);searchDialog.showModal();datePickers(searchDialog);return;
    }
    if(button.closest('.hardware-key')){if(['stays','market'].includes(action))openHandoff(action);else navigate(action==='budget'?'budgetPreview':'recreation');return;}
    if(button.hasAttribute('data-mt-from-estimate')){openHandoff();return;}
    if(button.hasAttribute('data-local-existing')){carry=false;destination='';handoff.close();navigate('myMt');return;}
    if(button.hasAttribute('data-local-new')){handoff.close();motfRequireLogin(()=>{navigate('myMt');$('#mtProjectDirectory [data-create-mt-project]').click();carry=true;setDateInputValue($('#mtEditStart'),draft.start);setDateInputValue($('#mtEditEnd'),draft.end);$('#mtEditPeople').value=draft.people;$('#mtEditBudget').value=won(draft.budget);});return;}
    if(button.matches('#mtProjectDialog [data-close-motf-dialog]')){carry=false;destination='';}
  });
  document.addEventListener('input',event=>{const el=event.target;if(!el.closest('#home'))return;const key=el.dataset.input;if(key){if(key==='people')draft.people=Math.max(2,Math.min(200,Number(el.value)||2));else if(key.startsWith('budget'))draft.budget=Math.max(0,Math.min(100000000,Number(el.value)||0));else draft[key]=el.value;update();}const id=el.dataset.extraName||el.dataset.extraAmount;if(id){const item=draft.extraCosts.find(item=>item.id===id);if(el.hasAttribute('data-extra-name'))item.name=el.value;else item.amount=Math.max(0,Math.min(100000000,Number(el.value)||0));update();}});
  document.addEventListener('submit',async event=>{if(event.target.matches('[data-local-other]')){event.preventDefault();const form=event.target,button=$('button',form);button.disabled=true;try{await motfAddMtOtherItems([{title:form.elements.title.value,amount:Number(form.elements.amount.value)}]);await motfSelectMtProject(state.mtProject.id);}catch(error){toast(error.message);}finally{button.disabled=false;}}if(event.target.matches('[data-home-stay-search]')&&searchDialog.open)searchDialog.close();});
  $('#mtProjectDialog').addEventListener('cancel',()=>{carry=false;destination='';});
  window.motfHomeDesign={afterProjectCreated,renderMtExtras};window.motfLocalDesign={render,adapt,draft,getCosts:()=>templates.costs()};
  matchMedia('(max-width:699px)').addEventListener('change',()=>{const host=$('#home-start');$$('input',host).forEach(input=>input._flatpickr?.destroy());host.innerHTML=motfLocalTemplates(context()).homeSearch();wire(host);datePickers(host);filterLayout();});
  document.addEventListener('click',event=>{const button=event.target.closest('[data-post-id]');if(button){const board=communityBoards.find(board=>board.posts.some(post=>post.id===button.dataset.postId));if(board)state.activeBoardId=board.id;}},true);
  window.addEventListener('motf:routechange',event=>{if(event.detail?.route!==currentRoute())return;if(!event.detail.preserveDesignDialogs)routeStyle();});
  let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;adapt();});}).observe(document.querySelector('main'),{subtree:true,childList:true});
  render();adapt();datePickers($('#home'));filterLayout();
})();
