function notificationRecipient(item) {
  const phone = String(item.recipient_phone || "").replace(/[^0-9]/g, "");
  if (!/^(010[0-9]{8}|01[16789][0-9]{7,8})$/.test(phone) || /^010([0-9])\1{7}$/.test(phone) || phone === "01012121212") {
    throw new Error("알림톡 수신 휴대폰 번호를 확인해주세요. 안심번호·유선번호·임시번호로는 발송하지 않습니다.");
  }
  const expectedRole = /^OWNER_/.test(item.template_key) ? "owner"
    : /^USER_/.test(item.template_key) ? "user"
      : /^ADMIN_/.test(item.template_key) ? "admin" : null;
  if (!expectedRole || item.recipient_role !== expectedRole) {
    throw new Error("알림 템플릿과 수신자 역할이 일치하지 않습니다.");
  }
  return phone;
}

module.exports = { notificationRecipient };
