(() => {
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const won = value => Math.round(value).toLocaleString("ko-KR");
  const icon = name => `<i data-lucide="${name}"></i>`;
  const localDay = offset => { const date = new Date(); date.setDate(date.getDate() + offset); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; };
  const draft = { people:32, budget:3000000, start:localDay(7), end:localDay(8), extras:[], step:100000 };
  let slides = [], slideIndex = 0, boundaryTimer, pendingTarget = "", carryDraft = false;
  const visible = card => card.is_active !== false && (!card.starts_at || new Date(card.starts_at) <= new Date()) && (!card.ends_at || new Date(card.ends_at) > new Date());
  const searchForm=$("[data-home-stay-search]"),searchSummary=document.createElement("button"),searchDialog=document.createElement("dialog"),mobile=matchMedia("(max-width:699px)");
  searchSummary.type="button";searchSummary.className="home-mobile-search";searchSummary.dataset.homeSearchOpen="";
  searchDialog.className="motf-dialog home-search-dialog";searchDialog.innerHTML=`<div class="section-toolbar"><h2>숙소 찾기</h2><button type="button" class="icon-action" data-home-search-close aria-label="닫기">${icon("x")}</button></div>`;document.body.append(searchDialog);searchForm.before(searchSummary);
  function searchLayout(){if(mobile.matches)searchDialog.append(searchForm);else{searchSummary.after(searchForm);if(searchDialog.open)searchDialog.close();}searchForm.querySelectorAll('[data-stay-search-field]').forEach(input=>{const picker=input._flatpickr;if(picker?.calendarContainer){picker.close();(mobile.matches?searchDialog:document.body).append(picker.calendarContainer);picker.config.appendTo=mobile.matches?searchDialog:undefined;}});searchSummary.hidden=!mobile.matches;}
  function searchCaption(){const value=field=>searchForm.querySelector(`[data-stay-search-field="${field}"]`)?.value||"";const short=date=>date?`${Number(date.split('-')[1])}.${Number(date.split('-')[2])}`:"날짜 선택";searchSummary.innerHTML=`${icon("search")}<span><strong>숙소부터 찾아보기</strong><small>${esc(value('region'))} · ${short(value('checkIn'))} — ${short(value('checkOut'))} · ${esc(value('people'))}명</small></span><b>${icon("arrow-right")}</b>`;}
  mobile.addEventListener("change",()=>{searchLayout();refreshIcons();});

  function bannerTarget(value) {
    if (!value) return { route:"events" };
    try {
      const url = new URL(value, location.origin);
      if (!["http:","https:"].includes(url.protocol)) return { route:"events" };
      const internal = url.origin === location.origin || ["motf.co.kr","www.motf.co.kr"].includes(url.hostname);
      if (internal) {
        const route = Object.entries(routePaths).find(([,path]) => path === url.pathname.replace(/\/$/,"") || path === url.pathname)?.[0];
        if (route === "eventDetail") return { event:url.searchParams.get("event") };
        if (route) return { route };
      }
      return { external:url.href };
    } catch { return { route:"events" }; }
  }

  function action(target, label) {
    if (target.create) return `<button type="button" class="text-link" data-create-mt-project>${esc(label)} ${icon("arrow-right")}</button>`;
    if (target.event) return `<button type="button" class="text-link" data-event-id="${esc(target.event)}">${esc(label)} ${icon("arrow-right")}</button>`;
    if (target.external) return `<a class="text-link" href="${esc(target.external)}" target="_blank" rel="noopener noreferrer">${esc(label)} ${icon("arrow-up-right")}</a>`;
    return `<button type="button" class="text-link" data-route="${esc(target.route || "events")}">${esc(label)} ${icon("arrow-right")}</button>`;
  }

  function renderBanner() {
    const host = $("#homeBanner");
    if (!host || !slides.length) return;
    slideIndex = Math.min(slideIndex, slides.length-1);
    const slide = slides[slideIndex];
    host.innerHTML = `<img class="home-banner-photo" src="${esc(slide.image)}" alt=""><div class="home-banner-copy" aria-live="polite"><p>${esc(slide.kind)}</p><h2>${esc(slide.title).replace(/\n/g,"<br>")}</h2><p>${esc(slide.description)}</p>${action(slide.target,slide.label)}</div><div class="home-banner-controls"><div role="group" aria-label="배너 선택">${slides.map((item,index)=>`<button type="button" data-home-banner="${index}" aria-label="${index+1}. ${esc(item.title.replace(/\n/g," "))}" aria-pressed="${index===slideIndex}"><span></span></button>`).join("")}</div><span>${String(slideIndex+1).padStart(2,"0")} / ${String(slides.length).padStart(2,"0")}</span><button type="button" data-home-banner-step="-1" aria-label="이전 배너" title="이전 배너">${icon("chevron-left")}</button><button type="button" data-home-banner-step="1" aria-label="다음 배너" title="다음 배너">${icon("chevron-right")}</button></div>`;
    host.classList.toggle("is-mt-banner",Boolean(slide.target.create));
    refreshIcons();
  }

  function render(content) {
    syncStaySearchPanel(searchDialog);searchCaption();
    const currentId = slides[slideIndex]?.id;
    const promotions = content.cards.filter(card => card.placement === "promotion" && visible(card)).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order));
    const promotedEvents = new Set(promotions.map(card=>bannerTarget(card.link_url).event).filter(Boolean));
    const events = content.events.filter(event => !["draft","cancelled","completed"].includes(effectiveEventStatus(event)) && !promotedEvents.has(String(event.id)));
    slides = [{ id:"my-mt", kind:"내 MT", title:"흩어진 MT 준비,\n우리 공간에 모아봐요.", description:"숙소 후보와 장보기, 예산을 함께 정리해요.", image:"assets/design/mt-prep.jpg", label:"내 MT 만들기", target:{create:true} },
      ...promotions.map(card=>{let target=bannerTarget(card.link_url);if(target.event&&!content.events.some(event=>String(event.id)===target.event&&!['draft','cancelled'].includes(event.status)))target={route:"events"};return{id:card.id,kind:"모티프 소식",title:card.title,description:card.subtitle||"",image:card.image_url,label:card.link_label||"자세히 보기",target};}),
      ...events.slice(0,5).map(event=>({id:event.id,kind:`MOriginal · ${eventStatusLabel(effectiveEventStatus(event))}`,title:event.title,description:event.short_description||"",image:event.poster_url,label:"프로그램 보기",target:{event:String(event.id)}}))];
    slideIndex = Math.max(0, slides.findIndex(slide=>slide.id===currentId));
    renderBanner();
    clearTimeout(boundaryTimer);
    const boundaries = content.cards.flatMap(card=>[card.starts_at,card.ends_at]).filter(Boolean).map(value=>new Date(value).getTime()).filter(time=>time>Date.now());
    if (boundaries.length) boundaryTimer = setTimeout(()=>render(content),Math.min(2147483000,Math.min(...boundaries)-Date.now()+100));
  }

  function allocation() {
    const other = draft.extras.reduce((sum,item)=>sum+item.amount,0);
    const available = Math.max(0,draft.budget-other), scale = Math.min(1,available/(draft.people*42000));
    const stay = Math.floor(draft.people*30000*scale/1000)*1000;
    const market = Math.floor(draft.people*12000*scale/1000)*1000;
    return {stay,market,other,used:stay+market+other,remaining:draft.budget-stay-market-other};
  }

  function calculator() {
    const host = $("#homeCalculator");
    if (!host) return;
    host.innerHTML = `<div class="section-toolbar"><div><p class="eyebrow">숙소와 장보기, 우리 예산에 맞춰</p><h2>우리 MT, 얼마면 될까요?</h2></div><button class="text-link" data-route="myMt">내 MT 열기 ${icon("arrow-up-right")}</button></div><div class="estimate-caption"><span>예산 시뮬레이션</span><strong>우리 MT 준비하기</strong></div><div class="estimate-mobile-tabs" role="tablist" aria-label="계산기 항목">${[["budget","chart-pie","예산"],["people","users-round","인원·날짜"],["items","layout-grid","준비 항목"]].map(([key,symbol,label])=>`<button type="button" role="tab" data-estimate-tab="${key}" aria-selected="${key==="budget"}">${icon(symbol)}${label}</button>`).join("")}</div><div class="estimate-machine" data-panel="budget"><section class="estimate-column estimate-people"><div class="estimate-label">01 / 함께할 인원<span class="estimate-led"></span></div><div class="estimate-count"><span><output data-estimate-value="people">32</output> 명과 함께</span><div><button type="button" data-estimate-count="1" aria-label="인원 늘리기">${icon("plus")}</button><button type="button" data-estimate-count="-1" aria-label="인원 줄이기">${icon("minus")}</button></div></div><input type="range" min="2" max="200" value="32" data-estimate-input="people" aria-label="참가 인원"><div class="estimate-range-ends"><span>2명</span><span>100</span><span>200명</span></div><div class="estimate-dates"><label>출발일<input type="date" data-estimate-input="start" value="${draft.start}"></label><label>도착일<input type="date" data-estimate-input="end" value="${draft.end}"></label></div></section><section class="estimate-column estimate-items"><div class="estimate-label">02 / 준비할 항목<span>OUR MT</span></div><div class="estimate-keys">${[["stays","house","숙소 비교","우리 인원에 맞는 곳"],["market","shopping-basket","MT 장보기","고기부터 간식까지"],["recreation","dices","레크 고르기","분위기를 바꾸는 게임"],["myUsage","receipt-text","예결산 정리","쓴 돈 깔끔하게"]].map(([route,symbol,title,note])=>`<button type="button" data-estimate-destination="${route}">${icon(symbol)}<strong>${title}</strong><small>${note}</small></button>`).join("")}</div></section><section class="estimate-column estimate-budget"><div class="estimate-label">03 / 예산 모니터<span>KRW</span></div><div class="estimate-screen"><p>예시 배분 후 남은 예산</p><output data-estimate-value="remaining"></output><small>원 / 배분 예시 · 실제 견적 아님</small><div class="estimate-meter" role="img" aria-label="예산 배분"></div><div class="estimate-legend"></div><div class="estimate-result"><span>예시 배분액</span><strong data-estimate-value="used"></strong></div><div class="estimate-result"><span>1인 기준</span><strong data-estimate-value="perPerson"></strong></div></div><div class="estimate-unit" role="group" aria-label="예산 조절 단위">${[10000,100000,1000000].map(amount=>`<button type="button" data-estimate-step="${amount}" aria-pressed="${amount===draft.step}">${amount/10000}만원</button>`).join("")}</div><div class="estimate-total"><button type="button" data-estimate-adjust="-1" aria-label="예산 줄이기">${icon("minus")}</button><label>전체 예산<input type="number" min="0" max="100000000" step="10000" data-estimate-input="budget" value="${draft.budget}" aria-label="총예산"></label><button type="button" data-estimate-adjust="1" aria-label="예산 늘리기">${icon("plus")}</button></div><input type="range" min="0" max="10000000" step="10000" value="${draft.budget}" data-estimate-input="budget-range" aria-label="총예산 슬라이더"><button class="primary-btn" type="button" data-estimate-continue>내 MT에서 준비 이어가기 ${icon("arrow-up-right")}</button></section></div><section class="estimate-extras"><div class="section-toolbar"><h3>${icon("circle-plus")} 기타 비용</h3><button class="text-link" type="button" data-estimate-add>항목 추가 ${icon("plus")}</button></div><div id="estimateExtraRows"></div></section><p class="estimate-disclaimer">숙소 1인 3만원·장보기 1.2만원 가정, 예산 부족 시 비례 조정. 예시 비용은 내 MT에 담기지 않아요.</p>`;
    updateCalculator();
  }

  function updateCalculator() {
    const costs = allocation(),parts = [["stay","숙소",costs.stay],["market","장보기",costs.market],["other","기타",costs.other],["remaining","남은 예산",Math.max(0,costs.remaining)]];
    document.querySelectorAll("[data-estimate-value]").forEach(el=>{const key=el.dataset.estimateValue;el.textContent=key==="people"?draft.people:won(key==="perPerson"?Math.ceil(costs.used/draft.people):costs[key])+(key==="used"||key==="perPerson"?"원":"");});
    $(".estimate-meter").innerHTML=parts.map(([key,title,amount])=>`<span class="part-${key}" style="width:${Math.min(100,amount/Math.max(draft.budget,costs.used,1)*100)}%" title="${title} ${won(amount)}원"></span>`).join("");
    $(".estimate-meter").setAttribute("aria-label",parts.map(([,title,amount])=>`${title} ${won(amount)}원`).join(", "));
    $(".estimate-legend").innerHTML=parts.map(([key,title,amount])=>`<span><i class="part-${key}"></i>${title} <b>${draft.budget?Math.round(amount/draft.budget*100):0}%</b></span>`).join("");
    $(".estimate-screen").classList.toggle("is-over",costs.remaining<0);
    document.querySelectorAll('[data-estimate-input="people"]').forEach(el=>el.value=draft.people);
    $("[data-estimate-input=budget]").value=draft.budget;
    const range=$("[data-estimate-input=budget-range]");range.max=Math.max(10000000,draft.budget);range.value=draft.budget;
    document.querySelectorAll("[data-estimate-step]").forEach(el=>el.setAttribute("aria-pressed",String(Number(el.dataset.estimateStep)===draft.step)));
  }

  function extraRows() {
    $("#estimateExtraRows").innerHTML=draft.extras.map(item=>`<div class="estimate-extra-row"><input data-estimate-extra-title="${item.id}" aria-label="기타 비용 이름" value="${esc(item.title)}" placeholder="예: 교통비" maxlength="100"><label><input type="number" min="0" max="100000000" data-estimate-extra-amount="${item.id}" value="${item.amount}" aria-label="기타 비용 금액">원</label><button type="button" data-estimate-remove="${item.id}" aria-label="기타 비용 삭제">${icon("x")}</button></div>`).join("")||'<p class="muted">교통비, 준비물 등 추가로 드는 비용을 적어보세요.</p>';
    refreshIcons();updateCalculator();
  }

  const dialog=document.createElement("dialog");dialog.className="motf-dialog estimate-handoff";
  dialog.innerHTML=`<div class="section-toolbar"><h2>내 MT에서 이어서 준비해요</h2><button type="button" class="icon-action" data-estimate-close aria-label="닫기">${icon("x")}</button></div><p>숙소와 장보기는 여행을 선택한 뒤 실제 상품으로 준비해요.</p><div class="button-row"><button type="button" class="primary-btn" data-estimate-new>새 MT 만들기 ${icon("plus")}</button><button type="button" class="secondary-btn" data-estimate-existing>기존 MT 선택</button></div>`;
  document.body.append(dialog);

  function handoff(target="") {
    if(draft.end<=draft.start)return toast("도착일은 출발일보다 뒤여야 합니다.");
    pendingTarget=target;dialog.showModal();refreshIcons();
  }

  async function afterProjectCreated(project) {
    if(!carryDraft)return;
    carryDraft=false;
    const extras=draft.extras.filter(item=>item.amount>0);
    if(extras.length)try { await window.motfAddMtOtherItems(extras);await window.motfSelectMtProject(project.id); } catch(error) { toast(`MT는 생성됐지만 기타 비용은 저장하지 못했습니다: ${error.message}`); }
    if(pendingTarget){const target=pendingTarget;pendingTarget="";window.motfNavigate(target);}
  }

  function renderMtExtras(project) {
    let host=$("#mtOtherCosts");
    if(!host){host=document.createElement("section");host.id="mtOtherCosts";host.className="mt-other-costs";$(".mt-project-main")?.append(host);}
    const rows=(project.items||[]).filter(item=>["other","transport","activity"].includes(item.item_kind)&&item.status!=="cancelled");
    host.innerHTML=`<div class="section-toolbar"><h2>기타 비용</h2></div>${rows.map(item=>`<div class="mt-other-row"><span>${esc(item.title)}</span><strong>${won(Number(item.amount)*Number(item.quantity||1))}원</strong>${project.is_owner!==false?`<button class="icon-action" type="button" data-remove-mt-item="${esc(item.id)}" aria-label="기타 비용 삭제">${icon("x")}</button>`:""}</div>`).join("")||'<p class="muted">교통비와 준비물 비용도 함께 정리하세요.</p>'}${project.is_owner!==false?'<form data-mt-other-form><input name="title" required maxlength="100" placeholder="비용 항목" aria-label="비용 항목"><input name="amount" type="number" min="1" max="100000000" required placeholder="금액" aria-label="금액"><button class="secondary-btn" type="submit">추가</button></form>':""}`;
  }

  document.addEventListener("click",event=>{
    if(event.target.closest("[data-home-search-open]")){searchDialog.showModal();return;}
    if(event.target.closest("[data-home-search-close]")){searchDialog.close();return;}
    if(event.target.closest("[data-market-info]")){
      const info=document.createElement("dialog");info.className="motf-dialog market-info-dialog";info.innerHTML=`<div class="section-toolbar"><h2>공판장 정보</h2><button class="icon-action" type="button" aria-label="닫기" data-market-info-close>${icon("x")}</button></div>${$("#marketIntro .market-intro-body").innerHTML}`;info.querySelector('[data-market-info]')?.remove();document.body.append(info);info.addEventListener("close",()=>info.remove());info.querySelector('[data-market-info-close]').onclick=()=>info.close();info.showModal();refreshIcons();return;
    }
    const banner=event.target.closest("[data-home-banner],[data-home-banner-step]");
    if(banner){slideIndex=banner.hasAttribute("data-home-banner")?Number(banner.dataset.homeBanner):(slideIndex+Number(banner.dataset.homeBannerStep)+slides.length)%slides.length;const selector=banner.hasAttribute("data-home-banner")?`[data-home-banner="${slideIndex}"]`:`[data-home-banner-step="${banner.dataset.homeBannerStep}"]`;renderBanner();$(selector)?.focus({preventScroll:true});return;}
    const tab=event.target.closest("[data-estimate-tab]");if(tab){$(".estimate-machine").dataset.panel=tab.dataset.estimateTab;document.querySelectorAll("[data-estimate-tab]").forEach(el=>el.setAttribute("aria-selected",String(el===tab)));return;}
    const count=event.target.closest("[data-estimate-count]");if(count){draft.people=Math.min(200,Math.max(2,draft.people+Number(count.dataset.estimateCount)));updateCalculator();return;}
    const step=event.target.closest("[data-estimate-step]");if(step){draft.step=Number(step.dataset.estimateStep);updateCalculator();return;}
    const adjust=event.target.closest("[data-estimate-adjust]");if(adjust){draft.budget=Math.min(100000000,Math.max(0,draft.budget+Number(adjust.dataset.estimateAdjust)*draft.step));updateCalculator();return;}
    if(event.target.closest("[data-estimate-add]")){draft.extras.push({id:crypto.randomUUID(),title:"",amount:0});extraRows();return;}
    const remove=event.target.closest("[data-estimate-remove]");if(remove){draft.extras=draft.extras.filter(item=>item.id!==remove.dataset.estimateRemove);extraRows();return;}
    const destination=event.target.closest("[data-estimate-destination]");if(destination){const route=destination.dataset.estimateDestination;if(["stays","market"].includes(route))handoff(route);else window.motfNavigate(route);return;}
    if(event.target.closest("[data-estimate-continue]")){handoff();return;}
    if(event.target.closest("[data-estimate-close]")){dialog.close();return;}
    if(event.target.closest("[data-estimate-existing]")){carryDraft=false;pendingTarget="";dialog.close();window.motfNavigate("myMt");return;}
    if(event.target.closest("[data-estimate-new]")){dialog.close();const open=()=>{window.motfNavigate("myMt");$("#mtProjectDirectory [data-create-mt-project]").click();carryDraft=true;setDateInputValue($("#mtEditStart"),draft.start);setDateInputValue($("#mtEditEnd"),draft.end);$("#mtEditPeople").value=draft.people;$("#mtEditBudget").value=won(draft.budget);};if(window.motfRequireLogin)window.motfRequireLogin(open);else open();}
  });
  $("#mtProjectDialog").addEventListener("cancel",()=>{carryDraft=false;pendingTarget="";});
  document.addEventListener("click",event=>{if(event.target.closest('#mtProjectDialog [data-close-motf-dialog]')){carryDraft=false;pendingTarget="";}});
  document.addEventListener("input",event=>{
    const input=event.target,field=input.dataset.estimateInput;
    if(field){if(field==="people")draft.people=Math.max(2,Math.min(200,Number(input.value)||2));else if(field.startsWith("budget"))draft.budget=Math.max(0,Math.min(100000000,Number(input.value)||0));else draft[field]=input.value;updateCalculator();}
    const id=input.dataset.estimateExtraTitle||input.dataset.estimateExtraAmount;if(id){const item=draft.extras.find(row=>row.id===id);if(input.hasAttribute("data-estimate-extra-title"))item.title=input.value;else item.amount=Math.max(0,Math.min(100000000,Number(input.value)||0));updateCalculator();}
  });
  document.addEventListener("submit",async event=>{if(!event.target.matches("[data-mt-other-form]"))return;event.preventDefault();const form=event.target,button=form.querySelector("button");button.disabled=true;try{await window.motfAddMtOtherItems([{title:form.elements.title.value,amount:Number(form.elements.amount.value)}]);await window.motfSelectMtProject(state.mtProject.id);}catch(error){toast(error.message);}finally{button.disabled=false;}});
  window.motfHomeDesign={render,allocation,afterProjectCreated,renderMtExtras};
  window.addEventListener("motf:routechange",()=>{document.querySelectorAll('.market-info-dialog[open]').forEach(info=>info.close());if(searchDialog.open)searchDialog.close();});
  searchForm.addEventListener("change",searchCaption);
  searchLayout();calculator();extraRows();renderHome();refreshIcons();
})();
