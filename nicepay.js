(() => {
  let active = false;
  let sdkPromise;
  const labels = { CARD: "카드·간편결제", BANK: "계좌이체", VBANK: "가상계좌", CELLPHONE: "휴대폰 결제" };
  const button = () => document.querySelector("[data-toss-payment]");
  function reset() {
    active = false;
    if (button()) { button().disabled = false; button().textContent = "결제하기"; }
  }
  async function server(path, payload) {
    for (let attempt = 0; !window.motfSupabase && attempt < 40; attempt++) await new Promise(resolve => window.setTimeout(resolve, 100));
    if (!window.motfSupabase) throw new Error("로그인 설정을 불러오지 못했습니다. 다시 로그인해 확인해주세요.");
    const { data } = await window.motfSupabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("다시 로그인한 뒤 결제 내역을 확인해주세요.");
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) throw new Error(result?.message || "결제 서버에 연결하지 못했습니다.");
    return result;
  }
  function sdk() {
    if (window.goPay) return Promise.resolve();
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = window.setTimeout(() => { script.remove(); sdkPromise = null; reject(new Error("결제창을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.")); }, 12000);
      script.src = "https://pg-web.nicepay.co.kr/v3/common/js/nicepay-pgweb.js"; script.charset = "euc-kr";
      script.onload = () => { window.clearTimeout(timer); if (window.goPay) resolve(); else { sdkPromise = null; reject(new Error("결제창 초기화에 실패했습니다.")); } };
      script.onerror = () => { window.clearTimeout(timer); script.remove(); sdkPromise = null; reject(new Error("나이스 결제창을 불러오지 못했습니다.")); };
      document.head.append(script);
    });
    return sdkPromise;
  }
  window.motfRenderNicepay = payment => {
    const kind = payment.type === "market" ? "market" : "stay";
    const config = window.motfPaymentConfig || {};
    const list = (config.nicepayMethods?.[kind] || ["CARD"]).filter(method => labels[method]);
    const panel = document.querySelector("#tossPaymentMethods");
    if (panel) panel.innerHTML = `<fieldset class="nicepay-methods"><legend>결제수단</legend>${list.map((method, index) => `<label><input type="radio" name="nicepayMethod" value="${method}" ${index === 0 ? "checked" : ""}><span>${labels[method]}</span></label>`).join("")}</fieldset>`;
    if (button()) { button().textContent = "결제하기"; button().disabled = !config.nicepayConfigured?.[kind] || !list.length; }
    const status = document.querySelector("#tossWidgetStatus");
    if (status) status.textContent = config.nicepayConfigured?.[kind] ? "나이스페이 안전결제창으로 연결됩니다." : "결제 설정을 준비 중입니다. 운영팀에 문의해주세요.";
  };
  window.motfRequestNicepay = async payment => {
    if (active || !payment) return;
    active = true;
    if (button()) { button().disabled = true; button().textContent = "안전결제창 여는 중"; }
    try {
      await sdk();
      const method = document.querySelector('input[name="nicepayMethod"]:checked')?.value;
      const prepared = await server("/api/nicepay-start", { orderId: payment.orderId, method });
      document.querySelector("#motfNicepayForm")?.remove();
      const form = document.createElement("form");
      form.id = "motfNicepayForm"; form.name = "motfNicepayForm"; form.method = "POST";
      form.action = "/api/nicepay-return"; form.acceptCharset = "euc-kr";
      Object.entries(prepared.fields).forEach(([name, value]) => { const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = String(value); form.append(input); });
      document.body.append(form);
      window.nicepaySubmit = () => HTMLFormElement.prototype.submit.call(form);
      window.nicepayClose = () => { form.remove(); reset(); window.motfToast?.("결제창을 닫았습니다."); };
      window.goPay(form);
    } catch (error) { reset(); window.motfToast?.(error.message || "결제를 시작하지 못했습니다."); }
  };
  window.motfReadPaymentStatus = orderId => server("/api/payment-status", { orderId });
})();
