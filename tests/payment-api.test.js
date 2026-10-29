const test = require("node:test");
const assert = require("node:assert/strict");
const pg = require("../api/_nicepay");
const rt = require("../api/_nicepay-runtime");
const { refundPercent } = require("../api/refund-payment");
const start = require("../api/nicepay-start");
const callback = require("../api/nicepay-return");
const webhook = require("../api/nicepay-webhook");
const status = require("../api/payment-status");
const refund = require("../api/refund-payment");
const reconcile = require("../api/reconcile-payment");
const paymentConfig = require("../api/payment-config");
const user = "11111111-1111-4111-8111-111111111111";
const intentId = "22222222-2222-4222-8222-222222222222";
const txId = "33333333-3333-4333-8333-333333333333";
const mid = "nictest00m", key = "test-only-key", tid = mid + "1".repeat(20);
function fixture(options = {}) {
  const calls = []; const ops = new Map(); let session; let finalizeCount = 0;
  const intent = { id: intentId, order_id: "order-test", customer_id: user, kind: "stay", amount: 9000, original_amount: 10000, points_used: 1000, status: "prepared", provider: "toss", expires_at: "2099-01-01", draft: { customer_name: "홍길동", contact_phone: "01012345678" }, ...options.intent };
  const response = (data, code = 200) => new Response(JSON.stringify(data), { status: code, headers: { "Content-Type": "application/json" } });
  const fetcher = async (url, request = {}) => {
    const target = new URL(url); calls.push(target.pathname);
    if (target.hostname === "db.test") {
      const payload = request.body ? JSON.parse(request.body) : {};
      if (target.pathname === "/auth/v1/user") return response({ id: options.actor || user });
      if (target.pathname.endsWith("/profiles")) return response([{ id: user, role: options.role || "customer", status: "approved" }]);
      if (target.pathname.endsWith("/is_organization_member")) return response(options.organizationMember === true);
      if (target.pathname.endsWith("/payment_intents")) { if (request.method === "PATCH") Object.assign(intent, payload); return response([intent]); }
      if (target.pathname.endsWith("/nicepay_checkout_sessions")) return response(session ? [session] : []);
      if (target.pathname.endsWith("/reservations")) return response([{ id: txId, customer_id: user, status: "confirmed", event_date: "2099-01-01", business_id: "business" }]);
      if (target.pathname.endsWith("/bind_nicepay_checkout")) { session = { nonce_hash: payload.target_nonce_hash, expires_at: "2099-01-01" }; Object.assign(intent, { provider: "nicepay", provider_merchant_id: payload.target_mid, payment_method: payload.target_method }); return response(null); }
      if (target.pathname.endsWith("/claim_payment_provider_operation")) {
        let op = ops.get(payload.target_operation_key);
        const claimed = !op;
        if (!op) { op = { operation_id: "op" + ops.size, operation_state: "submitting", kind: payload.target_operation_kind }; ops.set(payload.target_operation_key, op); }
        return response([{ ...op, claimed }]);
      }
      if (target.pathname.endsWith("/payment_provider_operations")) {
        if (request.method === "PATCH") { const op = [...ops.values()].find(item => "eq." + item.operation_id === target.searchParams.get("id")); if (op && payload.state) op.operation_state = payload.state; return response(null); }
        const kind = String(target.searchParams.get("operation_kind") || "eq.approve").slice(3);
        return response([...ops.values()].filter(op => op.kind === kind).map(op => ({ id: op.operation_id, state: op.operation_state })));
      }
      if (target.pathname.endsWith("/finalize_provider_payment_intent")) {
        if (options.dbFailure) return response({ message: "temporary fixture outage" }, 500);
        finalizeCount++; Object.assign(intent, { status: "confirmed", transaction_id: txId }); return response([{ transaction_id: txId, kind: "stay" }]);
      }
      if (target.pathname.endsWith("/record_provider_refund")) { intent.refund_status = payload.refund_state; if (payload.refund_state === "refunded") intent.status = "cancelled"; return response(null); }
      if (target.pathname.endsWith("/record_nicepay_virtual_account")) { intent.status = "virtual_account_issued"; return response(null); }
      if (target.pathname.endsWith("/release_expired_checkout_intents")) return response(0);
      throw new Error("Unhandled fixture path " + target.pathname);
    }
    if (target.hostname.endsWith("nicepay.co.kr")) {
      const fields = Object.fromEntries(new URLSearchParams(request.body));
      if (target.pathname.endsWith("/pay_process.jsp")) {
        if (options.timeout) throw new Error("fixture transport timeout");
        const method = intent.payment_method || "CARD";
        const data = { MID: mid, Moid: intent.order_id, TID: tid, Amt: "000000009000", PayMethod: method, ResultCode: pg.APPROVAL_CODES[method], ...(method === "VBANK" ? { VbankBankCode: "020", VbankBankName: "우리은행", VbankNum: "123456789", VbankExpDate: pg.kstTimestamp(new Date(Date.now()+86400000)).slice(0,8), VbankExpTime: "235959" } : {}) };
        data.Signature = pg.sha256(tid + mid + data.Amt + key);
        return response(data);
      }
      if (target.pathname.endsWith("/cancel_process.jsp")) {
        const data = { MID: mid, Moid: fields.Moid, TID: tid, CancelAmt: fields.CancelAmt || fields.Amt, ResultCode: "2001" };
        data.Signature = pg.sha256(tid + mid + data.CancelAmt + key); return response(data);
      }
      if (target.pathname.endsWith("/trans_status.jsp")) return response({ ResultCode: "0000", TID: tid, Status: options.queryStatus || "0" });
    }
    if (target.hostname === "api.tosspayments.com") return response({ orderId: intent.order_id, totalAmount: intent.amount, status: request.method === "POST" ? "CANCELED" : "DONE" });
    throw new Error("Unexpected network destination " + target.hostname);
  };
  return { calls, intent, fetcher, get finalizeCount() { return finalizeCount; } };
}
async function invoke(handler, body, authorization = "Bearer test-token", method = "POST") {
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(text) { this.text = text; } };
  await handler({ method, headers: { authorization, "content-type": "application/json" }, body }, res);
  return { code: res.statusCode, headers: res.headers, text: res.text, data: res.headers["Content-Type"]?.includes("json") ? JSON.parse(res.text) : null };
}
async function using(options, run) {
  const previousFetch = global.fetch;
  const values = { PAYMENT_PROVIDER: "nicepay", SUPABASE_URL: "https://db.test", SUPABASE_PUBLISHABLE_KEY: "test-pub", SUPABASE_SERVICE_ROLE_KEY: "test-service", NICEPAY_MID: mid, NICEPAY_MERCHANT_KEY: key, NICEPAY_STAY_MID: "", NICEPAY_STAY_MERCHANT_KEY: "", NICEPAY_MARKET_MID: "", NICEPAY_MARKET_MERCHANT_KEY: "", NICEPAY_METHODS: options.methods || "", NICEPAY_STAY_METHODS: "", NICEPAY_MARKET_METHODS: "", NICEPAY_MARKET_NON_ESCROW_APPROVED: options.marketCashApproved ? "true" : "false", NICEPAY_PARTIAL_CANCEL_ENABLED: "true", TOSS_STAY_SECRET_KEY: "fixture-only-toss-key" };
  const before = Object.fromEntries(Object.keys(values).map(name => [name, process.env[name]]));
  Object.assign(process.env, values); const f = fixture(options); global.fetch = f.fetcher;
  try { await run(f); } finally { global.fetch = previousFetch; for (const name of Object.keys(values)) { if (before[name] == null) delete process.env[name]; else process.env[name] = before[name]; } }
}
async function authentication(method = "CARD") {
  const result = await invoke(start, { orderId: "order-test", method });
  assert.equal(result.code, 200);
  const data = { MID: mid, Moid: "order-test", Amt: "9000", TxTid: tid, PayMethod: "CARD", ReqReserved: result.data.fields.ReqReserved, AuthToken: "test-token", AuthResultCode: "0000", NextAppURL: "https://dc1-api.nicepay.co.kr/webapi/pay_process.jsp", NetCancelURL: "https://dc1-api.nicepay.co.kr/webapi/cancel_process.jsp" };
  data.PayMethod = method;
  data.Signature = pg.sha256(data.AuthToken + mid + data.Amt + key); return data;
}
test("API: checkout requires login and does not expose MerchantKey", async () => using({}, async f => {
  assert.equal((await invoke(start, { orderId: "order-test", method: "CARD" }, "")).code, 401);
  const result = await invoke(start, { orderId: "order-test", method: "CARD" });
  assert.equal(result.code, 200); assert.equal(JSON.stringify(result.data).includes(key), false);
  assert.equal(result.data.fields.Moid, "order-test"); assert.equal(f.intent.provider, "nicepay");
}));
test("API: another account cannot start the order", async () => using({ actor: "another-user" }, async () => assert.equal((await invoke(start, { orderId: "order-test", method: "CARD" })).code, 404)));
test("API: VBANK is not enabled by default", async () => using({}, async () => assert.equal((await invoke(start, { orderId: "order-test", method: "VBANK" })).code, 409)));
test("API: accommodation bank transfer uses the common MID by default", async () => using({}, async () => {
  const result = await invoke(start, { orderId: "order-test", method: "BANK" });
  assert.equal(result.code, 200); assert.equal(result.data.fields.MID, mid); assert.equal(result.data.fields.PayMethod, "BANK");
}));
test("API: market card payments use the same common MID", async () => using({ intent: { kind: "market" } }, async () => {
  const result = await invoke(start, { orderId: "order-test", method: "CARD" });
  assert.equal(result.code, 200); assert.equal(result.data.fields.MID, mid);
}));
test("API: market bank transfer is available by default with the common MID", async () => using({ intent: { kind: "market" } }, async f => {
  const result = await invoke(start, { orderId: "order-test", method: "BANK" });
  assert.equal(result.code, 200); assert.equal(result.data.fields.MID, mid);
  assert.equal(result.data.fields.PayMethod, "BANK"); assert.equal(result.data.fields.TransType, "0");
  assert.equal(f.calls.some(x => x.endsWith("/bind_nicepay_checkout")), true);
}));
test("API: public configuration advertises available methods and never the shared key", async () => using({}, async () => {
  const result = await invoke(paymentConfig, null, "", "GET");
  assert.deepEqual(result.data.nicepayConfigured, { stay: true, market: true });
  assert.deepEqual(result.data.nicepayMethods, { stay: ["CARD", "BANK"], market: ["CARD", "BANK"] });
  assert.equal(result.data.nicepayCashReviewRequired, undefined);
  assert.equal(JSON.stringify(result.data).includes(key), false);
}));
test("API: explicitly disabled payment methods are still rejected for both businesses", async () => using({ methods: "CARD" }, async f => {
  const result = await invoke(start, { orderId: "order-test", method: "BANK" });
  assert.equal(result.data.code, "METHOD_DISABLED");
  f.intent.kind = "market";
  assert.equal((await invoke(start, { orderId: "order-test", method: "BANK" })).data.code, "METHOD_DISABLED");
  assert.equal(f.calls.some(x => x.endsWith("/bind_nicepay_checkout")), false);
}));
test("API: callback works without user JWT, once only", async () => using({}, async f => {
  const auth = await authentication();
  assert.equal((await invoke(callback, auth, "")).code, 303);
  assert.equal(f.intent.status, "confirmed");
  await invoke(callback, auth, "");
  assert.equal(f.finalizeCount, 1); assert.equal(f.calls.filter(x => x.endsWith("/pay_process.jsp")).length, 1);
}));
test("API: nonce or amount tampering never sends approval", async () => using({}, async f => {
  const auth = await authentication();
  await invoke(callback, { ...auth, ReqReserved: "wrong" }, "");
  await invoke(callback, { ...auth, Amt: "1" }, "");
  assert.equal(f.calls.some(x => x.endsWith("/pay_process.jsp")), false);
}));
test("API: approval timeout makes one network cancellation, never repeats approval", async () => using({ timeout: true }, async f => {
  const auth = await authentication(); await invoke(callback, auth, "");
  assert.equal(f.intent.status, "cancelled");
  assert.equal(f.calls.filter(x => x.endsWith("/pay_process.jsp")).length, 1);
  assert.equal(f.calls.filter(x => x.endsWith("/cancel_process.jsp")).length, 1);
}));
test("API: DB outage after approval keeps payment recoverable and never charges twice", async () => using({ dbFailure: true }, async f => {
  const auth = await authentication(); const result = await invoke(callback, auth, "");
  assert.match(result.headers.Location, /RECONCILIATION_REQUIRED/);
  assert.equal(f.intent.status, "in_progress");
  await invoke(callback, auth, "");
  assert.equal(f.calls.filter(x => x.endsWith("/pay_process.jsp")).length, 1);
}));
test("API: forged webhook does not finalize a booking", async () => using({}, async f => {
  await authentication(); const result = await invoke(webhook, { MOID: "order-test", MID: mid, TID: "forged", Amt: 9000 }, "");
  assert.equal(result.code, 503); assert.equal(f.finalizeCount, 0);
}));
test("API: payment status cannot be read anonymously", async () => using({}, async () => assert.equal((await invoke(status, { orderId: "order-test" }, "")).code, 401)));
test("API: another personal account cannot read payment status", async () => using({ actor: "another-user" }, async () => assert.equal((await invoke(status, { orderId: "order-test" })).code, 404)));
test("API: current organization members may read but not restart another member's checkout", async () => using({ actor: "another-user", organizationMember: true, intent: { organization_id: "organization" } }, async () => {
  assert.equal((await invoke(status, { orderId: "order-test" })).code, 200);
  assert.equal((await invoke(start, { orderId: "order-test", method: "CARD" })).code, 404);
}));
test("API: former organization members cannot read payment status", async () => using({ organizationMember: false, intent: { organization_id: "organization" } }, async () => assert.equal((await invoke(status, { orderId: "order-test" })).code, 403)));
test("API: refund performs one NICE cancellation; second request cannot double refund", async () => using({ intent: { provider: "nicepay", provider_merchant_id: mid, status: "confirmed", payment_key: tid, payment_method: "CARD", transaction_id: txId } }, async f => {
  const request = { kind: "stay", id: txId, action: "user_cancel", reason: "취소" };
  assert.equal((await invoke(refund, request)).data.refundStatus, "refunded");
  assert.equal((await invoke(refund, request)).code, 409);
  assert.equal(f.calls.filter(x => x.endsWith("/cancel_process.jsp")).length, 1);
}));
test("Korean form text is encoded as EUC-KR rather than UTF-8", () => assert.equal(rt.formEncode({ CancelMsg: "취소" }), "CancelMsg=%C3%EB%BC%D2"));
test("API: account issuance waits for deposit, verified webhook creates the booking", async () => using({ methods: "CARD,VBANK" }, async f => {
  const auth = await authentication("VBANK"); await invoke(callback, auth, "");
  assert.equal(f.intent.status, "virtual_account_issued"); assert.equal(f.finalizeCount, 0);
  assert.equal((await invoke(webhook, { MOID: "order-test", MID: mid, TID: tid, Amt: 9000 }, "")).code, 200);
  assert.equal(f.intent.status, "confirmed"); assert.equal(f.finalizeCount, 1);
}));
test("API: a recorded partial refund notification never recreates a booking", async () => using({}, async f => {
  const auth = await authentication(); await invoke(callback, auth, "");
  Object.assign(f.intent, { status: "partial_cancelled", refund_status: "refunded" });
  assert.equal((await invoke(webhook, { MOID: "order-test", MID: mid, TID: tid, Amt: 9000 }, "")).code, 200);
  assert.equal(f.finalizeCount, 1);
}));
test("API: an external cancellation cannot invent a refund amount or restore points", async () => using({ queryStatus: "1" }, async f => {
  const auth = await authentication(); await invoke(callback, auth, "");
  assert.equal((await invoke(webhook, { MOID: "order-test", MID: mid, TID: tid, Amt: 9000 }, "")).code, 503);
  assert.equal(f.intent.status, "confirmed");
  assert.equal(f.calls.some(x => x.endsWith('/record_provider_refund')), false);
}));
test("API: admin reconciliation does not recreate a partially refunded booking", async () => using({ role: "admin" }, async f => {
  const auth = await authentication(); await invoke(callback, auth, "");
  Object.assign(f.intent, { status: "partial_cancelled", refund_status: "refunded" });
  assert.equal((await invoke(reconcile, { orderId: "order-test" })).code, 200);
  assert.equal(f.intent.status, "partial_cancelled"); assert.equal(f.finalizeCount, 1);
}));
test("API: historical Toss refund stays on Toss", async () => using({ intent: { provider: "toss", status: "confirmed", payment_key: "old-toss-key", transaction_id: txId } }, async f => {
  const result = await invoke(refund, { kind: "stay", id: txId, action: "user_cancel", reason: "취소" });
  assert.equal(result.data.refundStatus, "refunded");
  assert.equal(f.calls.some(x => x.endsWith("/cancel_process.jsp")), false);
  assert.equal(f.calls.filter(x => x.endsWith("/old-toss-key/cancel")).length, 1);
}));
test("return URL preserves the approved www session origin, never an arbitrary host", () => {
  assert.equal(rt.returnOrigin({ headers: { origin: "https://www.motf.co.kr" } }), "https://www.motf.co.kr");
  assert.equal(rt.returnOrigin({ headers: { origin: "https://evil.example" } }), "https://motf.co.kr");
});
test("refund date boundaries use Korea time", () => {
  const transaction = { status: "confirmed", event_date: "2026-11-12" };
  assert.equal(refundPercent(transaction, "stay", new Date("2026-10-28T15:30:00Z")), 100);
  transaction.event_date = "2026-11-05"; assert.equal(refundPercent(transaction, "stay", new Date("2026-10-28T15:30:00Z")), 50);
});
