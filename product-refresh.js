(function initializeProductRefresh() {
  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

  function initializePickers() {
    if (!window.flatpickr) return;
    flatpickr.localize(flatpickr.l10ns.ko);
    qsa('input[type="date"]').forEach((input) => {
      if (input._flatpickr) return;
      const initialValue = input.value;
      const dialog = input.closest("dialog");
      const isStayDate = input.matches("[data-stay-search-field], #stayCheckInDate, #stayCheckOutDate");
      flatpickr(input, {
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "Y년 m월 d일",
        minDate: input.id?.includes("usage") ? null : "today",
        maxDate: isStayDate ? new Date().fp_incr(90) : null,
        disableMobile: true,
        monthSelectorType: "static",
        position: dialog ? "above left" : "below left",
        onDayCreate: (_selectedDates, _dateStr, _instance, dayElem) => {
          const textNode = [...dayElem.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
          if (!textNode || dayElem.querySelector(".day-number")) return;
          const number = document.createElement("span");
          number.className = "day-number";
          number.textContent = textNode.textContent.trim();
          textNode.replaceWith(number);
        },
        ...(dialog ? { appendTo: dialog } : {}),
      });
      if (initialValue) input._flatpickr.setDate(initialValue, false);
    });
    qsa('input[type="time"]').forEach((input) => {
      if (input._flatpickr) return;
      flatpickr(input, { enableTime: true, noCalendar: true, dateFormat: "H:i", time_24hr: true, minuteIncrement: 10, disableMobile: true });
    });
  }

  async function loadAffiliations() {
    const container = qs("#affiliationList");
    const client = window.motfSupabase;
    const userId = window.motfCurrentUserId;
    if (!client || !userId) return;
    const { data } = await client.from("profiles").select("affiliations").eq("id", userId).maybeSingle();
    const items = Array.isArray(data?.affiliations) ? data.affiliations : [];
    if (container) renderAffiliations(items);
    const options = qs("#affiliationOptions");
    if (options) options.innerHTML = items.map((item) => `<option value="${escapeHtml([item.organization, item.detail].filter(Boolean).join(" "))}"></option>`).join("");
  }

  function renderAffiliations(items) {
    const container = qs("#affiliationList");
    if (!container) return;
    container.dataset.items = JSON.stringify(items);
    container.innerHTML = items.length ? items.map((item, index) => `<span class="affiliation-chip"><b>${escapeHtml(item.kind)}</b>${escapeHtml(item.organization)}${item.detail ? ` · ${escapeHtml(item.detail)}` : ""}<button type="button" data-remove-affiliation="${index}" aria-label="소속 삭제">×</button></span>`).join("") : '<p class="empty-inline">등록한 소속이 없습니다.</p>';
  }

  async function saveAffiliations(items) {
    const client = window.motfSupabase;
    const userId = window.motfCurrentUserId;
    if (!client || !userId) return;
    const { error } = await client.from("profiles").update({ affiliations: items, updated_at: new Date().toISOString() }).eq("id", userId);
    if (error) window.toast?.("소속을 저장하지 못했습니다. DB 44번 SQL 적용을 확인해주세요.");
    else { renderAffiliations(items); window.toast?.("소속을 저장했습니다."); }
  }

  async function uploadCommunityFiles(form, userId) {
    const input = form.querySelector('input[type="file"]');
    const files = [...(input?.files || [])].slice(0, 5);
    const urls = [];
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${userId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
      const { error } = await window.motfSupabase.storage.from("community-media").upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = window.motfSupabase.storage.from("community-media").getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  }

  window.motfSubmitRecreation = async function submitRecreation(form) {
    const client = window.motfSupabase;
    const userId = window.motfCurrentUserId;
    if (!client || !userId) return window.toast?.("로그인 후 추천할 수 있어요.");
    const space = qs("#activitySubmitSpace")?.value || "실내";
    let mediaUrls = [];
    try { mediaUrls = await uploadCommunityFiles(form, userId); } catch { return window.toast?.("첨부 파일 업로드에 실패했습니다."); }
    const { error } = await client.from("recreation_submissions").insert({
      submitted_by: userId,
      title: qs("#activitySubmitTitle").value.trim(),
      people_label: qs("#activitySubmitPeople").value.trim() || null,
      spaces: space === "공간 무관" ? ["indoor", "outdoor"] : [space === "야외" ? "outdoor" : "indoor"],
      play_type: "icebreak",
      instructions: qs("#activitySubmitNote").value.trim() || null,
      media_urls: mediaUrls,
      review_status: "pending",
    });
    if (error) return window.toast?.("추천을 접수하지 못했습니다. DB 44번 SQL 적용을 확인해주세요.");
    form.reset();
    form.hidden = true;
    form.classList.remove("full-page-compose");
    qs("#recreation")?.classList.remove("compose-mode");
    window.toast?.("관리자 검토 요청이 접수되었습니다. 승인 후 목록에 공개됩니다.");
    renderMyActivity();
  };

  window.motfSubmitCommunityPost = async function submitCommunityPost(form, draft) {
    const client = window.motfSupabase;
    const userId = window.motfCurrentUserId;
    if (!client || !userId) return window.toast?.("로그인 후 작성할 수 있어요.");
    let mediaUrls = [];
    try { mediaUrls = await uploadCommunityFiles(form, userId); } catch { return window.toast?.("첨부 파일 업로드에 실패했습니다."); }
    const { data, error } = await client.from("community_posts").insert({
      author_id: userId,
      author_name: "익명",
      board_key: draft.boardId,
      title: draft.title,
      body: draft.body,
      media_urls: mediaUrls,
    }).select("id,title,body,created_at,media_urls").single();
    if (error) return window.toast?.("게시글을 등록하지 못했습니다. DB 44번 SQL 적용을 확인해주세요.");
    window.motfAddCommunityPost?.({ id: data.id, boardId: draft.boardId, title: data.title, body: data.body, authorId: userId, createdAt: data.created_at, media: data.media_urls?.length ? `첨부 ${data.media_urls.length}` : "" });
    form.reset(); form.hidden = true;
    window.toast?.("익명 게시글이 등록되었습니다.");
    renderMyActivity();
  };

  async function renderMyActivity() {
    const container = qs("#myActivityList");
    const client = window.motfSupabase;
    const userId = window.motfCurrentUserId;
    if (!container || !client || !userId) return;
    const [posts, submissions] = await Promise.all([
      client.from("community_posts").select("id,title,created_at").eq("author_id", userId).order("created_at", { ascending: false }).limit(10),
      client.from("recreation_submissions").select("id,title,review_status,created_at").eq("submitted_by", userId).order("created_at", { ascending: false }).limit(10),
    ]);
    const items = [
      ...(posts.data || []).map((item) => ({ ...item, kind: "게시글", status: "게시됨" })),
      ...(submissions.data || []).map((item) => ({ ...item, kind: "레크레이션 추천", status: ({ pending: "검토 중", approved: "승인", rejected: "반려" }[item.review_status] || item.review_status) })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    container.innerHTML = items.length ? items.map((item) => `<article class="usage-card"><div><span class="pill">${item.kind}</span><h3>${escapeHtml(item.title)}</h3><small>${new Date(item.created_at).toLocaleString("ko-KR")}</small></div><strong>${item.status}</strong></article>`).join("") : '<div class="empty-state">아직 작성한 글이나 추천 내역이 없습니다.</div>';
  }

  async function loadCommunityData() {
    const client = window.motfSupabase;
    if (!client) return;
    const [posts, likes, comments] = await Promise.all([
      client.from("community_posts").select("id,author_id,author_name,board_key,title,body,media_urls,created_at").eq("is_hidden", false).order("created_at", { ascending: false }).limit(200),
      client.from("community_post_likes").select("post_id,user_id"),
      client.from("community_comments").select("id,post_id,user_id,parent_comment_id,body,created_at").order("created_at"),
    ]);
    const commentRows = comments.data || [];
    const byId = new Map(commentRows.map((item) => [item.id, item]));
    window.motfApplyCommunityData?.(posts.data || [], likes.data || [], commentRows.map((item) => ({ ...item, parent_user_id: byId.get(item.parent_comment_id)?.user_id || null })));
  }

  function filterUsageByDate() {
    const from = qs("#usageFrom")?.value ? new Date(`${qs("#usageFrom").value}T00:00:00`) : null;
    const to = qs("#usageTo")?.value ? new Date(`${qs("#usageTo").value}T23:59:59`) : null;
    qsa("#reservationList > *, #orderList > *").forEach((card) => {
      const match = card.textContent.match(/20\d{2}[.-]\s?\d{1,2}[.-]\s?\d{1,2}|20\d{2}-\d{2}-\d{2}/);
      if (!match) { card.hidden = false; return; }
      const date = new Date(match[0].replace(/[.]\s?/g, "-"));
      card.hidden = Boolean((from && date < from) || (to && date > to));
    });
  }

  document.addEventListener("click", async (event) => {
    const likeButton = event.target.closest("[data-like-post]");
    if (likeButton) {
      const active = window.motfGetActiveCommunityPost?.();
      const postId = active?.post?.id || "";
      if (/^[0-9a-f-]{36}$/i.test(postId) && window.motfCurrentUserId) {
        window.motfSupabase.from("community_post_likes").insert({ post_id: postId, user_id: window.motfCurrentUserId }).then(() => {});
      }
    }
    const recreationButton = event.target.closest("[data-open-recreation-form]");
    if (recreationButton) {
      const form = qs("#activitySubmitForm");
      qs("#recreation")?.classList.add("compose-mode");
      form.hidden = false;
      form.classList.add("full-page-compose");
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (event.target.closest("[data-close-recreation-compose]")) {
      const form = qs("#activitySubmitForm");
      form.hidden = true;
      form.classList.remove("full-page-compose");
      qs("#recreation")?.classList.remove("compose-mode");
      qs("#recreation .view-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (event.target.closest("[data-close-board-compose]")) {
      const form = qs("#boardWriteForm");
      form.hidden = true;
      form.classList.remove("full-page-compose", "compose-open");
      qs("#boardDetail")?.classList.remove("compose-mode");
      qs("#boardDetailHeader")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const add = event.target.closest("[data-add-affiliation]");
    if (add) {
      const container = qs("#affiliationList");
      const items = JSON.parse(container.dataset.items || "[]");
      const organization = qs("#affiliationSchool").value.trim();
      if (!organization) return window.toast?.("학교 또는 기관명을 입력해주세요.");
      items.push({ kind: qs("#affiliationKind").value, organization, detail: qs("#affiliationDetail").value.trim() });
      qs("#affiliationSchool").value = ""; qs("#affiliationDetail").value = "";
      await saveAffiliations(items);
    }
    const remove = event.target.closest("[data-remove-affiliation]");
    if (remove) {
      const container = qs("#affiliationList");
      const items = JSON.parse(container.dataset.items || "[]");
      items.splice(Number(remove.dataset.removeAffiliation), 1);
      await saveAffiliations(items);
    }
    const alcoholAction = event.target.closest("[data-add-current], [data-buy-current]");
    if (alcoholAction?.dataset.alcohol === "true" && localStorage.getItem("motf.adultVerified") !== "1") {
      event.preventDefault(); event.stopImmediatePropagation();
      const confirmed = window.confirm("주류 주문을 위해 만 19세 이상임을 확인해주세요. 수령 시 대표자 신분증을 다시 확인합니다.");
      if (confirmed) { localStorage.setItem("motf.adultVerified", "1"); window.toast?.("성인 확인이 완료되었습니다. 상품을 다시 선택해주세요."); }
    }
  }, true);

  document.addEventListener("submit", async (event) => {
    if (event.target.id !== "postCommentForm") return;
    const active = window.motfGetActiveCommunityPost?.();
    const postId = active?.post?.id || "";
    if (!/^[0-9a-f-]{36}$/i.test(postId) || !window.motfCurrentUserId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const input = qs("#postCommentInput");
    const body = input.value.trim();
    if (!body) return;
    const payload = { post_id: postId, user_id: window.motfCurrentUserId, parent_comment_id: input.dataset.replyCommentId || null, body };
    const { data, error } = await window.motfSupabase.from("community_comments").insert(payload).select("id,user_id,body,created_at").single();
    if (error) return window.toast?.("댓글을 등록하지 못했습니다.");
    window.motfAppendCommunityComment?.({ id: data.id, body: data.body, userId: data.user_id, replyTo: input.dataset.replyTo || null, createdAt: data.created_at });
    input.value = ""; delete input.dataset.replyTo; delete input.dataset.replyCommentId; input.placeholder = "익명 댓글을 입력하세요";
  }, true);

  qs("#usagePeriodFilter")?.addEventListener("submit", (event) => { event.preventDefault(); filterUsageByDate(); });
  qs("#usagePeriodFilter")?.addEventListener("reset", () => setTimeout(() => qsa("#reservationList > *, #orderList > *").forEach((card) => { card.hidden = false; }), 0));

  const observer = new MutationObserver(() => {
    initializePickers();
    if (["myAccount", "booking"].includes(document.body.dataset.currentRoute)) loadAffiliations();
    if (document.body.dataset.currentRoute === "myUsage") renderMyActivity();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ["data-current-route"] });
  initializePickers();
  window.setTimeout(loadCommunityData, 250);

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  }
})();
