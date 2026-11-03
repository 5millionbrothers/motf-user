window.motfLocalTemplates=function(context){
const {state,stays,homePosts,homePromos,HomeStudy,pageProducts}=context;
const concept='home',exampleRates={lodging:30000,groceries:12000};
let budgetStep=context.budgetStep||100000,plannerPanel='budget',expensesExpanded=innerWidth>=700;
const money=value=>Math.round(value).toLocaleString('ko-KR');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=name=>'<i data-lucide="'+name+'" aria-hidden="true"></i>';
const tools=[{action:'stays',icon:'house',title:'숙소 비교',subtitle:'우리 인원에 맞는 곳'},{action:'market',icon:'shopping-basket',title:'MT 장보기',subtitle:'고기부터 간식까지'},{action:'recreation',icon:'dices',title:'레크 고르기',subtitle:'분위기를 바꾸는 게임'},{action:'budget',icon:'receipt-text',title:'예결산 정리',subtitle:'쓴 돈도 깔끔하게'}];
function regionOptions(selected){return context.regions.map(region=>'<option '+(selected===region?'selected':'')+'>'+escapeHtml(region)+'</option>').join('');}
function costs() {
  const example = concept === 'home';
  const stay = example ? undefined : stays.find(item => item.id === state.stay);
  const other = state.extraCosts.reduce((sum, item) => sum + item.amount, 0);
  let lodging = stay?.price || 0;
  let groceries = (state.marketItems || []).reduce((sum, item) => sum + item.price * item.quantity, 0);
  if(example) {
    const available = Math.max(0,state.budget-other);
    const scale = Math.min(1,available/(state.people*(exampleRates.lodging+exampleRates.groceries)));
    lodging = Math.floor(state.people*exampleRates.lodging*scale/1000)*1000;
    groceries = Math.floor(state.people*exampleRates.groceries*scale/1000)*1000;
  }
  const used = lodging + groceries + other;
  return { stay, lodging, groceries, other, used, example, remaining: state.budget - used, perPerson: Math.ceil(used / state.people) };
}

function budgetParts() {
  const cost = costs();
  const base = Math.max(state.budget, cost.used, 1);
  return [
    { key: 'stay', name: cost.example?'숙소 예시':'숙소', amount: cost.lodging },
    { key: 'grocery', name: cost.example?'장보기 예시':'장보기', amount: cost.groceries },
    { key: 'other', name: '기타 비용', amount: cost.other },
    { key: 'remaining', name: '남은 예산', amount: Math.max(0, cost.remaining) },
  ].map(part => ({ ...part, percent: part.amount / base * 100 }));
}

function budgetLegend() {
  return `<div class="budget-legend">${budgetParts().map(part => `<div class="budget-part part-${part.key}"><span><i></i>${part.name}</span><strong><span data-part-amount="${part.key}">${money(part.amount)}</span>원</strong><small data-part-percent="${part.key}">${Number(part.percent.toFixed(1))}%</small></div>`).join('')}</div><p class="budget-basis" data-budget-basis>${costs().remaining < 0 ? '예산 초과 · 구성비는 사용 예정액 기준' : costs().example?'예시 구성비 · 실제 견적 아님':'전체 예산 기준 구성비'}</p>`;
}

function expenseRows() {
  return state.extraCosts.length ? state.extraCosts.map((item, index) => `<div class="extra-row" data-extra-row="${item.id}"><input data-extra-name="${item.id}" aria-label="기타 비용 ${index + 1} 항목명" maxlength="40" value="${escapeHtml(item.name)}" placeholder="예: 교통비, 대관료"><label><input data-extra-amount="${item.id}" aria-label="기타 비용 ${index + 1} 금액" type="number" min="0" max="100000000" step="1000" value="${item.amount}"><span>원</span></label><button class="icon-button" data-remove-expense="${item.id}" title="기타 비용 ${index + 1} 삭제" aria-label="기타 비용 ${index + 1} 삭제">${icon('trash-2')}</button></div>`).join('') : `<p class="expense-empty">추가한 비용이 없어요.</p>`;
}

function extraExpenses() {
  return `<section class="extra-expenses ${expensesExpanded ? 'is-expanded' : ''}" aria-label="기타 비용"><div class="expense-heading"><div><h3><button class="expense-toggle" data-toggle-expenses aria-expanded="${expensesExpanded}" aria-controls="expense-rows">${icon('wallet')} 기타 비용 ${icon('chevron-down')}</button></h3><span class="expense-hint">교통비 · 대관료 · 준비물 등</span><small class="expense-sum"><span data-value="other-cost">${money(costs().other)}</span>원</small></div><button class="text-button" data-add-expense>${icon('plus')} 비용 추가</button></div><div id="expense-rows">${expenseRows()}</div></section>`;
}

function dates(trip=state) {
  const short = date => `${Number(date.split('-')[1])}.${Number(date.split('-')[2])}`;
  return `${short(trip.start)} — ${short(trip.end)}`;
}

function projectMeta() {
  return `<span data-value="dates">${dates()}</span> / <span data-value="people">${state.people}</span>명 / 대성리`;
}

function candidateRows(fromHome=false) {
  const cost = costs();
  if(fromHome)return `<button class="calculator-add-item" data-action="stays">${icon('house')}<span><strong>숙소 직접 고르기</strong><small>내 MT에서 후보를 비교하고 예산에 반영</small></span>${icon('plus')}</button><button class="calculator-add-item" data-action="market">${icon('shopping-basket')}<span><strong>장보기 상품 담기</strong><small>내 MT에서 상품·옵션·수량 선택</small></span>${icon('plus')}</button>`;
  return `<div class="candidate-line">${icon('house')}<div><span data-value="stay-name">${cost.stay?.name || '숙소를 골라주세요'}</span><div class="candidate-kind" data-candidate-state="stays">숙소 후보 · ${cost.stay ? '예산 반영 중' : '미선택'}</div></div>
    <strong><span data-value="stay-cost">${money(cost.stay?.price || 0)}</span>원 <button class="icon-button" data-action="stays" title="숙소 후보 변경" aria-label="숙소 후보 변경">${icon('chevron-right')}</button></strong></div>
    <div class="candidate-line">${icon('shopping-basket')}<div>MT 장보기<div class="candidate-kind" data-candidate-state="market">${state.people}명 기준 · ${cost.groceries ? '예산 반영 중' : '미선택'}</div></div>
    <strong><span data-value="grocery-cost">${money(cost.groceries)}</span>원 <button class="icon-button" data-action="market" title="장보기 구성 변경" aria-label="장보기 구성 변경">${icon('chevron-right')}</button></strong></div>`;
}

function meter() {
  return `<div class="meter" role="img" aria-label="${budgetParts().map(part => `${part.name} ${money(part.amount)}원`).join(', ')}">${budgetParts().map(part => `<span class="${part.key}-meter" style="width:${part.percent}%" title="${part.name} ${Number(part.percent.toFixed(1))}%"></span>`).join('')}</div>`;
}

function workspaceSection(fromHome=false) {
  const cost = costs();
  return `<section class="planning-calculator wrap" id="my-mt" data-mobile-panel="${plannerPanel}"><div class="section-top"><div><p class="eyebrow">숙소와 장보기, 우리 예산에 맞춰</p><h2>우리 MT, 얼마면 될까요?</h2></div><button class="text-button" data-action="workspace">내 MT 열기 ${icon('arrow-up-right')}</button></div>
    <div class="calculator-project"><span class="pill">${fromHome?'예시 시뮬레이션':state.created?'로컬 MT':'샘플 MT'}</span><strong ${fromHome?'':'data-value="project-name"'}>${fromHome?'우리 MT 준비하기':escapeHtml(state.name)}</strong><span class="project-meta">${projectMeta()}</span></div>
    <div class="calculator-mobile-tabs" role="group" aria-label="MT 계산기 항목">${[['budget','chart-pie','예산'],['people','users-round','인원·날짜'],['items','layout-grid','준비 항목']].map(([id,symbol,label]) => `<button data-planner-panel="${id}" aria-pressed="${plannerPanel === id}">${icon(symbol)}${label}</button>`).join('')}</div>
    <div class="machine" aria-label="MT 예산 계산기">
      <div class="machine-col"><div class="hardware-label"><span>01 / 함께할 인원</span><span class="led"></span></div>${purposeTabs('kit-purpose')}
        <div class="headcount-control"><div class="big-count"><output data-value="people">${state.people}</output><span>명과 함께</span></div><div class="count-buttons"><button data-count="1" title="인원 한 명 추가" aria-label="인원 한 명 추가">${icon('plus')}</button><button data-count="-1" title="인원 한 명 줄이기" aria-label="인원 한 명 줄이기">${icon('minus')}</button></div></div>
        <div class="range-wrap"><input class="range-control" data-input="people" type="range" aria-label="참가 인원" min="2" max="200" value="${state.people}"><div class="range-ends"><span>2명</span><span>100</span><span>200명</span></div></div>
        <div class="kit-date"><label class="form-field">출발일<input type="date" data-input="start" value="${state.start}" aria-label="MT 출발일"></label><label class="form-field">도착일<input type="date" data-input="end" value="${state.end}" aria-label="MT 도착일"></label></div>
      </div>
      <div class="machine-col"><div class="hardware-label"><span>02 / 준비할 항목</span><span>OUR MT</span></div><div class="kit-functions">${tools.map(tool => `<button class="hardware-key ${!fromHome&&((tool.action==='stays'&&cost.stay)||(tool.action==='market'&&cost.groceries))?'selected':''}" data-action="${tool.action}"><span class="key-led"></span>${icon(tool.icon)}<strong>${tool.title}</strong><small>${tool.subtitle}</small></button>`).join('')}</div></div>
      <div class="machine-col"><div class="hardware-label"><span>03 / 예산 모니터</span><span>KRW</span></div><div class="kit-screen"><p class="screen-label" data-budget-label>${cost.remaining < 0 ? '예산을 초과했어요' : fromHome?'예시 배분 후 남은 예산':'준비하고 남은 예산'}</p><p class="screen-amount" data-value="remaining">${money(cost.remaining)}</p><p class="screen-currency">원 / ${fromHome?'배분 예시 · 실제 견적 아님':'전체 예산 기준'}</p>${meter()}${budgetLegend()}<div class="screen-detail"><span>${fromHome?'예시 배분액':'사용 예정'}</span><strong><span data-value="used">${money(cost.used)}</span>원</strong></div><div class="screen-detail"><span>1인 기준</span><strong><span data-value="per-person">${money(cost.perPerson)}</span>원</strong></div></div>
        <div class="kit-budget-group"><div class="budget-unit-tabs" role="group" aria-label="예산 조절 단위">${[10000,100000,1000000].map(step => `<button data-budget-step="${step}" aria-pressed="${budgetStep === step}">${money(step / 10000)}만원</button>`).join('')}</div><div class="budget-control"><button class="icon-button raised" data-budget-adjust="-1" title="선택한 단위만큼 예산 줄이기" aria-label="예산 줄이기">${icon('minus')}</button><label><span>전체 예산</span><span><input data-input="budget" aria-label="총예산" type="number" value="${state.budget}" min="0" max="100000000" step="${budgetStep}">원</span></label><button class="icon-button raised" data-budget-adjust="1" title="선택한 단위만큼 예산 늘리기" aria-label="예산 늘리기">${icon('plus')}</button></div><input class="budget-range" data-input="budget-range" type="range" aria-label="총예산 슬라이더" min="0" max="${Math.max(10000000,state.budget)}" step="${budgetStep}" value="${state.budget}"><button class="primary" ${fromHome?'data-mt-from-estimate':'data-action="create"'}>내 MT에서 준비 이어가기 ${icon('arrow-up-right')}</button></div>
      </div>
    </div>${extraExpenses()}${fromHome?'':`<div class="calculator-selection">${candidateRows()}</div>`}<div class="calculator-foot"><span>${icon(fromHome?'folder-heart':'flask-conical')} ${fromHome?'숙소 1인 3만원·장보기 1.2만원 가정, 예산 부족 시 비례 조정. 예시 비용은 내 MT에 담기지 않아요.':'숙소·상품 가격은 예시예요. 실제 요금은 예약·주문 시 확인해주세요.'}</span><div><button class="text-button" data-action="compare">${icon('columns-3')} 후보 비교</button><button class="text-button" data-action="schedule">${icon('calendar-check')} 일정·공지</button><button class="text-button" data-action="budget">${icon('download')} 예결산 보기</button></div></div>
  </section>`;
}

function organizationBand() {
  return `<section class="org-band wrap"><div><p class="eyebrow">학생회 · 동아리를 위한 단체 공간</p><h2>지난 MT의 예약·주문 기록을, 다음 총무에게.</h2><p>단체의 이용 기록을 모아두고, 새 담당자를 초대해 그대로 이어가세요.</p></div>
    <div class="org-actions"><div class="org-avatars" aria-hidden="true"><span>총무</span><span>기획</span><span>회계</span></div><button class="secondary" data-action="organization">${icon('users-round')} 단체 공간 살펴보기 ${icon('arrow-up-right')}</button></div></section>`;
}

function purposeTabs(){return "";}

function homeSectionTop(label, title, action, button = '전체 보기') {
  return `<div class="home-section-top"><div><p>${label}</p><h2>${title}</h2></div><button class="text-button" data-action="${action}">${button}${icon('chevron-right')}</button></div>`;
}

function homeSearch() {
  const intro=`<div class="home-search-intro"><p>대학 MT·워크샵·수련회, 숙소·장보기부터 레크·예결산까지 한 번에.</p><h1>MT 준비, <em>모티프 한곳에서.</em></h1></div>`;
  if (HomeStudy.isMobile()) return `${intro}<button class="home-mobile-search" data-action="search">${icon('search')}<span><strong>숙소부터 찾아보기</strong><small><span data-value="region">${escapeHtml(state.region)}</span> · <span data-value="dates">${dates()}</span> · <span data-value="people">${state.people}</span>명</small></span><span class="search-round">${icon('arrow-right')}</span></button>`;
  return `${intro}<form class="starter home-search-bar" data-form="search"><div class="starter-field">${icon('map-pin')}<label><span>지역</span><select name="region" aria-label="검색 지역">${regionOptions(state.region)}</select></label></div><div class="starter-field">${icon('calendar-days')}<label><span>체크인</span><input type="date" name="start" aria-label="체크인" value="${state.start}" required></label></div><div class="starter-field">${icon('calendar-days')}<label><span>체크아웃</span><input type="date" name="end" aria-label="체크아웃" value="${state.end}" required></label></div><div class="starter-field">${icon('users-round')}<label><span>인원</span><input type="number" name="people" aria-label="검색 인원" min="2" max="200" value="${state.people}" required></label></div><button class="primary" type="submit" title="숙소 검색" aria-label="숙소 검색">${icon('search')}</button></form>`;
}

function homePromoCard() {
  const promo = homePromos[HomeStudy.promo];
  return `<div class="home-promo-visual" aria-hidden="true"><img src="${promo.image}" alt=""></div><div class="home-promo-copy"><p>${promo.kind}</p><h2>${promo.title.split('\n').join('<br>')}</h2><span>${promo.description}</span><button class="text-button" ${promo.page?`data-page="${promo.page}" data-item="${promo.item}"`:`data-action="${promo.action}"`}>${promo.button}${icon('arrow-right')}</button></div><div class="home-promo-controls"><div role="group" aria-label="홍보 배너 선택">${homePromos.map((item,index) => `<button data-promo="${index}" aria-label="${index+1}. ${item.kind} 배너" aria-pressed="${HomeStudy.promo===index}"><span></span></button>`).join('')}</div><span>${String(HomeStudy.promo+1).padStart(2,'0')} / ${String(homePromos.length).padStart(2,'0')}</span><button class="icon-button" data-promo-move="-1" title="이전 배너" aria-label="이전 배너">${icon('chevron-left')}</button><button class="icon-button" data-promo-move="1" title="다음 배너" aria-label="다음 배너">${icon('chevron-right')}</button></div>`;
}

function homeEditorial() {
  return `<section class="home-editorial wrap" aria-label="모티프 소식"><article class="home-promo theme-${homePromos[HomeStudy.promo].theme}" aria-label="홍보 배너" aria-roledescription="캐러셀"><div class="home-promo-inner" aria-live="polite">${homePromoCard()}</div></article></section>`;
}

function homeStays() {
  return `<section class="home-section home-stays wrap" id="home-stays">${homeSectionTop('STAY','함께 머물기 좋은 숙소','stays')}<div class="home-stay-grid home-swipe" tabindex="0" aria-label="숙소 추천">${stays.map((stay,index) => `<article class="home-stay-card"><button class="home-stay-image" data-stay-id="${stay.id}" aria-label="${stay.name} 숙소 후보 보기"><img src="${stay.image}" alt="${stay.name}" loading="lazy"><span>${stay.badge}</span></button><div class="home-stay-body"><div class="home-card-meta"><span>${stay.region} · 최대 ${stay.maxPeople}명</span><button class="icon-button" data-page-choose-stay="${stay.id}" title="내 MT에 담기" aria-label="${stay.name} 내 MT에 담기">${icon('folder-plus')}</button></div><button class="home-card-title" data-stay-id="${stay.id}">${stay.name}</button><p>객실 ${stay.rooms}개 · ${stay.bathLabel}</p><strong class="home-price">${money(stay.price)}<small>원</small></strong><span class="home-per-person">${state.people}명 기준 · 1인 ${money(Math.ceil(stay.price/state.people))}원</span></div></article>`).join('')}</div></section>`;
}

function homeMarket() { const products=pageProducts();
  return `<section class="home-section home-market wrap" id="home-market">${homeSectionTop('GROCERY','MT 장보기, 한 번에 준비해요','market')}<div class="home-product-grid home-swipe" tabindex="0" aria-label="장보기 추천">${products.map(product => `<article class="home-product-card"><button class="home-product-image" data-home-product="${product.id}" aria-label="${product.name} 자세히 보기"><img src="${product.image}" alt="${product.name}" loading="lazy"></button><div class="home-card-meta"><span>${product.storeName} · ${product.unit}</span><button class="icon-button" data-mt-start-product="${product.id}" title="내 MT에 담기" aria-label="${product.name} 내 MT에 담기">${icon('folder-plus')}</button></div><button class="home-card-title" data-home-product="${product.id}">${product.name}</button><strong class="home-price">${money(product.price)}<small>원</small></strong></article>`).join('')}</div></section>`;
}

function homeCalculator() {
  return `<section class="home-calculator-band is-open restored-calculator" id="home-calculator">${workspaceSection(true)}</section>`;
}

function homeCommunity() {
  return `<section class="home-section home-community wrap">${homeSectionTop('TOGETHER','함께 나누는 MT 이야기','community')}<div class="home-community-grid"><div class="home-posts">${homePosts.map(post=>`<article class="home-post"><div class="home-post-meta"><span class="home-post-avatar">${icon(post.symbol)}</span><div><strong>${post.author}</strong><small>${post.time}</small></div><span class="home-post-label">${post.label}</span></div><button class="home-post-title" data-home-post="${post.id}">${post.title}</button></article>`).join('')}</div><aside class="home-play-guide"><span class="home-play-symbol">${icon('dices')}</span><p>MT PLAYBOOK</p><h3>어색함은 짧게,<br>함께 웃는 시간은 길게.</h3><button class="text-button" data-action="recreation">레크 찾아보기 ${icon('arrow-right')}</button></aside></div></section>`;
}
return {homeSearch,homeEditorial,homeStays,homeMarket,homeCalculator,homeCommunity,organizationBand,workspaceSection,costs,budgetParts,budgetLegend,extraExpenses,expenseRows};
};
