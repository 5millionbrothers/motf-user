const { json } = require("./_utils");
const { allowCors, readBody, sha256 } = require("./_identity");
const { supabaseRequest } = require("./_server");

module.exports = async function handler(req, res) {
  if (allowCors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "POST only." });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const body = await readBody(req);
    const token = String(body.identityToken || ''), purpose = String(body.purpose || 'signup');
    if (!token || token.length > 256 || !['signup', 'owner_signup', 'password_reset', 'profile_upgrade', 'adult_purchase'].includes(purpose)) {
      return json(res, 400, { ok: false, message: '본인인증 요청 정보를 확인해주세요.' });
    }
    const rows = await supabaseRequest(`/rest/v1/identity_verification_sessions?state_hash=eq.${sha256(token)}&purpose=eq.${encodeURIComponent(purpose)}&select=status,expires_at,verified_name,verified_phone,verified_birth_date,is_adult&limit=1`);
    const session = rows?.[0];
    if (!session || new Date(session.expires_at).getTime() <= Date.now() || ['failed', 'expired', 'consumed'].includes(session.status)) {
      return json(res, 401, { ok: false, verified: false, message: '본인인증이 만료되었거나 완료되지 않았습니다. 다시 인증해주세요.' });
    }
    if (session.status !== 'verified') return json(res, 200, { ok: true, verified: false, status: 'pending' });
    return json(res, 200, {
      ok: true,
      verified: true,
      person: {
        name: session.verified_name,
        phone: session.verified_phone,
        birthDate: session.verified_birth_date,
        isAdult: session.is_adult,
      },
    });
  } catch (error) {
    return json(res, error.statusCode || 401, { ok: false, verified: false, message: error.message });
  }
};
