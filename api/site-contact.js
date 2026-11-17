const { createHmac } = require('node:crypto');
const { json, env, requireEnv, supabaseRequest } = require('./_server');

function invalid(message, statusCode = 400) { return Object.assign(new Error(message), { statusCode }); }
function field(value, max = 150) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw invalid('입력한 내용의 길이를 확인해주세요.');
  return value.trim();
}
function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('잘못된 접수 요청입니다.');
  if (body.website) throw invalid('접수 요청을 확인해주세요.');
  if (body.consent !== true) throw invalid('문의 접수를 위한 개인정보 안내에 동의해주세요.');
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.requestId || '')) throw invalid('다시 접수해주세요.');
  const source = field(body.source);
  if (!['partner', 'feedback'].includes(source)) throw invalid('문의 유형을 확인해주세요.');
  const message = field(body.message, 5000);
  if (message.length < 5) throw invalid('문의 내용을 5자 이상 입력해주세요.');
  const details = { contact: field(body.contact) };
  if (details.contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.contact)
    && !/^\+?[\d\s()-]{8,25}$/.test(details.contact)) throw invalid('이메일 또는 전화번호를 확인해주세요.');
  if (source === 'partner') {
    Object.assign(details, { contactName: field(body.contactName, 80), businessName: field(body.businessName, 100), businessType: field(body.businessType) });
    if (!details.contact || !details.contactName || !details.businessName
      || !['숙소', '식당·식자재', '레크리에이션·체험', '교통', '기타'].includes(details.businessType)) throw invalid('업장 정보와 담당자 연락처를 입력해주세요.');
  } else {
    details.topic = field(body.topic);
    if (!['불편한 점', '추가되었으면 하는 기능', '오류 신고', '기타 의견'].includes(details.topic)) throw invalid('건의 유형을 선택해주세요.');
  }
  return { source, message, details, requestId: body.requestId };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: '허용되지 않은 요청입니다.' }); }
  try {
    const origin = req.headers.origin;
    let sameSite = false;
    try { const url = new URL(origin); sameSite = ['motf.co.kr', 'www.motf.co.kr', String(req.headers.host || '')].includes(url.host) && ['http:', 'https:'].includes(url.protocol); } catch {}
    if (!sameSite) throw invalid('사이트에서 다시 접수해주세요.', 403);
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) throw invalid('JSON 요청이 필요합니다.', 415);
    if (Number(req.headers['content-length'] || 0) > 24000 || Buffer.byteLength(JSON.stringify(req.body ?? '')) > 24000) throw invalid('문의 내용이 너무 깁니다.', 413);
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { throw invalid('입력 내용을 확인해주세요.'); } }
    const input = validate(body);
    requireEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    if (!ip) throw invalid('접수 연결을 확인할 수 없습니다. 다시 시도해주세요.', 503);
    const hash = value => createHmac('sha256', env('SUPABASE_SERVICE_ROLE_KEY')).update(value).digest('hex');
    const id = await supabaseRequest('/rest/v1/rpc/submit_site_contact', {
      method: 'POST', body: JSON.stringify({ request_key: input.requestId, request_ip_hash: hash(`site-contact-ip:${ip}`),
        request_digest: hash(JSON.stringify(input)), form_source: input.source, form_details: input.details, message_body: input.message }),
    });
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) throw invalid('접수 결과를 확인하지 못했습니다. 다시 시도해주세요.', 503);
    return json(res, 201, { id });
  } catch (error) {
    if (error.details?.code === 'P0429') return json(res, 429, { error: '접수 요청이 많습니다. 15분 후 다시 시도해주세요.' });
    const status = error.details ? 503 : (error.statusCode || 503);
    return json(res, status, { error: status >= 500 ? '접수하지 못했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도해주세요.' : error.message });
  }
};
