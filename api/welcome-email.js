const { json } = require("./_utils");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "Method not allowed" });

  let claim = null;
  let claimContext = null;
  try {
    const supabaseUrl = required("SUPABASE_URL");
    const anonKey = required("SUPABASE_PUBLISHABLE_KEY");
    const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = String(req.headers.authorization || "");
    if (!authorization.startsWith("Bearer ")) return json(res, 401, { ok: false, message: "로그인이 필요합니다." });

    const accessToken = authorization.slice(7);
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
    });
    const user = await userResponse.json().catch(() => null);
    if (!userResponse.ok || !user?.id || !user?.email || !user?.email_confirmed_at) {
      return json(res, 401, { ok: false, message: "이메일 인증이 완료된 계정만 이용할 수 있습니다." });
    }

    const resendKey = String(process.env.RESEND_API_KEY || "").trim();
    if (user.email.endsWith("@accounts.motf.invalid")) return json(res, 200, { ok: true, skipped: true });
    if (!resendKey) {
      console.warn("welcome-email skipped: RESEND_API_KEY is not configured");
      return json(res, 200, {
        ok: false,
        skipped: true,
        code: "EMAIL_PROVIDER_NOT_CONFIGURED",
      });
    }

    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=welcome_email_sent_at&limit=1`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    const profiles = await profileResponse.json().catch(() => []);
    if (!profileResponse.ok) throw new Error(profiles?.message || "가입 완료 메일 상태를 확인하지 못했습니다.");
    if (profiles[0]?.welcome_email_sent_at) return json(res, 200, { ok: true, skipped: true });

    claim = new Date().toISOString();
    claimContext = { supabaseUrl, serviceKey, userId: user.id };
    const claimResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&welcome_email_sent_at=is.null&select=id`, {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ welcome_email_sent_at: claim, updated_at: claim }),
    });
    const claimedRows = await claimResponse.json().catch(() => []);
    if (!claimResponse.ok) throw new Error(claimedRows?.message || "가입 완료 메일 발송권을 확인하지 못했습니다.");
    if (!claimedRows.length) return json(res, 200, { ok: true, skipped: true });

    const body = await readBody(req).catch(() => ({}));
    const displayName = String(body?.name || user.user_metadata?.full_name || "이용자").slice(0, 40);
    const sender = process.env.WELCOME_EMAIL_FROM || "모티프 <hello@motf.co.kr>";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: sender,
        to: [user.email],
        subject: "모티프 회원가입이 완료되었습니다",
        html: `<div style="font-family:Arial,'Noto Sans KR',sans-serif;max-width:560px;margin:auto;padding:36px 24px;color:#20251f"><p style="color:#657552;font-weight:700">moTF 모티프</p><h1 style="font-size:26px;margin:16px 0">${escapeHtml(displayName)}님, 반가워요.</h1><p style="font-size:16px;line-height:1.7;color:#535b51">이메일 인증과 회원가입이 완료되었습니다. 이제 숙소와 마트를 찾고, 필요한 준비를 한곳에서 이어갈 수 있어요.</p><a href="https://motf.co.kr" style="display:inline-block;margin-top:20px;padding:13px 20px;background:#4f6540;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">모티프 시작하기</a></div>`,
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.message || "가입 완료 메일 발송에 실패했습니다.");

    await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&welcome_email_sent_at=eq.${encodeURIComponent(claim)}`, {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ welcome_email_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    });
    return json(res, 200, { ok: true });
  } catch (error) {
    if (claim && claimContext) {
      await fetch(`${claimContext.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(claimContext.userId)}&welcome_email_sent_at=eq.${encodeURIComponent(claim)}`, {
        method: "PATCH",
        headers: {
          apikey: claimContext.serviceKey,
          Authorization: `Bearer ${claimContext.serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ welcome_email_sent_at: null }),
      }).catch(() => {});
    }
    console.error("welcome-email failed", error);
    return json(res, 502, {
      ok: false,
      code: "WELCOME_EMAIL_DELIVERY_FAILED",
      message: "가입 완료 메일 발송에 실패했습니다.",
    });
  }
};

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}
