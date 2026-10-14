(function connectOrganizations() {
  const client = window.motfSupabase;
  if (!client) return;
  let user = null;
  let selected = "";
  let dashboard = { organizations: [], members: [], invites: [], transfers: [] };
  let queue = Promise.resolve();
  const pendingKey = "motf.organizationInvite";
  const incoming = new URLSearchParams(location.search).get("organization_invite");
  if (incoming) sessionStorage.setItem(pendingKey, incoming);
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = "/organization.css?v=20261014-org3";
  document.head.append(style);
  const escape = (value) => String(value || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const message = (value) => window.toast ? window.toast(value) : window.alert(value);
  const current = () => dashboard.organizations.find((o) => o.id === selected);
  window.motfGetOrganizationId = () => selected || null;
  window.motfCanEditOrganization = (id) => dashboard.organizations.some((o) => o.id === id);
  window.motfGetOrganizationName = () => current()?.name || "";
  window.motfGetOrganizationWallet = () => ({ account: dashboard.wallet || {}, ledger: dashboard.ledger || [] });
  const modal = document.createElement("dialog");
  modal.className = "organization-dialog";
  modal.innerHTML = '<header><h2>단체 담당자 관리</h2><button type="button" data-org-close aria-label="닫기">닫기</button></header><div data-org-detail></div><form data-org-create><h3>새 단체</h3><label>단체 이름<input name="name" required minlength="2" maxlength="80" autocomplete="off"></label><label>학교 · 소속<input name="affiliation" maxlength="120" autocomplete="organization"></label><button type="submit">단체 만들기</button></form><p data-org-error role="alert"></p>';
  document.body.append(modal);
  function render() {
    const hosts = ["myMt", "mypage", "myUsage", "bookingForm", "orderForm", "chat"].map((id) => document.getElementById(id)).filter(Boolean);
    for (const host of hosts) {
    let bar = host.querySelector(".organization-scope");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "organization-scope";
      host.prepend(bar);
    }
    bar.hidden = !user;
    bar.innerHTML = '<label>' + (host.id === "myMt" ? "MT 소속" : host.id === "chat" ? "채팅 소속" : "예약 · 포인트 소속") + '<select data-org-scope><option value="">개인</option>' +
      dashboard.organizations.map((o) => '<option value="' + escape(o.id) + '"' + (o.id === selected ? " selected" : "") + '>' + escape(o.name) + '</option>').join("") +
      '</select></label><button type="button" data-org-open>단체 관리</button>';
    }
    document.querySelectorAll("[data-point-wallet]").forEach((node) => { node.title = (current()?.name || "개인") + " 포인트"; });
    const org = current();
    const detail = modal.querySelector("[data-org-detail]");
    if (!org) { detail.innerHTML = ""; return; }
    const rep = org.member_role === "representative";
    const button = (action, title, id, key) => '<button type="button" data-org-action="' + action + '" data-org-key="' + (key || "user_id") + '" data-org-id="' + escape(id) + '">' + title + '</button>';
    detail.innerHTML = '<h3>' + escape(org.name) + '</h3>' + (rep ? '<div class="organization-actions">' + button("rename", "이름 변경") + button("invite", "담당자 초대") + '</div>' : '') +
      '<ul class="organization-members">' + dashboard.members.filter((m) => m.status === "active" || m.status === "pending").map((m) =>
        '<li><div><strong>' + escape(m.name || "담당자") + '</strong><span>' + (m.status === "pending" ? "승인 대기" : m.role === "representative" ? "대표" : "담당자") + '</span></div><div class="organization-actions">' +
        (rep && m.status === "pending" ? button("approve", "승인", m.user_id) + button("reject", "반려", m.user_id) : '') +
        (rep && m.status === "active" && m.role !== "representative" ? button("handoff_request", "대표 인계", m.user_id) + button("remove", "권한 해제", m.user_id) : '') + '</div></li>').join("") + '</ul>' +
      dashboard.invites.filter((i) => !i.accepted_by).map((i) => '<div class="organization-actions"><span>미수락 초대 · ' + escape(new Date(i.expires_at).toLocaleDateString("ko-KR")) + '까지</span>' + button("revoke_invite", "초대 취소", i.id, "invite_id") + '</div>').join("") +
      dashboard.transfers.map((t) => '<div class="organization-transfer"><p>대표 인계 · ' + (t.status === "accepted" ? "후임 수락 완료" : "후임 수락 대기") + '</p>' +
        (t.recipient_id === user.id && t.status === "requested" ? button("handoff_accept", "본인확인 후 수락", t.id, "transfer_id") : '') +
        (rep && t.status === "accepted" ? button("handoff_confirm", "인계 확정", t.id, "transfer_id") : '') +
        (rep ? button("handoff_cancel", "인계 취소") : '') + '</div>').join("") +
      (!rep ? '<div class="organization-actions">' + button("leave", "단체 나가기") + '</div>' : '');
  }
  async function rpc(action, payload) {
    const { data, error } = await client.rpc("manage_organization", { action, payload });
    if (error) throw error;
    return data;
  }
  async function reload() {
    const { data: auth } = await client.auth.getSession();
    user = auth.session?.user || null;
    dashboard = { organizations: [], members: [], invites: [], transfers: [] };
    selected = user ? sessionStorage.getItem("motf.organizationScope." + user.id) || "" : "";
    if (user) {
      const { data, error } = await client.rpc("organization_dashboard", { target_id: null });
      if (error) {
        selected = "";
        render();
        throw error;
      }
      dashboard = data;
      if (!dashboard.organizations.some((o) => o.id === selected)) selected = "";
      if (selected) {
        const result = await client.rpc("organization_dashboard", { target_id: selected });
        if (result.error) throw result.error;
        dashboard = result.data;
      }
      sessionStorage.setItem("motf.organizationScope." + user.id, selected);
      const token = sessionStorage.getItem(pendingKey);
      if (token) {
        await rpc("accept_invite", { token });
        sessionStorage.removeItem(pendingKey);
        const url = new URL(location.href);
        url.searchParams.delete("organization_invite");
        history.replaceState(history.state, "", url.pathname + url.search + url.hash);
        message("초대를 수락했습니다. 대표 담당자의 승인 후 참여할 수 있어요.");
      }
    }
    render();
  }
  window.motfReloadOrganization = () => {
    queue = queue.catch(() => {}).then(reload);
    return queue;
  };
  async function changeScope(id) {
    if (!user) return;
    if (window.motfCheckoutPending) { render(); throw new Error("결제 준비가 끝난 뒤 소속을 변경해주세요."); }
    if (window.motfChatPending) { render(); throw new Error("메시지 전송이 끝난 뒤 소속을 변경해주세요."); }
    sessionStorage.setItem("motf.organizationScope." + user.id, id || "");
    await window.motfReloadOrganization();
    window.dispatchEvent(new CustomEvent("motf:organization-changed"));
    window.motfResetMtDirectory?.();
    await window.motfReloadMtProjects?.();
    await window.motfReloadTransactions?.();
  }
  window.motfSetOrganizationScope = changeScope;
  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-org-scope]")) changeScope(event.target.value).catch((e) => message(e.message));
  });
  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-org-open]")) { render(); modal.showModal(); return; }
    if (event.target.closest("[data-org-close]")) { modal.close(); return; }
    const button = event.target.closest("[data-org-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.orgAction;
    const payload = { organization_id: selected };
    if (button.dataset.orgId) payload[button.dataset.orgKey] = button.dataset.orgId;
    button.disabled = true;
    modal.querySelector("[data-org-error]").textContent = "";
    try {
      if (action === "rename") {
        payload.name = window.prompt("단체 이름", current().name);
        if (payload.name === null) return;
        payload.affiliation = current().affiliation || "";
      }
      if (["remove", "leave", "handoff_request", "handoff_cancel", "revoke_invite", "reject"].includes(action) && !window.confirm("이 작업을 진행할까요?")) return;
      if (action === "handoff_accept" && !await window.motfVerifyIdentityForTransfer()) return;
      if (action === "handoff_confirm") {
        if (!window.confirm("대표 권한을 후임에게 넘길까요?")) return;
        payload.remove_previous = window.confirm("인계 후 내 단체 접근 권한도 해제할까요?");
      }
      const result = await rpc(action, payload);
      await changeScope(selected);
      if (action === "invite") {
        const link = new URL("/my-mt", location.origin);
        link.searchParams.set("organization_invite", result.token);
        const row = document.createElement("label");
        row.textContent = "초대 링크 (한 사람만 수락 가능)";
        const input = document.createElement("input");
        input.readOnly = true;
        input.value = link.href;
        row.append(input);
        modal.querySelector("[data-org-detail]").append(row);
        input.focus(); input.select();
      }
    } catch (error) { modal.querySelector("[data-org-error]").textContent = error.message || "단체 작업에 실패했습니다."; }
    finally { button.disabled = false; }
  });
  modal.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("button");
    button.disabled = true;
    modal.querySelector("[data-org-error]").textContent = "";
    try {
      const values = new FormData(event.target);
      const result = await rpc("create", { name: values.get("name"), affiliation: values.get("affiliation") });
      await changeScope(result.organization_id);
      event.target.reset();
    } catch (error) { modal.querySelector("[data-org-error]").textContent = error.message; }
    finally { button.disabled = false; }
  });
  window.addEventListener("motf:auth-ready", () => {
    window.motfReloadOrganization().then(() => window.motfReloadMtProjects?.()).catch((e) => message(e.message || "단체 정보를 불러오지 못했습니다."));
  });
  window.addEventListener("motf:routechange", (event) => {
    render();
    if (event.detail?.route === "myMt") {
      window.motfReloadOrganization().then(() => window.motfReloadMtProjects?.()).catch((e) => message(e.message));
    }
  });
})();
