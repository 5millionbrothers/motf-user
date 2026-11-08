(() => {
  const client = window.motfSupabase;
  if (!client) return;
  const summaries = new Map();
  const esc = escapeHtml, icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const dialog = document.createElement('dialog'); dialog.className = 'motf-dialog product-review-dialog'; document.body.append(dialog);
  let version = 0, orders = [], writingProduct = null;
  function summary(id) { return summaries.get(String(id)) || {rating:0,count:0}; }
  window.motfProductReviewSummary = (id,aggregate = true) => {
    const product = findProduct(id)?.product;
    if (!aggregate || !product) return summary(id);
    const parts = productVariants(product).map(item => summary(item.id)), count = parts.reduce((sum,row) => sum + row.count,0);
    return {count,rating:count ? parts.reduce((sum,row) => sum + row.rating*row.count,0)/count : 0};
  };
  async function reloadSummaries() {
    const {data,error} = await client.rpc('get_public_product_review_summaries');
    if (error) { console.warn('상품 리뷰 요약',error); return; }
    summaries.clear(); (data || []).forEach(row => summaries.set(String(row.offering_id),{rating:Number(row.average_rating_5),count:Number(row.review_count)}));
    if (currentRoute() === 'market') renderStores();
    if (currentRoute() === 'productDetail') window.motfRenderProductReviews(state.selectedProduct);
  }
  window.motfRenderProductReviews = async product => {
    const stamp = ++version;
    let section = document.getElementById('productReviewsSection');
    if (!section) { section = document.createElement('section'); section.id = 'productReviewsSection'; section.className = 'product-reviews-section'; document.getElementById('productDetailContent').append(section); }
    section.innerHTML = `<div class="section-top"><div><h2>상품 리뷰</h2><p>${esc(product.variantLabel || product.unit)} · ${reviewRatingLabel(summary(product.id))}</p></div><button class="secondary" type="button" data-write-product-review="${product.id}">${icon('pencil')} 리뷰 작성</button></div><div data-product-review-list>리뷰를 불러오고 있어요.</div>`;
    const {data,error} = await client.rpc('get_public_product_reviews',{target_offering_id:product.id,result_limit:50});
    if (stamp !== version || state.selectedProduct?.id !== product.id) return;
    const list = section.querySelector('[data-product-review-list]');
    list.innerHTML = error ? '<p class="group-info-note">상품 리뷰를 불러오지 못했습니다. <button class="text-button" data-retry-product-reviews>다시 시도</button></p>' : data?.length ? data.map(row => `<article class="product-review-entry"><div><strong>${Number(row.rating).toFixed(1)}/5.0</strong><time>${esc(formatReviewDate(row.created_at))}</time></div><p>${esc(row.body)}</p><small>${esc(row.author_name)}</small></article>`).join('') : '<p class="group-info-note">아직 등록된 상품 리뷰가 없어요. 실제 이용을 완료한 주문만 작성할 수 있어요.</p>';
  };
  function setOrder(id) {
    const order = orders.find(row => row.id === id);
    if (!order) return;
    dialog.querySelector('[name="rating"]').value = order.review?.rating || 5;
    dialog.querySelector('[name="body"]').value = order.review?.body || '';
    dialog.querySelector('[data-product-score]').textContent = `${Number(order.review?.rating || 5).toFixed(1)}/5.0`;
  }
  function openWriter(id) {
    window.motfRequireLogin(async () => {
      writingProduct = findProduct(id)?.product; if (!writingProduct) return;
      dialog.innerHTML = `<div class="modal-top"><h2>상품 리뷰 작성</h2><button class="icon-button" type="button" data-product-review-close aria-label="닫기">${icon('x')}</button></div><p data-review-form-body>이용 완료한 주문을 확인하고 있어요.</p>`;
      dialog.showModal(); refreshIcons();
      const {data,error} = await client.rpc('get_product_review_orders',{target_offering_id:id});
      if (!dialog.open || writingProduct?.id !== id) return;
      const host = dialog.querySelector('[data-review-form-body]');
      if (error) { host.textContent = error.message || '주문을 확인하지 못했습니다.'; return; }
      orders = (data || []).filter(row => !row.review || row.review.is_author);
      if (!orders.length) { host.textContent = '이 상품을 실제 이용 완료한 주문이 있어야 리뷰를 작성할 수 있어요. 단체 주문은 먼저 해당 단체에 참여해주세요.'; return; }
      host.outerHTML = `<form class="group-profile-form" data-product-review-form><p>${esc(writingProduct.name)} · ${esc(writingProduct.variantLabel || writingProduct.unit)}</p><label>이용 완료 주문<select name="order" required>${orders.map(row => `<option value="${row.id}">${esc(new Date(row.created_at).toLocaleDateString('ko-KR'))} 주문 ${row.review ? '· 기존 리뷰 수정' : ''}</option>`).join('')}</select></label><label>평점 <output data-product-score>5.0/5.0</output><input type="range" name="rating" min="1" max="5" step="0.5" value="5"></label><label>이용 후기<textarea name="body" required minlength="2" maxlength="2000" rows="5" placeholder="상품의 양, 품질, 실제 준비에 도움이 된 점을 남겨주세요."></textarea></label><p role="alert" data-product-review-error></p><button class="primary" type="submit">리뷰 저장</button></form>`;
      setOrder(orders[0].id);
    });
  }
  document.addEventListener('click',event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-write-product-review')) openWriter(button.dataset.writeProductReview);
    if (button.hasAttribute('data-product-review-close')) dialog.close();
    if (button.hasAttribute('data-retry-product-reviews')) window.motfRenderProductReviews(state.selectedProduct);
    if (button.hasAttribute('data-product-reviews')) setTimeout(() => document.getElementById('productReviewsSection')?.scrollIntoView({behavior:'smooth'}),150);
  });
  dialog.addEventListener('input',event => {
    if (event.target.name === 'rating') dialog.querySelector('[data-product-score]').textContent = `${Number(event.target.value).toFixed(1)}/5.0`;
  });
  dialog.addEventListener('change',event => { if (event.target.name === 'order') setOrder(event.target.value); });
  dialog.addEventListener('submit',async event => {
    event.preventDefault(); const form = event.target, values = new FormData(form), button = form.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const {error} = await client.rpc('save_product_review',{target_order_id:values.get('order'),target_offering_id:writingProduct.id,review_rating:Number(values.get('rating')),review_body:String(values.get('body')).trim()});
      if (error) throw error;
      dialog.close(); await reloadSummaries(); toast('상품 리뷰를 저장했어요.');
    } catch (error) { form.querySelector('[data-product-review-error]').textContent = error.message || '리뷰를 저장하지 못했습니다.'; }
    finally { button.disabled = false; }
  });
  setTimeout(reloadSummaries,800);
})();
