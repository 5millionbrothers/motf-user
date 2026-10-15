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
    recreation: "레크레이션",
    activityDetail: "레크레이션",
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
    budgetPreview: "myMt",
    storeDetail: "market",
    productDetail: "market",
    cart: "market",
    payment: "market",
    paymentResult: "market",
    myUsage: "mypage",
    review: "mypage",
    myAccount: "mypage",
    myGuide: "mypage",
  };

  const header = document.querySelector(".app-header");
  const home = document.querySelector("#home");
  if (!header || !home || document.querySelector(".mobile-bottom-nav")) return;

  const context = document.createElement("div");
  context.className = "mobile-header-context";
  context.setAttribute("aria-live", "polite");
  context.innerHTML = "<small>moTF · 모두의 TF</small><strong>홈</strong>";

  const chatButton = document.createElement("button");
  chatButton.className = "mobile-header-action";
  chatButton.type = "button";
  chatButton.dataset.route = "chat";
  chatButton.setAttribute("aria-label", "채팅 열기");
  chatButton.innerHTML = '<i data-lucide="message-circle"></i>';

  header.append(context, chatButton);

  const discovery = document.createElement("nav");
  discovery.className = "mobile-discovery-strip";
  discovery.setAttribute("aria-label", "둘러보기");
  discovery.innerHTML = `
    <button type="button" data-route="events"><i data-lucide="sparkles"></i>MOriginal</button>
    <button type="button" data-route="community"><i data-lucide="messages-square"></i>커뮤니티</button>
    <button type="button" data-route="recreation"><i data-lucide="party-popper"></i>레크레이션</button>
    <button type="button" data-route="chat"><i data-lucide="message-circle"></i>문의 채팅</button>
  `;
  home.prepend(discovery);

  const nav = document.createElement("nav");
  nav.className = "mobile-bottom-nav";
  nav.setAttribute("aria-label", "모바일 주요 메뉴");
  nav.innerHTML = `
    <button type="button" data-route="home"><span><i data-lucide="house"></i></span><span>홈</span></button>
    <button type="button" data-route="stays"><span><i data-lucide="search"></i></span><span>숙소</span></button>
    <button class="mobile-nav-primary" type="button" data-route="myMt"><span><i data-lucide="folder-kanban"></i></span><span>내 MT</span></button>
    <button type="button" data-route="market"><span><i data-lucide="shopping-basket"></i></span><span>장보기</span></button>
    <button type="button" data-route="mypage"><span><i data-lucide="user-round"></i></span><span>마이</span></button>
  `;
  document.body.append(nav);

  function update(route) {
    const activeRoute = route || document.body.dataset.currentRoute || "home";
    const activeGroup = routeGroups[activeRoute] || activeRoute;
    const title = context.querySelector("strong");
    if (title) title.textContent = routeLabels[activeRoute] || "moTF";
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
