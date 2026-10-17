(function mountMotfMobileShell() {
  const routeLabels = {
    home: "홈",
    stays: "숙소 찾기",
    stayDetail: "숙소 상세",
    roomDetail: "객실 상세",
    booking: "예약하기",
    myMt: "내 MT",
    budgetPreview: "예결산",
    market: "장보기",
    storeDetail: "마트 상세",
    productDetail: "상품 상세",
    cart: "장바구니",
    payment: "결제",
    paymentResult: "결제 결과",
    events: "MOriginal",
    eventDetail: "MOriginal",
    community: "커뮤니티",
    recreation: "레크리에이션",
    activityDetail: "레크리에이션",
    boardDetail: "게시판",
    postDetail: "게시물",
    chat: "채팅",
    mypage: "마이",
    myUsage: "이용 내역",
    review: "리뷰",
    myAccount: "계정 설정",
    myGuide: "이용 가이드",
  };

  const routeGroups = {
    stayDetail: "stays",
    roomDetail: "stays",
    booking: "stays",
    storeDetail: "market",
    productDetail: "market",
    cart: "market",
    payment: "market",
    paymentResult: "market",
    boardDetail: "community",
    postDetail: "community",
    recreation: "community",
    activityDetail: "community",
    myUsage: "mypage",
    review: "mypage",
    myAccount: "mypage",
    myGuide: "mypage",
  };

  const header = document.querySelector(".app-header");
  const home = document.querySelector("#home");
  const searchPanel = home?.querySelector(".home-search-panel");
  if (!header || !home || !searchPanel || document.querySelector(".mobile-bottom-nav")) return;

  const context = document.createElement("div");
  context.className = "mobile-header-context";
  context.setAttribute("aria-live", "polite");
  context.innerHTML = "<small>모두의 TF</small><strong>moTF</strong>";

  const chatButton = document.createElement("button");
  chatButton.className = "mobile-header-action";
  chatButton.type = "button";
  chatButton.dataset.route = "chat";
  chatButton.setAttribute("aria-label", "채팅 열기");
  chatButton.innerHTML = '<i data-lucide="message-circle"></i>';
  header.append(context, chatButton);

  const mobileIntro = document.createElement("section");
  mobileIntro.className = "mobile-home-intro";
  mobileIntro.innerHTML = `
    <span>GROUP TRIP, ALL IN ONE</span>
    <h1>단체 여행 준비,<br /><strong>모티프에서 한 번에</strong></h1>
    <p>숙소부터 장보기와 일정 관리까지 필요한 준비를 한곳에서 시작해요.</p>
  `;
  home.insertBefore(mobileIntro, searchPanel);

  const mtCard = document.createElement("section");
  mtCard.className = "mobile-mt-card";
  mtCard.setAttribute("aria-label", "내 MT 바로가기");
  mtCard.innerHTML = `
    <button type="button" data-route="myMt">
      <span class="mobile-mt-card-icon"><i data-lucide="folder-kanban"></i></span>
      <span class="mobile-mt-card-copy">
        <small>MY TRIP WORKSPACE</small>
        <strong>우리 MT 준비를 이어가세요</strong>
        <em>숙소 후보 · 장보기 · 예산을 한곳에서 관리</em>
      </span>
      <i data-lucide="chevron-right"></i>
    </button>
  `;

  const services = document.createElement("nav");
  services.className = "mobile-home-services";
  services.setAttribute("aria-label", "모티프 서비스 바로가기");
  services.innerHTML = `
    <button type="button" data-route="events"><span><i data-lucide="sparkles"></i></span><b>MOriginal</b></button>
    <button type="button" data-route="recreation"><span><i data-lucide="party-popper"></i></span><b>레크리에이션</b></button>
    <button type="button" data-route="community" data-community-section="orderRecommend"><span><i data-lucide="calculator"></i></span><b>준비량 계산</b></button>
    <button type="button" data-route="chat"><span><i data-lucide="message-circle"></i></span><b>문의하기</b></button>
  `;
  searchPanel.after(mtCard, services);

  const nav = document.createElement("nav");
  nav.className = "mobile-bottom-nav";
  nav.setAttribute("aria-label", "모바일 주요 메뉴");
  nav.innerHTML = `
    <button type="button" data-route="home"><span><i data-lucide="house"></i></span><span>홈</span></button>
    <button type="button" data-route="stays"><span><i data-lucide="search"></i></span><span>숙소</span></button>
    <button type="button" data-route="market"><span><i data-lucide="shopping-basket"></i></span><span>장보기</span></button>
    <button type="button" data-route="community"><span><i data-lucide="messages-square"></i></span><span>커뮤니티</span></button>
    <button type="button" data-route="mypage"><span><i data-lucide="user-round"></i></span><span>마이</span></button>
  `;
  document.body.append(nav);

  function update(route) {
    const activeRoute = route || document.body.dataset.currentRoute || "home";
    const activeGroup = routeGroups[activeRoute] || activeRoute;
    const eyebrow = context.querySelector("small");
    const title = context.querySelector("strong");

    if (activeRoute === "home") {
      if (eyebrow) eyebrow.textContent = "모두의 TF";
      if (title) title.textContent = "moTF";
    } else {
      if (eyebrow) eyebrow.textContent = "moTF";
      if (title) title.textContent = routeLabels[activeRoute] || "모두의 TF";
    }

    nav.querySelectorAll("button[data-route]").forEach((button) => {
      const active = button.dataset.route === activeGroup;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  window.addEventListener("motf:routechange", (event) => update(event.detail?.route));
  update();
  window.__motfRefreshIcons?.();
})();
