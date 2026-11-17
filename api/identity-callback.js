const { supabaseRequest } = require("./_server");
const { readBody, identityHash, normalizePhone, normalizeBirthDate, isAdult, kcpResult, safeReturnUrl } = require("./_identity");

function callbackHtml(payload) {
  const serialized = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>본인인증 결과 | 모티프</title></head><body><p>${payload.ok ? '본인인증이 완료되었습니다. 가입 화면에서 계속 진행해주세요.' : '본인인증을 완료하지 못했습니다. 가입 화면에서 다시 시도해주세요.'}</p><script>const data=${serialized};const target=new URL(data.returnUrl).origin;if(window.opener){window.opener.postMessage(data,target);setTimeout(()=>window.close(),150);}else{document.body.append('이 창을 닫고 원래 가입 화면으로 돌아가주세요.');}</script></body></html>`;
}

function decodeKcpIdentity(value) {
  try { return decodeURIComponent(String(value || "")); } catch { return String(value || ""); }
}

module.exports = async function handler(req, res) {
  let callbackReturnUrl = "https://motf.co.kr/";
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!['GET', 'POST'].includes(req.method)) throw new Error('지원하지 않는 인증 응답 방식입니다.');
    const body = req.method === 'GET' ? (req.query || Object.fromEntries(new URL(req.url, 'https://motf.co.kr').searchParams)) : await readBody(req);
    const regCertKey = String(body.reg_cert_key || body.regCertKey || "");
    if (!regCertKey) throw new Error("KCP 거래등록키가 없습니다.");
    const rows = await supabaseRequest(`/rest/v1/identity_verification_sessions?provider_transaction_id=eq.${encodeURIComponent(regCertKey)}&select=*&limit=1`);
    const session = rows?.[0];
    if (!session) throw new Error("본인인증 세션을 찾지 못했습니다.");
    callbackReturnUrl = safeReturnUrl(session.request_context?.return_url);
    if (new Date(session.expires_at).getTime() <= Date.now() || !['pending', 'verified'].includes(session.status)) throw new Error('본인인증이 만료되었습니다. 다시 인증해주세요.');
    if (body.ordr_idxx && body.ordr_idxx !== session.provider_response?.order_id) throw new Error('본인인증 거래 정보가 일치하지 않습니다.');
    if (String(body.res_cd || "") !== "0000") throw new Error(String(body.res_msg || "본인인증이 취소되었습니다."));

    // KCP result keys are single-use; a repeated callback must not query them again.
    if (session.status === 'verified') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(callbackHtml({ type: 'motf:kcp-identity', ok: true, returnUrl: callbackReturnUrl }));
    }

    const verified = await kcpResult({
      regCertKey,
      orderId: session.provider_response?.order_id,
    });
    const birthDate = normalizeBirthDate(verified.birthDate || verified.birth_day);
    const phone = normalizePhone(verified.phone || verified.phone_no);
    const name = String(verified.name || verified.user_name || "").trim();
    const ci = String(verified.ci || verified.CI || decodeKcpIdentity(verified.CI_URL));
    const di = String(verified.di || verified.DI || decodeKcpIdentity(verified.DI_URL));
    if (!birthDate || !phone || !name || !ci) throw new Error("KCP 인증 결과의 필수 정보가 누락되었습니다.");

    const saved = await supabaseRequest(`/rest/v1/identity_verification_sessions?id=eq.${session.id}&status=eq.pending`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status: "verified",
        verified_name: name,
        verified_phone: phone,
        verified_birth_date: birthDate,
        verified_ci_hash: identityHash(ci),
        verified_di_hash: di ? identityHash(di) : null,
        is_adult: isAdult(birthDate),
        provider_response: { per_cert_no: verified.perCertNo || verified.per_cert_no || null },
        verified_at: new Date().toISOString(),
      }),
    });
    if (!saved?.some(row => row.status === 'verified')) throw new Error('본인인증 결과를 저장하지 못했습니다. 가입 화면에서 다시 시도해주세요.');
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(callbackHtml({ type: "motf:kcp-identity", ok: true, returnUrl: callbackReturnUrl }));
  } catch (error) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(callbackHtml({ type: "motf:kcp-identity", ok: false, message: error.message || "본인인증에 실패했습니다.", returnUrl: callbackReturnUrl }));
  }
};
