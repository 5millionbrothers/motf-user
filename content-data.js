(async function loadLaunchContent() {
  const client = window.motfSupabase;
  if (!client) return;

  let cachedCards = [];
  let cachedSocial = {};
  let boundaryTimer = 0;

  const nowIso = new Date().toISOString();
  const [eventsResult, cardsResult, settingsResult, popupResult, recreationResult] = await Promise.all([
    client.rpc("get_public_platform_events"),
    client.from("homepage_cards").select("*").eq("is_active", true).order("sort_order").limit(60),
    client.from("platform_settings").select("setting_value").eq("setting_key", "social").maybeSingle(),
    client.from("popup_banners").select("*").eq("is_active", true).lte("starts_at", nowIso).gte("ends_at", nowIso).order("starts_at", { ascending: false }).limit(3),
    client.from("recreation_activities").select("*").eq("is_active", true).order("sort_order").order("created_at", { ascending: false }),
  ]);

  cachedCards = cardsResult.error ? [] : (cardsResult.data || []);
  cachedSocial = settingsResult.data?.setting_value || {};
  applyEvents(eventsResult.error ? [] : (eventsResult.data || []));
  if (!recreationResult.error) window.motfApplyRecreationActivities?.(recreationResult.data || []);
  if (!popupResult.error) showPopup(popupResult.data?.[0]);

  async function refreshEvents() {
    const [result, cards] = await Promise.all([
      client.rpc("get_public_platform_events"),
      client.from("homepage_cards").select("*").eq("is_active", true).order("sort_order").limit(60),
    ]);
    if (result.error) {
      console.warn("MOriginal 목록을 갱신하지 못했습니다.", result.error);
      return;
    }
    if (!cards.error) cachedCards = cards.data || [];
    applyEvents(result.data || []);
  }

  function applyEvents(events) {
    window.motfApplyLaunchContent?.(events, cachedCards, cachedSocial);
    scheduleNextBoundary(events);
  }

  function scheduleNextBoundary(events) {
    window.clearTimeout(boundaryTimer);
    const now = Date.now();
    const boundaries = events.flatMap((event) => [
      event.application_opens_at,
      event.application_closes_at,
      event.ends_at,
    ]).map((value) => new Date(value).getTime()).filter((time) => Number.isFinite(time) && time > now);
    if (!boundaries.length) return;
    const delay = Math.min(Math.max(1000, Math.min(...boundaries) - now + 750), 2147483000);
    boundaryTimer = window.setTimeout(refreshEvents, delay);
  }

  const fallbackTimer = window.setInterval(refreshEvents, 60000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshEvents();
  });
  window.addEventListener("pagehide", () => {
    window.clearTimeout(boundaryTimer);
    window.clearInterval(fallbackTimer);
  }, { once: true });

  function showPopup(popup) {
    if (!popup) return;
    const key = `motf.popup.dismissed.${popup.id}`;
    const dismissedUntil = Number(localStorage.getItem(key) || 0);
    if (dismissedUntil > Date.now()) return;
    const dialog = document.createElement("dialog");
    dialog.className = "launch-popup-dialog";
    dialog.innerHTML = `<button class="popup-close-icon" type="button" data-popup-close aria-label="팝업 닫기">×</button>${popup.image_url ? `<img class="popup-image" src="${escapeHtml(popup.image_url)}" alt="" />` : ""}<div class="popup-content"><strong>${escapeHtml(popup.title)}</strong>${popup.body ? `<p>${escapeHtml(popup.body)}</p>` : ""}<div class="popup-actions">${popup.link_url ? `<a class="primary-btn" href="${escapeHtml(popup.link_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(popup.link_label || "자세히 보기")}</a>` : ""}<button class="secondary-btn" type="button" data-popup-close>닫기</button></div><label class="popup-dismiss"><input type="checkbox" data-popup-dismiss /><span>오늘 그만 보기</span></label></div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("click", (event) => {
      if (!event.target.closest("[data-popup-close]")) return;
      if (dialog.querySelector("[data-popup-dismiss]")?.checked) {
        localStorage.setItem(key, String(Date.now() + Math.max(1, Number(popup.dismiss_days || 1)) * 86400000));
      }
      dialog.close();
      dialog.remove();
    });
    dialog.showModal();
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[character]));
  }
})();
