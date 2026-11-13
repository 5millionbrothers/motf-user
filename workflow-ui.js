(() => {
  const $ = (selector, root=document) => root.querySelector(selector);
  const esc = escapeHtml;
  window.motfServiceRegions = ['가평','대성리'];
  let targets = state.reviewTargets || [];
  function regions() {
    const names = window.motfServiceRegions;
    document.querySelectorAll('#stayRegion,#mtEditRegion,select[data-stay-search-field="region"]').forEach(select => {
      const signature = names.join('|');
      if (select.dataset.serviceRegions === signature && [...select.options].map(option=>option.value).join('|') === signature) return;
      const previous = select.value;
      const selected = names.includes(select.value) ? select.value : names[0] || '';
      select.innerHTML = names.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
      select.value = selected; select.dataset.serviceRegions = signature;
      if (select.id === 'stayRegion' && previous !== selected) select.dispatchEvent(new Event('input',{bubbles:true}));
    });
    const form=$('#stayFilters'), people=$('#stayPeople')?.closest('label');
    if(form && people) {
      const names=matchMedia('(min-width:1024px)').matches ? ['stayRegion','stayCheckInDate','stayCheckOutDate'] : ['stayCheckInDate','stayCheckOutDate','stayRegion'];
      const desired=names.map(id=>$('#'+id)?.closest('label'));
      if(desired.every(Boolean) && desired.some((label,index)=>[...form.children].indexOf(label)!==index))desired.forEach(label=>form.insertBefore(label,people));
    }
  }
  async function loadRegions() {
    if (!window.motfSupabase) return;
    const {data,error} = await window.motfSupabase.from('service_regions').select('name,sort_order').eq('is_active',true).order('sort_order').order('name');
    if (!error && Array.isArray(data)) window.motfServiceRegions = data.map(item => item.name);
    regions();
  }
  function reviewNudge() {
    document.querySelectorAll('.review-write-nudge').forEach(node => node.remove());
    if (!targets.length || !['home','stays','market','mypage'].includes(currentRoute())) return;
    const view = document.querySelector('.view.active');
    if (!view) return;
    const panel = document.createElement('aside'); panel.className = 'review-write-nudge';
    panel.innerHTML = `<div><strong>이번 MT는 어땠나요?</strong><span>아직 남기지 않은 이용 후기가 ${targets.length}건 있어요.</span></div><button class="secondary-btn" type="button" data-pending-review="${esc(targets[0].id)}"><i data-lucide="square-pen"></i>리뷰 남기기</button>`;
    const heading = view.querySelector(':scope>.view-title,:scope>.home-search,:scope>.home-search-section');
    if (heading) heading.after(panel); else view.prepend(panel);
    refreshIcons();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-pending-review]');
    if (!button) return;
    navigate('review');
    const input = $('#reviewTarget'); if (input) { input.value = button.dataset.pendingReview; input.dispatchEvent(new Event('change',{bubbles:true})); }
    $('#reviewForm')?.scrollIntoView({behavior:'smooth',block:'start'});
  });
  window.addEventListener('motf:review-targets',event => { targets = event.detail.targets; reviewNudge(); });
  window.addEventListener('motf:routechange',() => { regions(); reviewNudge(); });
  window.addEventListener('motf:auth-ready',() => { if (!window.motfCurrentUserId) { targets=[]; reviewNudge(); } });
  let scheduled = false;
  new MutationObserver(() => { if (!scheduled) { scheduled=true; requestAnimationFrame(() => { scheduled=false; regions(); }); } }).observe(document.querySelector('main') || document.body,{childList:true,subtree:true});
  loadRegions().catch(error => console.warn('지역 목록을 불러오지 못했습니다.',error.message));
  regions(); reviewNudge();
  matchMedia('(min-width:1024px)').addEventListener('change',regions);
})();
