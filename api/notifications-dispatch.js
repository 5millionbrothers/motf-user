const https = require("https");
const { json } = require("./_utils");
const { notificationRecipient } = require("./_notification-recipient");

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const KNOWN_SUPABASE_URL = "https://izbwcqnvwsdijoognoag.supabase.co";
const DEAD_SUPABASE_HOSTS = new Set(["avvfqgtkeziughphppcj.supabase.co"]);
const ALIGO_API_BASE = "https://kakaoapi.aligo.in";
const ALIGO_TEMPLATE_CODES = {
  USER_VA_ISSUED_V1: "UJ_4553",
  USER_DEPOSIT_DEADLINE_V1: "UJ_4554",
  USER_RESERVATION_REQUESTED_V1: "UJ_4556",
  USER_RESERVATION_CONFIRMED_V1: "UJ_4557",
  USER_RESERVATION_CANCELLED_V1: "UJ_4558",
  USER_ORDER_STATUS_V1: "UJ_4560",
  USER_SUPPORT_REPLY_V1: "UJ_4561",
  USER_REFUND_STATUS_V1: "UJ_4562",
  USER_CHAT_RECEIVED_V1: "UJ_4563",
  OWNER_CHAT_RECEIVED_V1: "UJ_4566",
  OWNER_CANCEL_REFUND_REQUEST_V1: "UJ_4569",
  OWNER_SETTLEMENT_STATUS_V1: "UJ_4572",
  OWNER_AVAILABILITY_CONFLICT_V1: "UJ_4573",
  ADMIN_RESERVATION_STATUS_V1: "UJ_4574",
  ADMIN_REFUND_REQUIRED_V1: "UJ_4575",
  ADMIN_REFUND_FAILED_V1: "UJ_4577",
  ADMIN_NEW_ORDER_V1: "UJ_4578",
  ADMIN_PAYMENT_WEBHOOK_FAILED_V1: "UJ_4579",
  ADMIN_SUPPORT_RECEIVED_V1: "UJ_4580",
  ADMIN_CHAT_DELAYED_V1: "UJ_4581",
  ADMIN_SETTLEMENT_STATUS_V1: "UJ_4582",
  ADMIN_AVAILABILITY_CHANGED_V1: "UJ_4583",
  ADMIN_NOTIFICATION_FAILED_V1: "UJ_4584",
  OWNER_RESERVATION_REQUEST_V1: "UJ_4855",
  OWNER_ORDER_REQUEST_V1: "UJ_4856",
  USER_ORDER_RECEIVED_V1: "UJ_4858",
};

let aligoTemplateCache = { expiresAt: 0, templates: new Map() };

function supabaseBaseUrl() {
  const configured = String(process.env.SUPABASE_URL || "").trim();
  try {
    const url = new URL(configured || KNOWN_SUPABASE_URL);
    if (DEAD_SUPABASE_HOSTS.has(url.hostname)) return KNOWN_SUPABASE_URL;
    return url.origin;
  } catch {
    return KNOWN_SUPABASE_URL;
  }
}

async function requestJson(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("fetch timed out")), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return requestJsonWithHttps(url, options, timeoutMs);
  } finally {
    clearTimeout(timeout);
  }
}

function requestJsonWithHttps(urlString, options = {}, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const body = options.body || "";
    const request = https.request({
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      method: options.method || "GET",
      timeout: timeoutMs,
      headers: {
        ...(options.headers || {}),
        ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
      },
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        responseBody += chunk;
      });
      response.on("end", () => {
        let data = null;
        try {
          data = responseBody ? JSON.parse(responseBody) : null;
        } catch {}
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode || 0,
          data,
        });
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error("https timed out"));
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

function errorMessage(data, fallback = "Request failed.") {
  return data?.message || data?.msg || data?.error_description || data?.error || fallback;
}

function envFlag(name, fallback = false) {
  const value = String(process.env[name] || "").trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "y", "yes", "on"].includes(value);
}

function normalizePhone(value) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function aligoCredentials() {
  return {
    userid: String(process.env.ALIGO_USER_ID || "").trim(),
    apikey: String(process.env.ALIGO_API_KEY || "").trim(),
    senderkey: String(process.env.ALIGO_SENDER_KEY || "").trim(),
    sender: normalizePhone(process.env.ALIGO_SENDER_NUMBER),
  };
}

function aligoRelayConfig() {
  return {
    url: String(process.env.ALIGO_RELAY_URL || "").trim().replace(/\/+$/, ""),
    secret: String(process.env.ALIGO_RELAY_SECRET || "").trim(),
  };
}

function validateAligoConfiguration(credentials) {
  const relay = aligoRelayConfig();
  if (relay.url || relay.secret) {
    const missing = [];
    if (!relay.url) missing.push("ALIGO_RELAY_URL");
    if (!relay.secret) missing.push("ALIGO_RELAY_SECRET");
    if (missing.length) throw new Error(`ALIGO relay environment is missing: ${missing.join(", ")}`);
    return;
  }

  const missing = Object.entries(credentials)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`ALIGO environment is missing: ${missing.join(", ")}`);
  }
}

async function aligoRequest(path, params) {
  const relay = aligoRelayConfig();
  if (relay.url && relay.secret) {
    const relayParams = { ...params };
    delete relayParams.userid;
    delete relayParams.apikey;
    delete relayParams.senderkey;
    delete relayParams.sender;

    const result = await requestJson(`${relay.url}/v1/aligo/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-relay-secret": relay.secret,
      },
      body: JSON.stringify({ path, params: relayParams }),
    }, 15000);
    if (!result.ok || Number(result.data?.code) !== 0) {
      const error = new Error(errorMessage(result.data, `Aligo relay request failed (${result.status}).`));
      error.statusCode = result.status || 502;
      error.providerResponse = result.data;
      throw error;
    }
    return result.data;
  }

  const body = new URLSearchParams(params).toString();
  const result = await requestJson(`${ALIGO_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body,
  }, 12000);
  if (!result.ok || Number(result.data?.code) !== 0) {
    const error = new Error(errorMessage(result.data, `Aligo request failed (${result.status}).`));
    error.statusCode = result.status || 502;
    error.providerResponse = result.data;
    throw error;
  }
  return result.data;
}

async function approvedAligoTemplates(credentials) {
  if (aligoTemplateCache.expiresAt > Date.now() && aligoTemplateCache.templates.size) {
    return aligoTemplateCache.templates;
  }
  const data = await aligoRequest("/akv10/template/list/", {
    apikey: credentials.apikey,
    userid: credentials.userid,
    senderkey: credentials.senderkey,
  });
  const templates = new Map();
  for (const template of Array.isArray(data.list) ? data.list : []) {
    if (template.inspStatus !== "APR" || template.status === "S") continue;
    templates.set(template.templtCode, template);
  }
  aligoTemplateCache = { expiresAt: Date.now() + 5 * 60 * 1000, templates };
  return templates;
}

function templateValue(value, item, buttonName = "") {
  const payload = item.payload || {};
  const buttonLinks = item.button_links || {};
  const rendered = String(value || "").replace(/#\{([^}]+)\}/g, (match, key) => {
    const replacement = payload[key] ?? buttonLinks[key] ?? buttonLinks[buttonName];
    return replacement == null ? match : String(replacement);
  });
  const unresolved = rendered.match(/#\{[^}]+\}/g);
  if (unresolved) {
    throw new Error(`알림톡 치환값이 없습니다: ${unresolved.join(", ")}`);
  }
  return rendered;
}

function aligoButtons(template, item) {
  const buttons = (Array.isArray(template.buttons) ? template.buttons : []).map((button) => {
    const result = { name: button.name, linkType: button.linkType };
    if (button.linkType === "WL") {
      result.linkM = templateValue(button.linkMo, item, button.name);
      if (button.linkPc) result.linkP = templateValue(button.linkPc, item, button.name);
    }
    if (button.linkType === "AL") {
      result.linkI = templateValue(button.linkIos, item, button.name);
      result.linkA = templateValue(button.linkAnd, item, button.name);
    }
    return result;
  });
  return buttons.length ? { button: buttons } : null;
}

async function supabaseRequest(path, options = {}) {
  const result = await requestJson(`${supabaseBaseUrl()}${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!result.ok) {
    const error = new Error(errorMessage(result.data, "Supabase request failed."));
    error.statusCode = result.status;
    throw error;
  }
  return result.data;
}

async function authenticatedUser(authorization) {
  if (!authorization?.startsWith("Bearer ")) return null;
  const result = await requestJson(`${supabaseBaseUrl()}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: authorization,
    },
  });
  if (!result.ok) return null;
  return result.data;
}

async function isAdminUser(userId) {
  const rows = await supabaseRequest(
    `/rest/v1/profiles?select=id,role,status&id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  const profile = rows?.[0];
  return profile?.role === "admin" && profile?.status === "approved";
}

async function authorizeDispatch(req) {
  const configuredSecret = String(process.env.NOTIFICATION_DISPATCH_SECRET || "").trim();
  const providedSecret = String(req.headers["x-notification-secret"] || "").trim();
  if (configuredSecret && providedSecret && configuredSecret === providedSecret) {
    return { ok: true, mode: "secret" };
  }

  const authorization = String(req.headers.authorization || "").trim();
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (cronSecret && authorization === `Bearer ${cronSecret}`) {
    return { ok: true, mode: "cron" };
  }

  if (configuredSecret && authorization === `Bearer ${configuredSecret}`) {
    return { ok: true, mode: "secret" };
  }

  const user = await authenticatedUser(req.headers.authorization);
  if (user?.id && await isAdminUser(user.id)) {
    return { ok: true, mode: "admin", userId: user.id };
  }

  return { ok: false };
}

async function claimBatch(limit) {
  const rows = await supabaseRequest("/rest/v1/rpc/claim_notification_batch", {
    method: "POST",
    body: JSON.stringify({ batch_limit: limit }),
  });
  return Array.isArray(rows) ? rows : [];
}

async function completeNotification(item, status, provider, providerMessageId, requestPayload, responsePayload, errorMessageText = null) {
  await supabaseRequest("/rest/v1/rpc/complete_notification", {
    method: "POST",
    body: JSON.stringify({
      target_outbox_id: item.id,
      final_status: status,
      target_provider: provider,
      target_provider_message_id: providerMessageId,
      target_request_payload: requestPayload,
      target_response_payload: responsePayload,
      target_error_message: errorMessageText,
    }),
  });
}

async function optionalRpc(functionName, payload = {}) {
  try {
    const data = await supabaseRequest(`/rest/v1/rpc/${functionName}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { functionName, ok: true, data };
  } catch (error) {
    const message = String(error.message || "");
    const isMissingFunction = error.statusCode === 404
      || /Could not find|schema cache|not found/i.test(message);

    if (isMissingFunction) {
      return { functionName, ok: false, skipped: true, message };
    }

    console.warn(`notification maintenance RPC failed: ${functionName}`, error);
    return { functionName, ok: false, message };
  }
}

async function runNotificationMaintenance(source) {
  if (source === "notification_outbox_trigger") return [];

  const jobs = [
    ["sync_partner_settlements", {}],
    ["enqueue_deposit_deadline_notifications", { deadline_window_hours: 3 }],
    ["enqueue_delayed_chat_notifications", { threshold_minutes: 30 }],
  ];

  const results = [];
  for (const [functionName, payload] of jobs) {
    results.push(await optionalRpc(functionName, payload));
  }
  return results;
}

function buildMockRequestPayload(item) {
  return {
    channel: "kakao_alimtalk",
    provider: "mock",
    templateKey: item.template_key,
    eventKey: item.event_key,
    to: {
      userId: item.recipient_user_id,
      role: item.recipient_role,
      name: item.recipient_name,
      phone: item.recipient_phone,
    },
    payload: item.payload || {},
    buttonLinks: item.button_links || {},
  };
}

async function sendMockAlimtalk(item) {
  const requestPayload = buildMockRequestPayload(item);
  const providerMessageId = `mock_${item.id}_${Date.now()}`;
  return {
    status: "mock_sent",
    provider: "mock",
    providerMessageId,
    requestPayload,
    responsePayload: {
      ok: true,
      providerMessageId,
      message: "Mock Alimtalk dispatch completed. No real Kakao message was sent.",
    },
  };
}

async function sendAligoAlimtalk(item) {
  const route = await supabaseRequest("/rest/v1/rpc/notification_delivery_route", {
    method: "POST",
    body: JSON.stringify({ target_outbox_id: item.id }),
  });
  if (route?.recipient_role !== item.recipient_role || route?.recipient_user_id !== item.recipient_user_id) {
    throw new Error("알림 수신자 검증 결과가 대기열과 일치하지 않습니다.");
  }
  // Only use the DB-verified destination, never an environment-variable override.
  const receiver = notificationRecipient({ ...item, recipient_phone: route.recipient_phone });
  const credentials = aligoCredentials();
  validateAligoConfiguration(credentials);

  const templateCode = ALIGO_TEMPLATE_CODES[item.template_key];
  if (!templateCode) throw new Error(`알리고 템플릿 코드가 없습니다: ${item.template_key}`);

  const templates = await approvedAligoTemplates(credentials);
  const template = templates.get(templateCode);
  if (!template) throw new Error(`승인·활성 상태의 알리고 템플릿을 찾을 수 없습니다: ${templateCode}`);

  const message = templateValue(template.templtContent, item);
  const emphasisTitle = template.templtTitle ? templateValue(template.templtTitle, item) : "";
  const buttons = aligoButtons(template, item);
  const params = {
    ...credentials,
    tpl_code: templateCode,
    receiver_1: receiver,
    recvname_1: String(item.recipient_name || "").trim(),
    subject_1: template.templtName || item.template_key,
    message_1: message,
    failover: envFlag("ALIGO_FAILOVER_ENABLED") ? "Y" : "N",
    testMode: envFlag("ALIGO_TEST_MODE") ? "Y" : "N",
  };
  if (emphasisTitle) params.emtitle_1 = emphasisTitle;
  if (buttons) params.button_1 = JSON.stringify(buttons);

  const responsePayload = await aligoRequest("/akv10/alimtalk/send/", params);
  const providerMessageId = String(responsePayload.info?.mid || "");
  if (!providerMessageId) throw new Error("알리고 발송 요청은 성공했지만 메시지 ID가 없습니다.");

  return {
    status: "sent",
    provider: "aligo",
    providerMessageId,
    requestPayload: {
      channel: "kakao_alimtalk",
      provider: "aligo",
      templateKey: item.template_key,
      templateCode,
      recipientPhone: receiver,
      recipientRole: item.recipient_role,
      recipientUserId: item.recipient_user_id,
      originalRecipientPhone: normalizePhone(item.recipient_phone),
      testRecipientOverride: false,
      queuedRecipientPhone: normalizePhone(item.recipient_phone),
      routingSource: route.routing_source,
      subject: params.subject_1,
      message,
      buttons,
      failover: params.failover,
      testMode: params.testMode,
    },
    responsePayload,
  };
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return json(res, 405, { ok: false, message: "GET or POST only." });
  }

  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length) {
    return json(res, 503, {
      ok: false,
      code: "NOTIFICATION_ENV_MISSING",
      message: `Notification env is missing: ${missing.join(", ")}`,
    });
  }

  const auth = await authorizeDispatch(req);
  if (!auth.ok) {
    return json(res, 401, {
      ok: false,
      message: "알림 발송 처리 권한이 없습니다.",
    });
  }

  try {
    const body = req.method === "POST"
      ? (typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}))
      : {};
    const requestUrl = new URL(req.url, "https://motf.co.kr");
    const queryLimit = Number(requestUrl.searchParams.get("limit"));
    const source = String(body.source || requestUrl.searchParams.get("source") || "");
    const maintenance = await runNotificationMaintenance(source);
    const limit = Math.max(1, Math.min(Number(body.limit || queryLimit || 20), 100));
    const items = await claimBatch(limit);
    const results = [];

    for (const item of items) {
      try {
        const result = envFlag("ALIGO_LIVE_ENABLED")
          ? await sendAligoAlimtalk(item)
          : await sendMockAlimtalk(item);
        await completeNotification(
          item,
          result.status,
          result.provider,
          result.providerMessageId,
          result.requestPayload,
          result.responsePayload,
        );
        results.push({
          id: item.id,
          templateKey: item.template_key,
          status: result.status,
          providerMessageId: result.providerMessageId,
        });
      } catch (error) {
        const liveProvider = envFlag("ALIGO_LIVE_ENABLED");
        const requestPayload = liveProvider
          ? {
              channel: "kakao_alimtalk",
              provider: "aligo",
              templateKey: item.template_key,
              templateCode: ALIGO_TEMPLATE_CODES[item.template_key] || null,
              recipientPhone: normalizePhone(item.recipient_phone),
              recipientRole: item.recipient_role,
              testRecipientOverride: false,
            }
          : buildMockRequestPayload(item);
        await completeNotification(
          item,
          "failed",
          liveProvider ? "aligo" : "mock",
          null,
          requestPayload,
          { ok: false, message: error.message || "Alimtalk dispatch failed.", provider: error.providerResponse || null },
          error.message || "Alimtalk dispatch failed.",
        );
        results.push({
          id: item.id,
          templateKey: item.template_key,
          status: "failed",
          message: error.message || "Alimtalk dispatch failed.",
        });
      }
    }

    return json(res, 200, {
      ok: true,
      mode: auth.mode,
      provider: envFlag("ALIGO_LIVE_ENABLED") ? "aligo" : "mock",
      claimed: items.length,
      maintenance,
      results,
    });
  } catch (error) {
    console.error("notifications-dispatch", error);
    return json(res, error.statusCode || 500, {
      ok: false,
      code: "NOTIFICATION_DISPATCH_ERROR",
      message: error.message || "알림 발송 처리에 실패했습니다.",
    });
  }
};
