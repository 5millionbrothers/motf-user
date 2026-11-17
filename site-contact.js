(function connectSiteContact() {
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-site-contact-form]');
    if (!form) return;
    event.preventDefault();
    if (form.dataset.submitting || !form.reportValidity()) return;
    const status = form.querySelector('[role="status"]');
    const button = document.querySelector(`button[form="${form.id}"][type="submit"]`);
    const data = Object.fromEntries(new FormData(form));
    if (!form.dataset.requestId) form.dataset.requestId = crypto.randomUUID();
    const payload = { ...data, source: form.dataset.siteContactForm, consent: data.consent === 'on', requestId: form.dataset.requestId };
    const fields = [...form.querySelectorAll('input,select,textarea')];
    fields.forEach(field => { field.disabled = true; });
    form.dataset.submitting = 'true';
    button.disabled = true;
    status.textContent = '접수 중입니다.';
    try {
      const response = await fetch('/api/site-contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || !result.id) throw new Error(result.error || '접수 결과를 확인하지 못했습니다. 다시 시도해주세요.');
      form.reset();
      delete form.dataset.requestId;
      status.textContent = `접수되었습니다. 접수번호 ${result.id.slice(0, 8)}`;
      document.getElementById('contactSuccessTitle').textContent = '접수되었습니다.';
      document.getElementById('contactSuccessMessage').textContent = `운영팀에서 내용을 확인합니다. 접수번호: ${result.id.slice(0, 8)}${data.contact ? ' · 회신이 필요한 경우 남겨주신 연락처로 연락드립니다.' : ''}`;
      document.getElementById('contactSuccessDialog').showModal();
    } catch (error) {
      status.textContent = error.message === 'Failed to fetch' ? '연결하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해주세요.' : error.message;
    } finally {
      delete form.dataset.submitting;
      fields.forEach(field => { field.disabled = false; });
      button.disabled = false;
    }
  });
  document.addEventListener('input', event => {
    const form = event.target.closest('[data-site-contact-form]');
    if (form && !form.dataset.submitting) delete form.dataset.requestId;
  });
  document.addEventListener('click', event => {
    if (event.target.closest('[data-close-contact-success]')) document.getElementById('contactSuccessDialog')?.close();
  });
})();
