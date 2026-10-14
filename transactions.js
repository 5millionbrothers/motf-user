(function connectUserTransactions() {
  const client = window.motfSupabase;
  const MAX_SINGLE_PAYMENT_AMOUNT = 10_000_000;
  const PAYMENT_LIMIT_MESSAGE = "단건 결제는 10,000,000원까지 가능합니다. 숙박 일정이나 주문 수량을 조정해주세요.";
  if (!client) {
    console.error("예약 연결에 필요한 로그인 설정을 불러오지 못했습니다.");
    return;
  }
  const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
  const statusText = {
    pending: "결제 완료·승인 대기",
    confirmed: "확정",
    rejected: "거절",
    cancelled: "취소",
    completed: "이용 완료",
  };
  const refundText = {
    required: "거절·환불 예정",
    processing: "환불 처리 중",
    refunded: "환불 완료",
    failed: "환불 확인 필요",
  };
  function displayStatus(item) {
    if (item.refund_status && item.refund_status !== "none") return refundText[item.refund_status] || statusText[item.status] || item.status;
    return statusText[item.status] || item.status;
  }
  function isFutureDate(value) {
    if (!value) return true;
    const time = new Date(value).getTime();
    return Number.isNaN(time) || time > Date.now();
  }
  function pendingAccountExpiresAt(item = {}) {
    const account = item.virtual_account || item.virtualAccount || {};
    return item.expires_at || account.dueDate || account.due_date || account.expiredAt || account.expired_at || account.expiresAt || account.expires_at || account.expiry?.dueDate || account.expiry?.due_date || account.accountExpiry?.dueDate || account.accountExpiry?.due_date || "";
  }
  function bankLabel(value = "") {
    const code = String(value || "").trim();
    const upper = code.toUpperCase();
    const labels = {
      WOORI: "우리은행",
      IBK: "IBK기업은행",
      KB: "KB국민은행",
      KOOKMIN: "KB국민은행",
      SHINHAN: "신한은행",
      HANA: "하나은행",
      NH: "NH농협은행",
      NONGHYUP: "NH농협은행",
      KAKAOBANK: "카카오뱅크",
      K_BANK: "케이뱅크",
      TOSS_BANK: "토스뱅크",
      SC: "SC제일은행",
      CITI: "씨티은행",
      DAEGU: "대구은행",
      BUSAN: "부산은행",
      GWANGJU: "광주은행",
      JEONBUK: "전북은행",
      KYONGNAM: "경남은행",
      SAEMAUL: "새마을금고",
      SHINHYUP: "신협",
      SUHYUP: "수협은행",
      POST: "우체국",
    };
    return labels[upper] || code.replace(/_/g, " ");
  }
  function accountLabel(account = {}) {
    const bank = bankLabel(account.bankName || account.bank || account.bankCode);
    const number = String(account.accountNumber || account.account_number || "").replace(/\s+/g, "");
    const holder = account.holderName || account.accountHolder || account.customerName || "";
    return [bank, number].filter(Boolean).join(" ") + (holder ? ` (예금주 ${holder})` : "");
  }

  const benefitPreviews = { stay: null, market: null };
  const benefitFields = {
    stay: { points: "#bookingPoints", coupon: "#bookingCouponCode", result: "#stayBenefitPreview" },
    market: { points: "#marketPoints", coupon: "#marketCouponCode", result: "#marketBenefitPreview" },
  };

  function benefitInput(kind) {
    const fields = benefitFields[kind];
    const pointsInput = document.querySelector(fields.points);
    const requested = Number(pointsInput?.value || 0);
    const balance = Math.max(0, Number(window.motfPointBalance || 0));
    const points = Number.isFinite(requested) ? Math.max(0, Math.min(requested, balance)) : 0;
    const adjusted = Boolean(pointsInput && Number(pointsInput.value || 0) !== points);
    if (adjusted) pointsInput.value = String(points);
    return {
      points,
      coupon: document.querySelector(fields.coupon)?.value.trim().toUpperCase() || "",
      adjusted,
      requested,
      balance,
    };
  }

  function publishBenefitPreview(kind, preview = null) {
    window.motfApplyCheckoutBenefitPreview?.(kind, preview);
  }

  function syncPointControls(balanceValue = 0) {
    const balance = Math.max(0, Number(balanceValue || 0));
    window.motfPointBalance = balance;
    document.querySelectorAll("[data-point-balance]").forEach((node) => { node.textContent = `${balance.toLocaleString("ko-KR")}P`; });
    Object.entries(benefitFields).forEach(([kind, fields]) => {
      const input = document.querySelector(fields.points);
      const apply = document.querySelector(`[data-point-apply="${kind}"]`);
      const all = document.querySelector(`[data-use-all-points="${kind}"]`);
      if (input) {
        input.max = String(balance);
        input.disabled = balance <= 0;
        if (balance <= 0 || Number(input.value || 0) > balance) input.value = balance <= 0 ? "0" : String(balance);
        input.placeholder = balance > 0 ? "사용할 포인트" : "사용 가능 포인트 없음";
      }
      if (apply) apply.disabled = balance <= 0;
      if (all) all.disabled = balance <= 0;
      const result = document.querySelector(fields.result);
      if (balance <= 0 && result && !document.querySelector(fields.coupon)?.value.trim()) {
        result.className = "checkout-benefit-result unavailable";
        result.textContent = "사용 가능한 포인트가 없습니다. 할인코드는 별도로 적용할 수 있어요.";
      }
    });
  }

  function benefitSignature(kind, context, input = benefitInput(kind)) {
    return [window.motfGetOrganizationId?.() || "personal", kind, context?.businessId || "", Number(context?.originalAmount || 0), input.points, input.coupon].join(":");
  }

  function invalidateBenefitPreview(kind) {
    benefitPreviews[kind] = null;
    publishBenefitPreview(kind, null);
    const result = document.querySelector(benefitFields[kind].result);
    if (result) {
      result.className = "checkout-benefit-result";
      result.textContent = "변경한 혜택을 최종 금액에 반영하려면 적용을 눌러주세요.";
    }
  }

  async function previewBenefits(kind, button = null) {
    const verified = await window.motfEnsureIdentityVerified?.();
    if (verified === false) throw new Error("로그인과 예약·주문에 필요한 기본정보를 확인해주세요.");
    const context = window.motfGetCheckoutPreviewContext?.(kind);
    if (!context?.originalAmount || !isUuid(context.businessId)) throw new Error("결제할 상품 정보를 먼저 확인해주세요.");
    const input = benefitInput(kind);
    if (button?.dataset.pointApply && Number(window.motfPointBalance || 0) <= 0) throw new Error("사용 가능한 포인트가 없습니다.");
    const originalText = button?.textContent;
    if (button) { button.disabled = true; button.textContent = "확인 중"; }
    try {
      const organizationId = window.motfGetOrganizationId?.();
      const { data, error } = await client.rpc(organizationId ? "preview_organization_checkout_benefits" : "preview_checkout_benefits", {
        ...(organizationId ? { target_organization_id: organizationId } : {}),
        target_original_amount: Number(context.originalAmount),
        target_transaction_kind: kind,
        target_business_id: context.businessId,
        requested_points: input.points,
        requested_coupon_code: input.coupon || null,
      });
      if (error) throw error;
      if ((organizationId || null) !== (window.motfGetOrganizationId?.() || null)) throw new Error("소속이 바뀌었습니다. 혜택을 다시 확인해주세요.");
      const preview = Array.isArray(data) ? data[0] : data;
      if (!preview) throw new Error("혜택 적용 결과를 확인하지 못했습니다.");
      benefitPreviews[kind] = { ...preview, signature: benefitSignature(kind, context, input) };
      publishBenefitPreview(kind, benefitPreviews[kind]);
      const result = document.querySelector(benefitFields[kind].result);
      if (result) {
        const coupon = Number(preview.applied_coupon_discount || 0);
        const points = Number(preview.applied_points || 0);
        result.className = "checkout-benefit-result applied";
        result.innerHTML = `${input.adjusted ? `<p class="benefit-adjustment-note">보유 포인트에 맞춰 ${input.points.toLocaleString("ko-KR")}P로 조정했습니다.</p>` : ""}<div><span>상품 금액</span><b>${Number(preview.original_amount).toLocaleString("ko-KR")}원</b></div>${coupon ? `<div><span>${preview.coupon_name || "할인코드"}</span><b>-${coupon.toLocaleString("ko-KR")}원</b></div>` : ""}${points ? `<div><span>포인트 사용</span><b>-${points.toLocaleString("ko-KR")}P</b></div>` : ""}<div class="final"><span>최종 결제금액</span><strong>${Number(preview.payable_amount).toLocaleString("ko-KR")}원</strong></div>`;
      }
      return preview;
    } finally {
      if (button) { button.disabled = false; button.textContent = originalText; }
    }
  }

  async function ensureBenefitPreview(kind) {
    const context = window.motfGetCheckoutPreviewContext?.(kind);
    const input = benefitInput(kind);
    const signature = benefitSignature(kind, context);
    if (benefitPreviews[kind]?.signature === signature) return benefitPreviews[kind];
    if (!input.points && !input.coupon) {
      const preview = {
        original_amount: Number(context?.originalAmount || 0),
        payable_amount: Number(context?.originalAmount || 0),
        applied_points: 0,
        applied_coupon_discount: 0,
        signature,
      };
      benefitPreviews[kind] = preview;
      publishBenefitPreview(kind, preview);
      return preview;
    }
    return previewBenefits(kind);
  }

  async function ensureCheckoutBenefits(kind) {
    try {
      return await ensureBenefitPreview(kind);
    } catch (error) {
      const couponInput = document.querySelector(benefitFields[kind].coupon);
      if (!couponInput?.value.trim()) throw error;
      couponInput.value = "";
      benefitPreviews[kind] = null;
      window.motfToast?.("사용할 수 없는 할인코드는 제외했습니다. 다른 혜택만 반영해 결제를 계속합니다.");
      return ensureBenefitPreview(kind);
    }
  }

  let transactionLoadVersion = 0;
  async function loadMyTransactions() {
    const version = ++transactionLoadVersion;
    await window.motfOrganizationReady;
    await window.motfReloadOrganization?.();
    const organizationId = window.motfGetOrganizationId?.();
    const scopeQuery = (query) => organizationId ? query.eq("organization_id", organizationId) : query.eq("customer_id", userId).is("organization_id", null);
    const { data: authData } = await client.auth.getSession();
    const userId = authData.session?.user?.id;
    if (!userId) {
      syncPointControls(0);
      window.motfApplyMyTransactions?.([], []);
      return;
    }
    const [reservationResult, orderResult, intentResult, pointResult, pointLedgerResult] = await Promise.all([
      scopeQuery(client.from("reservations")
        .select("id, business_id, event_date, check_out_date, guest_count, offering_name, total_amount, original_amount, customer_paid_amount, points_used, coupon_discount, base_accommodation_amount, status, refund_status, refund_amount, businesses(business_name)")
        )
        .order("created_at", { ascending: false }),
      scopeQuery(client.from("market_orders")
        .select("id, business_id, pickup_time, total_amount, original_amount, customer_paid_amount, points_used, coupon_discount, status, refund_status, refund_amount, businesses(business_name), market_order_items(id)")
        )
        .order("created_at", { ascending: false }),
      scopeQuery(client.from("payment_intents")
        .select("order_id, kind, amount, original_amount, points_used, coupon_discount, order_name, status, payment_method, virtual_account, virtual_account_issued_at, created_at, expires_at, extra_charge_request_id")
        )
        .in("status", ["virtual_account_issued", "waiting_for_deposit"])
        .order("created_at", { ascending: false }),
      organizationId ? Promise.resolve({ data: window.motfGetOrganizationWallet().account }) : client.from("point_accounts")
        .select("balance, lifetime_earned, lifetime_used")
        .eq("user_id", userId)
        .maybeSingle(),
      organizationId ? Promise.resolve({ data: window.motfGetOrganizationWallet().ledger }) : client.from("point_ledger")
        .select("id, amount, balance_after, entry_type, reason, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (version !== transactionLoadVersion || (organizationId || null) !== (window.motfGetOrganizationId?.() || null)) return;
    if (reservationResult.error || orderResult.error || intentResult.error) {
      console.error(reservationResult.error || orderResult.error || intentResult.error);
      return;
    }
    const pointBalance = pointResult.error ? 0 : Number(pointResult.data?.balance || 0);
    syncPointControls(pointBalance);
    document.querySelectorAll("[data-point-wallet]").forEach((node) => { node.hidden = false; });
    window.motfApplyPointData?.(pointResult.data || {}, pointLedgerResult.error ? [] : (pointLedgerResult.data || []));
    const reservations = (reservationResult.data || []).map((item) => ({
      id: item.id,
      businessId: item.business_id,
      stayName: item.businesses?.business_name || "숙소",
      roomName: item.offering_name,
      date: item.event_date,
      checkOutDate: item.check_out_date || "",
      people: item.guest_count,
      amount: item.original_amount || item.total_amount,
      paidAmount: item.customer_paid_amount,
      pointsUsed: item.points_used,
      couponDiscount: item.coupon_discount,
      baseAmount: item.base_accommodation_amount,
      status: displayStatus(item),
      rawStatus: item.status,
      refundAmount: item.refund_amount,
    }));
    const orders = (orderResult.data || []).map((item) => ({
      id: item.id,
      businessId: item.business_id,
      storeName: item.businesses?.business_name || "마트",
      pickupTime: String(item.pickup_time || "").slice(0, 5),
      amount: item.original_amount || item.total_amount,
      paidAmount: item.customer_paid_amount,
      pointsUsed: item.points_used,
      couponDiscount: item.coupon_discount,
      status: displayStatus(item),
      rawStatus: item.status,
      refundAmount: item.refund_amount,
      items: item.market_order_items || [],
    }));
    (intentResult.data || []).filter((item) => isFutureDate(pendingAccountExpiresAt(item))).forEach((item) => {
      const account = item.virtual_account || {};
      const label = accountLabel(account);
      const pendingItem = {
        id: item.order_id,
        amount: item.amount,
        status: "입금 전",
        virtualAccount: account,
        expiresAt: pendingAccountExpiresAt(item),
        isPendingVirtualAccount: true,
      };
      if (item.kind === "stay" || item.kind === "extra_charge") {
        reservations.unshift({
          ...pendingItem,
          stayName: item.kind === "extra_charge" ? "추가 이용금" : "가상계좌 입금 대기",
          roomName: item.order_name,
          date: String(item.virtual_account_issued_at || item.created_at || "").slice(0, 10),
          people: "-",
          isExtraCharge: item.kind === "extra_charge",
        });
      } else {
        orders.unshift({
          ...pendingItem,
          storeName: "가상계좌 입금 대기",
          pickupTime: String(item.virtual_account_issued_at || item.created_at || "").slice(11, 16),
          items: [{ id: item.order_id }],
        });
      }
    });
    window.motfApplyMyTransactions?.(reservations, orders);
  }
  window.motfReloadTransactions = loadMyTransactions;
  window.addEventListener("motf:organization-changed", () => {
    for (const kind of ["stay", "market"]) {
      document.querySelector(benefitFields[kind].points).value = "0";
      document.querySelector(benefitFields[kind].coupon).value = "";
      invalidateBenefitPreview(kind);
    }
    syncPointControls(0);
    window.motfApplyPointData?.({}, []);
    window.motfApplyMyTransactions?.([], []);
  });

  document.addEventListener("submit", async (event) => {
    if (event.target.id === "bookingForm") {
      const draft = window.motfGetReservationDraft?.();
      if (!draft || !isUuid(draft.business_id)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert("이 숙소는 아직 데모 정보라 실제 예약을 접수할 수 없습니다.\n사장님이 등록한 실제 숙소를 선택해주세요.");
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const submitButton = event.target.querySelector('[type="submit"]');
      const originalHtml = submitButton?.innerHTML;
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = "결제 금액 확인 중..."; }
      window.motfCheckoutPending = true;
      try {
        const verified = await window.motfEnsureIdentityVerified?.();
        if (verified === false) throw new Error("로그인과 예약·주문에 필요한 기본정보를 확인해주세요.");
        const checkoutAmount = Number(window.motfGetCheckoutPreviewContext?.("stay")?.originalAmount || 0);
        if (checkoutAmount > MAX_SINGLE_PAYMENT_AMOUNT) throw new Error(PAYMENT_LIMIT_MESSAGE);
        await ensureCheckoutBenefits("stay");
        const requestedPoints = benefitInput("stay").points;
        const organizationId = window.motfGetOrganizationId?.();
        const { data, error } = await client.rpc(organizationId ? "prepare_organization_stay_checkout" : "prepare_stay_checkout", {
          ...(organizationId ? { target_organization_id: organizationId } : {}),
          target_business_id: draft.business_id,
          target_offering_id: draft.offering_id,
          customer_name: draft.customer_name,
          group_name: draft.group_name,
          contact_phone: draft.contact_phone,
          event_date: draft.event_date,
          guest_count: draft.guest_count,
          request_memo: draft.request_memo,
          check_in_date: draft.event_date,
          check_out_date: draft.check_out_date,
          requested_points: requestedPoints,
          coupon_code: document.querySelector("#bookingCouponCode")?.value.trim() || null,
        });
        if (error) throw error;
        const intent = Array.isArray(data) ? data[0] : data;
        if (!intent) throw new Error("결제 대기 정보를 만들지 못했습니다.");
        window.motfStartPreparedPayment?.(intent, organizationId ? { ...draft, organization_id: organizationId, customer_name: window.motfCurrentUserProfile?.full_name, contact_phone: window.motfCurrentUserProfile?.phone, group_name: window.motfGetOrganizationName?.() } : draft);
      } catch (error) {
        console.error(error);
        alert(`결제를 준비하지 못했습니다.\n${error.message || "잠시 후 다시 시도해주세요."}`);
      } finally {
        window.motfCheckoutPending = false;
        if (submitButton) { submitButton.disabled = false; submitButton.innerHTML = originalHtml; window.refreshIcons?.(); }
      }
      return;
    }

    if (event.target.id === "orderForm") {
      const draft = window.motfGetMarketOrderDraft?.();
      if (!draft || !isUuid(draft.business_id)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert("이 마트는 아직 데모 정보라 실제 주문을 접수할 수 없습니다.\n사장님이 등록한 실제 마트를 선택해주세요.");
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const submitButton = event.target.querySelector('[type="submit"]');
      const originalHtml = submitButton?.innerHTML;
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = "결제 금액 확인 중..."; }
      window.motfCheckoutPending = true;
      try {
        const verified = await window.motfEnsureIdentityVerified?.();
        if (verified === false) throw new Error("로그인과 예약·주문에 필요한 기본정보를 확인해주세요.");
        if (draft.contains_alcohol && !(await window.motfEnsureAdultVerified?.())) throw new Error("주류 주문을 위한 성인확인을 완료해주세요.");
        const checkoutAmount = Number(window.motfGetCheckoutPreviewContext?.("market")?.originalAmount || 0);
        if (checkoutAmount > MAX_SINGLE_PAYMENT_AMOUNT) throw new Error(PAYMENT_LIMIT_MESSAGE);
        await ensureCheckoutBenefits("market");
        const requestedPoints = benefitInput("market").points;
        const organizationId = window.motfGetOrganizationId?.();
        const { data, error } = await client.rpc(organizationId ? "prepare_organization_market_checkout" : "prepare_market_checkout", {
          ...(organizationId ? { target_organization_id: organizationId } : {}),
          target_business_id: draft.business_id,
          customer_name: draft.customer_name,
          contact_phone: draft.contact_phone,
          pickup_place: draft.pickup_place,
          pickup_time: draft.pickup_time,
          request_memo: draft.request_memo,
          items: draft.items,
          requested_points: requestedPoints,
          coupon_code: document.querySelector("#marketCouponCode")?.value.trim() || null,
        });
        if (error) throw error;
        const intent = Array.isArray(data) ? data[0] : data;
        if (!intent) throw new Error("결제 대기 정보를 만들지 못했습니다.");
        window.motfStartPreparedPayment?.(intent, organizationId ? { ...draft, organization_id: organizationId, customer_name: window.motfCurrentUserProfile?.full_name, contact_phone: window.motfCurrentUserProfile?.phone, group_name: window.motfGetOrganizationName?.() } : draft);
      } catch (error) {
        console.error(error);
        alert(`결제를 준비하지 못했습니다.\n${error.message || "잠시 후 다시 시도해주세요."}`);
      } finally {
        window.motfCheckoutPending = false;
        if (submitButton) { submitButton.disabled = false; submitButton.innerHTML = originalHtml; window.refreshIcons?.(); }
      }
    }
  }, true);

  document.addEventListener("click", (event) => {
    const submitButton = event.target.closest('#bookingForm [type="submit"], #orderForm [type="submit"]');
    if (!submitButton) return;
    const form = submitButton.closest("form");
    if (form && !form.checkValidity()) {
      event.preventDefault();
      const invalid = form.querySelector(":invalid");
      window.setTimeout(() => {
        form.reportValidity();
        invalid?.focus();
        if (invalid?.id === "bookingTerms") window.motfToast?.("예약 필수 약관과 개인정보 제공 동의가 필요합니다.");
        if (invalid?.id === "orderTerms") window.motfToast?.("주문 필수 약관과 개인정보 제공 동의가 필요합니다.");
      }, 0);
    }
  }, true);

  document.addEventListener("click", async (event) => {
    const previewButton = event.target.closest("[data-preview-benefits]");
    if (previewButton) {
      try { await previewBenefits(previewButton.dataset.previewBenefits, previewButton); }
      catch (error) {
        const kind = previewButton.dataset.previewBenefits;
        const fields = benefitFields[kind];
        const couponInput = document.querySelector(fields.coupon);
        const hadCoupon = Boolean(couponInput?.value.trim());
        if (hadCoupon) couponInput.value = "";
        benefitPreviews[kind] = null;
        publishBenefitPreview(kind, null);
        const result = document.querySelector(fields.result);
        if (result) {
          result.className = "checkout-benefit-result error nonblocking";
          result.textContent = hadCoupon
            ? `${error.message || "할인코드를 적용하지 못했습니다."} 쿠폰은 제외했으며 바로 결제할 수 있습니다.`
            : (error.message || "혜택을 적용하지 못했습니다.");
        }
      }
      return;
    }
    const allPointsButton = event.target.closest("[data-use-all-points]");
    if (allPointsButton) {
      const kind = allPointsButton.dataset.useAllPoints;
      if (Number(window.motfPointBalance || 0) <= 0) return window.motfToast?.("사용 가능한 포인트가 없습니다.");
      const input = document.querySelector(benefitFields[kind].points);
      if (input) input.value = String(window.motfPointBalance || 0);
      invalidateBenefitPreview(kind);
      return;
    }
    const resetBenefitsButton = event.target.closest("[data-reset-benefits]");
    if (resetBenefitsButton) {
      const kind = resetBenefitsButton.dataset.resetBenefits;
      document.querySelector(benefitFields[kind].points).value = "0";
      document.querySelector(benefitFields[kind].coupon).value = "";
      invalidateBenefitPreview(kind);
      return;
    }
    const cancelButton = event.target.closest("[data-cancel-reservation]");
    if (!cancelButton) return;
    const reservationId = cancelButton.dataset.cancelReservation;
    if (!confirm("예약을 취소할까요? 이용일까지 남은 기간에 따라 환불률이 자동 적용됩니다.")) return;
    const reason = prompt("취소 사유를 입력해주세요.")?.trim() || "이용자 예약 취소";
    cancelButton.disabled = true;
    try {
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("로그인이 만료되었습니다.");
      const response = await fetch("/api/cancel-reservation", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId, reason }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.message || "예약 취소를 처리하지 못했습니다.");
      alert(result.message || "예약 취소와 환불 요청이 접수되었습니다.");
      await loadMyTransactions();
    } catch (error) {
      alert(error.message || "예약 취소를 처리하지 못했습니다.");
    } finally { cancelButton.disabled = false; }
  });

  document.addEventListener("input", (event) => {
    const kind = event.target.closest('[data-checkout-benefits="stay"]') ? "stay"
      : event.target.closest('[data-checkout-benefits="market"]') ? "market" : "";
    if (kind) invalidateBenefitPreview(kind);
  });

  client.auth.onAuthStateChange((event) => {
    transactionLoadVersion += 1;
    if (event === "SIGNED_IN") window.setTimeout(loadMyTransactions, 0);
    if (event === "SIGNED_OUT") {
      syncPointControls(0);
      document.querySelectorAll("[data-point-wallet]").forEach((node) => { node.hidden = true; });
      window.motfApplyPointData?.({}, []);
      window.motfApplyMyTransactions?.([], []);
    }
  });
  window.setTimeout(loadMyTransactions, 0);
})();
