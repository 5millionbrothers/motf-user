(async function loadLaunchContent() {
  const client = window.motfSupabase;
  if (!client) return;

  let cachedCards = [];
  let cachedSocial = {};
  let latestEvents = [];
  let boundaryTimer = 0;
  const readSettings = () => client.from("platform_settings").select("setting_key,setting_value").in("setting_key", ["social", "home_carousel_managed"]);
  const readRecreation = () => client.from("recreation_activities").select("*").eq("is_active", true).order("sort_order").order("created_at", { ascending: false });
  function applySettings(result) {
    if (result.error) return;
    const settings = new Map((result.data || []).map(row => [row.setting_key, row.setting_value]));
    cachedSocial = { ...(settings.get("social") || {}), homeCarouselManaged: settings.get("home_carousel_managed") === true };
  }

  const nowIso = new Date().toISOString();
  const [eventsResult, cardsResult, settingsResult, popupResult, recreationResult] = await Promise.all([
    client.rpc("get_public_platform_events"),
    client.from("homepage_cards").select("*").eq("is_active", true).order("sort_order").limit(60),
    readSettings(),
    client.from("popup_banners").select("*").eq("is_active", true).lte("starts_at", nowIso).gte("ends_at", nowIso).order("starts_at", { ascending: false }).limit(3),
    readRecreation(),
  ]);

  cachedCards = cardsResult.error ? [] : (cardsResult.data || []);
  applySettings(settingsResult);
  applyEvents(eventsResult.error ? [] : (eventsResult.data || []));
  if (!recreationResult.error) window.motfApplyRecreationActivities?.(recreationResult.data || []);
  if (!popupResult.error) showPopup(popupResult.data?.[0]);

  async function refreshEvents() {
    const [result, cards, settings] = await Promise.all([
      client.rpc("get_public_platform_events"),
      client.from("homepage_cards").select("*").eq("is_active", true).order("sort_order").limit(60),
      readSettings(),
    ]);
    if (!cards.error) cachedCards = cards.data || [];
    applySettings(settings);
    if (result.error) {
      console.warn("MOriginal 목록을 갱신하지 못했습니다.", result.error);
    }
    applyEvents(result.error ? latestEvents : (result.data || []));
  }

  function applyEvents(events) {
    latestEvents = events;
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
  async function refreshRecreation() {
    const result = await readRecreation();
    if (!result.error) window.motfApplyRecreationActivities?.(result.data || []);
  }
  window.addEventListener("motf:routechange", event => {
    if (["community", "recreation"].includes(event.detail?.route)) void refreshRecreation();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void refreshEvents();
      if (["community", "recreation"].includes(currentRoute())) void refreshRecreation();
    }
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
    dialog.dataset.popupPosition = popup.display_position || "center";
    dialog.dataset.popupStyle = popup.display_style || "classic";
    dialog.setAttribute("aria-label", popup.title);
    const image = webUrl(popup.image_url);
    const link = webUrl(popup.link_url);
    const days = Math.max(0, Number(popup.dismiss_days ?? 1));
    dialog.innerHTML = `<button class="popup-close-icon" type="button" data-popup-close aria-label="팝업 닫기">×</button>${image && dialog.dataset.popupStyle !== "notice" ? `<img class="popup-image" src="${escapeHtml(image)}" alt="" />` : ""}<div class="popup-content"><strong>${escapeHtml(popup.title)}</strong>${popup.body ? `<p>${escapeHtml(popup.body)}</p>` : ""}<div class="popup-actions">${link ? `<a class="primary-btn" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(popup.link_label || "자세히 보기")}</a>` : ""}<button class="secondary-btn" type="button" data-popup-close>닫기</button></div>${days ? `<label class="popup-dismiss"><input type="checkbox" data-popup-dismiss /><span>${days === 1 ? "오늘 그만 보기" : `${days}일간 그만 보기`}</span></label>` : ""}</div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("click", (event) => {
      if (!event.target.closest("[data-popup-close]")) return;
      if (dialog.querySelector("[data-popup-dismiss]")?.checked) {
        localStorage.setItem(key, String(Date.now() + days * 86400000));
      }
      dialog.close();
    });
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
  }

  function webUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, location.origin);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }
  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[character]));
  }
})();
