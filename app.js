(function () {
  const STORAGE_KEYS = {
    businessName: 'strike_pos_business_name',
    headerImageUrl: 'strike_pos_header_image_url',
    products: 'strike_pos_products',
    categories: 'strike_pos_categories',
    apiKey: 'strike_pos_api_key',
    sandbox: 'strike_pos_sandbox',
    developerMode: 'strike_pos_developer_mode',
    protectEnabled: 'strike_pos_protect_enabled',
    protectPinHash: 'strike_pos_protect_pin_hash',
    taxRate: 'strike_pos_tax_rate',
    tipPercentages: 'strike_pos_tip_percentages',
    transactions: 'strike_pos_transactions',
    pendingInvoices: 'strike_pos_pending_invoices',
  };

  const SESSION_UNLOCKED = 'strike_pos_unlocked';

  const STRIKE_API_BASE_PROD = 'https://api.strike.me';
  const STRIKE_API_BASE_SANDBOX = 'https://api.dev.strike.me';
  const SATS_PER_BTC = 100_000_000;

  let cart = [];
  let editingProductId = null;
  let editingCategoryId = null;
  let btcRateUsd = 0;
  let keypadAmount = '0';
  let customerTipUsd = 0;
  let lastSaleSnapshot = null;
  let selectedCategoryId = null; // null = "All"
  let currentReceiptTxn = null; // for export/print from detail modal
  let currentReconData = null; // { periodLabel, sales, tips, taxes, receipts } for export/print
  let settingsImportOnly = false;

  function getProducts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.products);
      return raw ? JSON.parse(raw) : getDefaultProducts();
    } catch {
      return getDefaultProducts();
    }
  }

  function getDefaultProducts() {
    return [];
  }

  function saveProducts(products) {
    localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(products));
  }

  function getCategories() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.categories);
      return raw ? JSON.parse(raw) : getDefaultCategories();
    } catch {
      return getDefaultCategories();
    }
  }

  function getDefaultCategories() {
    return [];
  }

  function saveCategories(categories) {
    localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(categories));
  }

  function getTaxRate() {
    const v = localStorage.getItem(STORAGE_KEYS.taxRate);
    const n = parseFloat(v);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  function getDefaultTipPercentages() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.tipPercentages);
      if (raw && raw.trim()) {
        return raw.split(',').map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n) && n > 0);
      }
    } catch (_) {}
    return [15, 20];
  }

  function saveTaxAndTips(taxRate, tipPercentages) {
    localStorage.setItem(STORAGE_KEYS.taxRate, String(taxRate));
    localStorage.setItem(STORAGE_KEYS.tipPercentages, tipPercentages.join(', '));
  }

  function getTransactions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.transactions);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveTransaction(txn) {
    const list = getTransactions();
    list.push({ ...txn, id: generateId(), date: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(list));
  }

  function deleteTransaction(txn) {
    let list = getTransactions();
    if (txn.id) {
      list = list.filter((t) => t.id !== txn.id);
    } else {
      const idx = list.findIndex((t) => t.date === txn.date && t.totalUsd === txn.totalUsd);
      if (idx >= 0) list = list.slice(0, idx).concat(list.slice(idx + 1));
    }
    localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(list));
  }

  function getPendingInvoices() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.pendingInvoices);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function savePendingInvoices(list) {
    localStorage.setItem(STORAGE_KEYS.pendingInvoices, JSON.stringify(list));
  }

  function addPendingInvoice(invoiceId, date, amountDisplay, totalUsd, saleSnapshot, lnInvoice, expirationInSec) {
    const list = getPendingInvoices();
    const existing = list.find((p) => p.invoiceId === invoiceId);
    if (existing) {
      existing.lnInvoice = lnInvoice || existing.lnInvoice;
      existing.expirationInSec = expirationInSec != null ? expirationInSec : existing.expirationInSec;
      savePendingInvoices(list);
      return;
    }
    list.push({
      invoiceId,
      date,
      amountDisplay,
      totalUsd: totalUsd || 0,
      saleSnapshot: saleSnapshot || null,
      lnInvoice: lnInvoice || null,
      expirationInSec: expirationInSec != null ? expirationInSec : null,
    });
    savePendingInvoices(list);
  }

  function removePendingInvoice(invoiceId) {
    const list = getPendingInvoices().filter((p) => p.invoiceId !== invoiceId);
    savePendingInvoices(list);
  }

  function getBusinessName() {
    return (localStorage.getItem(STORAGE_KEYS.businessName) || '').trim();
  }

  function setBusinessName(name) {
    const n = (name || '').trim();
    localStorage.setItem(STORAGE_KEYS.businessName, n);
    updateBusinessNameDisplay();
  }

  function getHeaderImageUrl() {
    return (localStorage.getItem(STORAGE_KEYS.headerImageUrl) || '').trim();
  }

  function setHeaderImageUrl(url) {
    const u = (url || '').trim();
    localStorage.setItem(STORAGE_KEYS.headerImageUrl, u);
    updateHeaderImageDisplay();
  }

  function updateBusinessNameDisplay() {
    const display = getBusinessName() || 'Bitcoin Point-of-Sale';
    const headerEl = document.getElementById('header-business-name');
    const titleEl = document.getElementById('document-title');
    if (headerEl) headerEl.textContent = display;
    if (titleEl) titleEl.textContent = display;
  }

  function updateHeaderImageDisplay() {
    const url = getHeaderImageUrl();
    const img = document.getElementById('header-image');
    if (!img) return;
    if (url) {
      img.src = url;
      img.alt = getBusinessName() || 'Logo';
      img.style.display = '';
      img.classList.remove('hidden');
    } else {
      img.removeAttribute('src');
      img.alt = '';
      img.style.display = 'none';
      img.classList.add('hidden');
    }
  }

  function getApiKey() {
    return localStorage.getItem(STORAGE_KEYS.apiKey) || '';
  }

  function getSandbox() {
    return localStorage.getItem(STORAGE_KEYS.sandbox) === 'true';
  }

  function getDeveloperMode() {
    return localStorage.getItem(STORAGE_KEYS.developerMode) === 'true';
  }

  function setDeveloperMode(on) {
    localStorage.setItem(STORAGE_KEYS.developerMode, on ? 'true' : 'false');
  }

  function getProtectEnabled() {
    return localStorage.getItem(STORAGE_KEYS.protectEnabled) === 'true';
  }

  function setProtectEnabled(on) {
    localStorage.setItem(STORAGE_KEYS.protectEnabled, on ? 'true' : 'false');
    if (!on) localStorage.removeItem(STORAGE_KEYS.protectPinHash);
  }

  function getPinHash() {
    return localStorage.getItem(STORAGE_KEYS.protectPinHash) || '';
  }

  function setPinHash(hash) {
    if (hash) localStorage.setItem(STORAGE_KEYS.protectPinHash, hash);
    else localStorage.removeItem(STORAGE_KEYS.protectPinHash);
  }

  function isUnlocked() {
    return sessionStorage.getItem(SESSION_UNLOCKED) === 'true';
  }

  function setUnlocked(on) {
    if (on) sessionStorage.setItem(SESSION_UNLOCKED, 'true');
    else sessionStorage.removeItem(SESSION_UNLOCKED);
  }

  function hashPin(pin) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(pin))).then((buf) => {
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    });
  }

  function verifyPin(pin) {
    return hashPin(pin).then((hash) => hash === getPinHash());
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function formatUsd(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatSats(n) {
    return Math.round(Number(n)).toLocaleString() + ' sats';
  }

  function parseUsdOrSats(amountStr, currency) {
    const n = parseFloat(String(amountStr).replace(/,/g, ''));
    if (currency === 'sats') return { amount: n, currency: 'sats', usd: null, sats: n };
    return { amount: n, currency: 'USD', usd: n, sats: null };
  }

  function cartLineToUsd(line) {
    if (line.currency === 'USD') return line.amount;
    if (line.currency === 'sats' && btcRateUsd > 0) {
      return (line.amount / SATS_PER_BTC) * (1 / (1 / (btcRateUsd * SATS_PER_BTC))) * (line.amount / 1e8) * btcRateUsd;
    }
    const btcPerSat = 1 / SATS_PER_BTC;
    return (line.amount * btcPerSat) * btcRateUsd;
  }

  function cartLineToSats(line) {
    if (line.currency === 'sats') return line.amount;
    if (line.currency === 'USD' && btcRateUsd > 0) {
      const btc = line.amount / btcRateUsd;
      return Math.round(btc * SATS_PER_BTC);
    }
    return 0;
  }

  function fetchBtcRate() {
    const key = getApiKey();
    const base = getSandbox() ? STRIKE_API_BASE_SANDBOX : STRIKE_API_BASE_PROD;
    const url = base + '/v1/rates/ticker';
    const opts = { headers: { Accept: 'application/json' } };
    if (key) opts.headers['Authorization'] = 'Bearer ' + key;
    fetch(url, opts)
      .then((r) => r.json())
      .then((arr) => {
        const pair = Array.isArray(arr) && arr.find((p) => p.sourceCurrency === 'BTC' && p.targetCurrency === 'USD');
        if (pair && pair.amount) btcRateUsd = parseFloat(pair.amount);
        updateHeaderBtcPrice();
      })
      .catch(() => {});
  }

  function updateHeaderBtcPrice() {
    const priceEl = document.getElementById('header-btc-price');
    const satsEl = document.getElementById('header-btc-sats');
    if (!priceEl) return;
    if (btcRateUsd > 0) {
      priceEl.textContent = '1 BTC = ' + formatUsd(btcRateUsd);
      priceEl.classList.remove('header-btc-price-empty');
      if (satsEl) {
        const satsPerDollar = Math.round(SATS_PER_BTC / btcRateUsd);
        satsEl.textContent = satsPerDollar.toLocaleString() + ' sats/$';
        satsEl.classList.remove('header-btc-price-empty');
      }
    } else {
      priceEl.textContent = 'BTC price —';
      priceEl.classList.add('header-btc-price-empty');
      if (satsEl) {
        satsEl.textContent = '';
        satsEl.classList.add('header-btc-price-empty');
      }
    }
  }

  function getCartTotalUsd() {
    let usd = 0;
    let sats = 0;
    cart.forEach((line) => {
      if (line.currency === 'USD') usd += line.amount;
      else sats += line.amount;
    });
    if (sats > 0 && btcRateUsd > 0) usd += (sats / SATS_PER_BTC) * btcRateUsd;
    return usd;
  }

  function getCartTotalSats() {
    let usd = 0;
    let sats = 0;
    cart.forEach((line) => {
      if (line.currency === 'USD') usd += line.amount;
      else sats += line.amount;
    });
    if (usd > 0 && btcRateUsd > 0) sats += Math.round((usd / btcRateUsd) * SATS_PER_BTC);
    return Math.round(sats);
  }

  function getSubtotalUsd() {
    return getCartTotalUsd();
  }

  function getTaxUsd() {
    return getSubtotalUsd() * (getTaxRate() / 100);
  }

  function getCustomerTotalUsd() {
    return getSubtotalUsd() + getTaxUsd() + customerTipUsd;
  }

  function getSettlementAmount() {
    const totalUsd = getCustomerTotalUsd();
    const settleEl = document.getElementById('settlement-currency');
    const settle = settleEl ? settleEl.value : 'USD';
    if (settle === 'sats' && btcRateUsd > 0) {
      const sats = Math.round((totalUsd / btcRateUsd) * SATS_PER_BTC);
      return { amount: sats, currency: 'sats', display: formatSats(sats) };
    }
    return { amount: totalUsd, currency: 'USD', display: formatUsd(totalUsd) };
  }

  function updateKeypadDisplay() {
    const el = document.getElementById('keypad-display');
    if (el) el.textContent = keypadAmount || '0';
  }

  function keypadInput(key) {
    if (key === 'back') {
      keypadAmount = keypadAmount.slice(0, -1) || '0';
      if (keypadAmount === '.' || keypadAmount.endsWith('.')) keypadAmount = keypadAmount.slice(0, -1) || '0';
      updateKeypadDisplay();
      return;
    }
    if (key === 'clear') {
      keypadAmount = '0';
      updateKeypadDisplay();
      return;
    }
    if (key === '.') {
      if (keypadAmount.includes('.')) return;
      if (keypadAmount === '0') keypadAmount = '0.';
      else keypadAmount += '.';
      updateKeypadDisplay();
      return;
    }
    if (key >= '0' && key <= '9') {
      if (keypadAmount === '0' && key !== '.') keypadAmount = key;
      else keypadAmount += key;
      updateKeypadDisplay();
    }
  }

  function keypadAddToBill() {
    if (!getDeveloperMode() && !getApiKey().trim()) {
      alert('API is needed. Add an API key in Settings to create invoices.');
      return;
    }
    const cur = document.getElementById('keypad-currency').value;
    const val = parseFloat(keypadAmount.replace(/,/g, ''));
    if (isNaN(val) || val <= 0) return;
    const labelInput = document.getElementById('keypad-item-label');
    const customLabel = labelInput ? labelInput.value.trim() : '';
    const label = customLabel || (cur === 'USD' ? formatUsd(val) : formatSats(val));
    cart.push({ id: generateId(), label, amount: val, currency: cur === 'sats' ? 'sats' : 'USD' });
    keypadAmount = '0';
    updateKeypadDisplay();
    if (labelInput) labelInput.value = '';
    renderCart();
  }

  function productButtonHtml(p) {
    const price = p.currency === 'USD' ? formatUsd(p.price) : formatSats(p.price);
    return `<button type="button" class="product-btn" data-product-id="${escapeAttr(p.id)}" data-name="${escapeAttr(p.name)}" data-price="${escapeAttr(String(p.price))}" data-currency="${escapeAttr(p.currency || 'USD')}"><span class="name">${escapeHtml(p.name)}</span><span class="price">${price}</span></button>`;
  }

  function renderProductCategoryTabs() {
    const categories = getCategories();
    const products = getProducts();
    const tabContainer = document.getElementById('product-category-tabs');
    if (!tabContainer) return;
    const hasUncategorized = products.some((p) => !p.categoryId);
    let html = '';
    categories.forEach((c) => {
      const count = products.filter((p) => p.categoryId === c.id).length;
      if (count === 0) return;
      const active = selectedCategoryId === c.id ? ' active' : '';
      html += `<button type="button" class="product-cat-tab${active}" data-category-id="${escapeAttr(c.id)}">${escapeHtml(c.name)}</button>`;
    });
    if (hasUncategorized) {
      const active = selectedCategoryId === '_none' ? ' active' : '';
      html += `<button type="button" class="product-cat-tab${active}" data-category-id="_none">Other</button>`;
    }
    html += `<button type="button" class="product-cat-tab${selectedCategoryId === null ? ' active' : ''}" data-category-id="">All</button>`;
    tabContainer.innerHTML = html;
    tabContainer.querySelectorAll('.product-cat-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.categoryId;
        selectedCategoryId = id === '' ? null : id;
        renderProductCategoryTabs();
        renderProductGrid();
      });
    });
  }

  function renderProductGrid() {
    const products = getProducts();
    const grid = document.getElementById('product-grid');
    const tabContainer = document.getElementById('product-category-tabs');
    if (!grid) return;
    if (products.length === 0) {
      grid.innerHTML = '<p class="text-muted">Add products in Settings.</p>';
      if (tabContainer) tabContainer.innerHTML = '';
      return;
    }
    let toShow = products;
    if (selectedCategoryId !== null) {
      toShow = selectedCategoryId === '_none' ? products.filter((p) => !p.categoryId) : products.filter((p) => p.categoryId === selectedCategoryId);
    }
    grid.innerHTML = '<div class="product-category-items">' + (toShow.length ? toShow.map((p) => productButtonHtml(p)).join('') : '<p class="text-muted">No products in this category.</p>') + '</div>';
  }

  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function addToCart(dataset) {
    const amount = parseFloat(dataset.price);
    const currency = dataset.currency === 'sats' ? 'sats' : 'USD';
    const label = dataset.name || (currency === 'USD' ? formatUsd(amount) : formatSats(amount));
    cart.push({ id: generateId(), label, amount, currency });
    renderCart();
  }

  function removeFromCart(id) {
    cart = cart.filter((x) => x.id !== id);
    renderCart();
  }

  function renderCart() {
    const list = document.getElementById('cart-items');
    list.innerHTML = cart
      .map(
        (line) =>
          `<li class="cart-item" data-id="${line.id}">
            <span class="label">${escapeHtml(line.label)}</span>
            <span class="amount">${line.currency === 'USD' ? formatUsd(line.amount) : formatSats(line.amount)}</span>
            <button type="button" class="cart-item-remove" aria-label="Remove">×</button>
          </li>`
      )
      .join('');
    list.querySelectorAll('.cart-item-remove').forEach((btn) => {
      btn.addEventListener('click', () => removeFromCart(btn.closest('.cart-item').dataset.id));
    });

    const totalUsd = getCartTotalUsd();
    const totalSats = getCartTotalSats();
    document.getElementById('total-usd').textContent = formatUsd(totalUsd);
    document.getElementById('total-sats').textContent = totalSats.toLocaleString();

    const payBtn = document.getElementById('pay-bitcoin');
    if (payBtn) payBtn.disabled = cart.length === 0;
    const readyBtn = document.getElementById('ready-for-payment');
    if (readyBtn) readyBtn.disabled = cart.length === 0;
  }

  function renderCustomerBill() {
    const list = document.getElementById('customer-bill-items');
    if (!list) return;
    list.innerHTML = cart.map((line) => `<li class="cart-item"><span class="label">${escapeHtml(line.label)}</span><span class="amount">${line.currency === 'USD' ? formatUsd(line.amount) : formatSats(line.amount)}</span></li>`).join('');
    const subtotal = getSubtotalUsd();
    const tax = getTaxUsd();
    const total = getCustomerTotalUsd();
    const subEl = document.getElementById('customer-subtotal');
    const taxEl = document.getElementById('customer-tax');
    const tipEl = document.getElementById('customer-tip');
    const totalEl = document.getElementById('customer-total');
    if (subEl) subEl.textContent = formatUsd(subtotal);
    if (taxEl) taxEl.textContent = formatUsd(tax);
    if (tipEl) tipEl.textContent = formatUsd(customerTipUsd);
    if (totalEl) totalEl.textContent = formatUsd(total);
  }

  function renderTipButtons() {
    const container = document.getElementById('tip-buttons');
    if (!container) return;
    const tips = getDefaultTipPercentages();
    const subtotal = getSubtotalUsd();
    container.innerHTML = tips.map((pct) => {
      const amount = (subtotal * (pct / 100)).toFixed(2);
      return `<button type="button" class="btn btn-ghost tip-pct-btn" data-pct="${pct}">${pct}% (${formatUsd(amount)})</button>`;
    }).join('');
    container.querySelectorAll('.tip-pct-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pct = parseFloat(btn.dataset.pct);
        customerTipUsd = getSubtotalUsd() * (pct / 100);
        document.getElementById('customer-tip-custom').value = '';
        renderCustomerBill();
        container.querySelectorAll('.tip-pct-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  function createInvoiceDirect(amount, currency, description) {
    const key = getApiKey();
    if (!key) return Promise.reject(new Error('Set API key in Settings'));
    const base = getSandbox() ? STRIKE_API_BASE_SANDBOX : STRIKE_API_BASE_PROD;
    let strikeCurrency = currency;
    let strikeAmount = amount;
    if (currency === 'sats') {
      strikeCurrency = 'BTC';
      strikeAmount = (parseInt(amount, 10) / SATS_PER_BTC).toFixed(8);
    }
    return fetch(base + '/v1/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
      },
      body: JSON.stringify({
        amount: { currency: strikeCurrency, amount: String(strikeAmount) },
        description: (description || 'POS sale').slice(0, 200),
        correlationId: generateId().slice(0, 40),
      }),
    })
      .then((r) => r.json())
      .then((inv) => {
        if (inv.invoiceId == null) throw new Error(inv.data?.message || 'Failed to create invoice');
        return fetch(base + '/v1/invoices/' + inv.invoiceId + '/quote', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + key },
        })
          .then((q) => q.json())
          .then((quote) => ({
            lnInvoice: quote.lnInvoice,
            expirationInSec: quote.expirationInSec,
            invoiceId: inv.invoiceId,
            expiration: quote.expiration,
          }));
      });
  }

  function getInvoiceStatus(invoiceId) {
    const key = getApiKey();
    if (!key) return Promise.resolve({ state: 'UNKNOWN' });
    const base = getSandbox() ? STRIKE_API_BASE_SANDBOX : STRIKE_API_BASE_PROD;
    return fetch(base + '/v1/invoices/' + encodeURIComponent(invoiceId), {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + key },
    }).then((r) => r.json()).then((inv) => ({ state: inv.state }));
  }

  function createInvoice(amount, currency, description) {
    return createInvoiceDirect(amount, currency, description);
  }

  let checkoutExpiryTimer = null;
  let checkoutStatusPoll = null;
  let currentCheckoutMarkPaid = null;

  function showCheckout(lnInvoice, expirationInSec, amountDisplay, invoiceId, saleSnapshot) {
    const modal = document.getElementById('checkout-modal');
    const expiryEl = document.getElementById('checkout-expiry');
    const statusEl = document.getElementById('checkout-status');
    document.getElementById('checkout-amount').textContent = amountDisplay;
    document.getElementById('checkout-lninvoice').value = lnInvoice || '';
    statusEl.textContent = 'Waiting for payment…';
    statusEl.classList.remove('checkout-status-paid');
    const viewReceiptBtn = document.getElementById('checkout-view-receipt');
    if (viewReceiptBtn) viewReceiptBtn.classList.add('hidden');
    const pretendPayBtn = document.getElementById('checkout-pretend-pay');
    if (pretendPayBtn) pretendPayBtn.classList.add('hidden');
    currentCheckoutMarkPaid = null;

    if (checkoutExpiryTimer) clearInterval(checkoutExpiryTimer);
    if (checkoutStatusPoll) clearInterval(checkoutStatusPoll);
    let secondsLeft = Math.max(0, Math.floor(expirationInSec || 0));
    function updateExpiry() {
      if (secondsLeft <= 0) {
        expiryEl.textContent = 'Invoice expired. Close and create a new one.';
        if (checkoutExpiryTimer) clearInterval(checkoutExpiryTimer);
        checkoutExpiryTimer = null;
        return;
      }
      expiryEl.textContent = 'Expires in ' + secondsLeft + ' second' + (secondsLeft !== 1 ? 's' : '');
      secondsLeft--;
    }
    updateExpiry();
    checkoutExpiryTimer = setInterval(updateExpiry, 1000);

    const qrWrap = document.getElementById('qr-wrap');
    qrWrap.innerHTML = '';
    if (!lnInvoice) {
      modal.classList.remove('hidden');
      return;
    }
    // Use local qrcodejs (avoids CDN MIME issues); renders into a container
    if (typeof QRCode !== 'undefined') {
      try {
        const container = document.createElement('div');
        container.setAttribute('aria-hidden', 'true');
        new QRCode(container, {
          text: lnInvoice,
          width: 280,
          height: 280,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H,
        });
        qrWrap.appendChild(container);
      } catch (err) {
        qrWrap.textContent = 'QR could not be generated. Use the invoice text below.';
      }
    } else {
      qrWrap.textContent = 'QR library not loaded. Copy the Lightning invoice below to pay.';
    }

    modal.classList.remove('hidden');

    if (invoiceId) {
      const totalUsd = (saleSnapshot && saleSnapshot.totalUsd) != null ? saleSnapshot.totalUsd : 0;
      addPendingInvoice(invoiceId, new Date().toISOString(), amountDisplay, totalUsd, saleSnapshot, lnInvoice, expirationInSec);
      function markPaid() {
        if (checkoutExpiryTimer) clearInterval(checkoutExpiryTimer);
        checkoutExpiryTimer = null;
        if (checkoutStatusPoll) clearInterval(checkoutStatusPoll);
        checkoutStatusPoll = null;
        statusEl.textContent = 'Payment received!';
        statusEl.classList.add('checkout-status-paid');
        removePendingInvoice(invoiceId);
        if (saleSnapshot) {
          const txnWithRate = { ...saleSnapshot, btcRateUsd };
          saveTransaction(txnWithRate);
          lastSaleSnapshot = txnWithRate;
          const viewReceiptBtn = document.getElementById('checkout-view-receipt');
          if (viewReceiptBtn) {
            viewReceiptBtn.classList.remove('hidden');
          }
        }
        cart = [];
        renderCart();
      }
      currentCheckoutMarkPaid = markPaid;
      if (getDeveloperMode() && pretendPayBtn) {
        pretendPayBtn.classList.remove('hidden');
      }
      function poll() {
        getInvoiceStatus(invoiceId).then(function (res) {
          if (res.state === 'PAID') markPaid();
        });
      }
      poll();
      checkoutStatusPoll = setInterval(poll, 2000);
    }
  }

  function hideCheckout() {
    currentCheckoutMarkPaid = null;
    if (checkoutExpiryTimer) {
      clearInterval(checkoutExpiryTimer);
      checkoutExpiryTimer = null;
    }
    if (checkoutStatusPoll) {
      clearInterval(checkoutStatusPoll);
      checkoutStatusPoll = null;
    }
    document.getElementById('checkout-modal').classList.add('hidden');
  }

  document.getElementById('ready-for-payment').addEventListener('click', () => {
    document.getElementById('pos-owner-panel').classList.add('hidden');
    document.getElementById('cart-panel').classList.add('hidden');
    document.getElementById('pos-customer-panel').classList.remove('hidden');
    customerTipUsd = 0;
    renderCustomerBill();
    renderTipButtons();
    document.getElementById('customer-tip-custom').value = '';
    document.getElementById('tip-buttons').querySelectorAll('.tip-pct-btn').forEach((b) => b.classList.remove('active'));
  });

  document.getElementById('customer-back').addEventListener('click', () => {
    document.getElementById('pos-owner-panel').classList.remove('hidden');
    document.getElementById('cart-panel').classList.remove('hidden');
    document.getElementById('pos-customer-panel').classList.add('hidden');
  });

  const customerTipCustom = document.getElementById('customer-tip-custom');
  if (customerTipCustom) {
    customerTipCustom.addEventListener('input', () => {
      const v = parseFloat(customerTipCustom.value);
      customerTipUsd = isNaN(v) || v < 0 ? 0 : v;
      document.getElementById('tip-buttons').querySelectorAll('.tip-pct-btn').forEach((b) => b.classList.remove('active'));
      renderCustomerBill();
    });
  }

  document.getElementById('pay-bitcoin-customer').addEventListener('click', () => {
    if (cart.length === 0) return;
    const subtotalUsd = getSubtotalUsd();
    const taxUsd = getTaxUsd();
    const totalUsd = getCustomerTotalUsd();
    lastSaleSnapshot = {
      items: cart.map((l) => ({ label: l.label, amount: l.amount, currency: l.currency })),
      subtotalUsd,
      taxUsd,
      tipUsd: customerTipUsd,
      totalUsd,
    };
    const { amount, currency, display } = getSettlementAmount();
    const payBtn = document.getElementById('pay-bitcoin-customer');
    payBtn.disabled = true;
    payBtn.textContent = 'Creating invoice…';
    const description = 'POS – ' + cart.map((l) => l.label).join(', ').slice(0, 180);
    createInvoice(amount, currency, description)
      .then((res) => {
        if (res.error) throw new Error(res.error);
        showCheckout(res.lnInvoice, res.expirationInSec, display, res.invoiceId, lastSaleSnapshot);
      })
      .catch((err) => {
        const msg = err.message || 'Failed to create invoice';
        const hint = /insufficient permissions|forbidden/i.test(msg)
          ? 'Your Strike API key does not have the required permissions. In the Strike Dashboard, edit your API key and enable these scopes: "Create invoice" (partner.invoice.create) and "Generate invoice quote" (partner.invoice.quote.generate). Then try again.'
          : msg;
        alert(hint);
      })
      .finally(() => {
        payBtn.disabled = false;
        payBtn.textContent = 'Pay with Bitcoin';
      });
  });

  document.getElementById('clear-cart').addEventListener('click', () => {
    cart = [];
    renderCart();
  });

  document.querySelectorAll('.keypad-btn[data-key]').forEach((btn) => {
    btn.addEventListener('click', () => keypadInput(btn.dataset.key));
  });
  document.getElementById('keypad-add').addEventListener('click', keypadAddToBill);

  document.getElementById('pos-show-menu').addEventListener('click', () => {
    document.getElementById('pos-keypad-panel').classList.add('hidden');
    document.getElementById('pos-menu-panel').classList.remove('hidden');
    document.getElementById('pos-show-menu').classList.add('hidden');
    selectedCategoryId = null;
    renderProductCategoryTabs();
    renderProductGrid();
  });
  document.getElementById('pos-menu-back').addEventListener('click', () => {
    document.getElementById('pos-keypad-panel').classList.remove('hidden');
    document.getElementById('pos-menu-panel').classList.add('hidden');
    document.getElementById('pos-show-menu').classList.remove('hidden');
  });

  (function () {
    const grid = document.getElementById('product-grid');
    if (grid) {
      grid.addEventListener('click', function (e) {
        const btn = e.target.closest('.product-btn');
        if (!btn) return;
        e.preventDefault();
        const name = btn.getAttribute('data-name');
        const price = btn.getAttribute('data-price');
        const currency = (btn.getAttribute('data-currency') || 'USD').toLowerCase();
        if (name != null && price != null) addToCart({ name, price, currency: currency === 'sats' ? 'sats' : 'USD' });
      });
    }
  })();


  document.getElementById('checkout-pretend-pay').addEventListener('click', () => {
    if (typeof currentCheckoutMarkPaid === 'function') currentCheckoutMarkPaid();
  });

  document.getElementById('checkout-close').addEventListener('click', hideCheckout);
  document.getElementById('checkout-done').addEventListener('click', () => {
    document.getElementById('pos-customer-panel').classList.add('hidden');
    document.getElementById('pos-owner-panel').classList.remove('hidden');
    document.getElementById('cart-panel').classList.remove('hidden');
    hideCheckout();
  });
  document.getElementById('checkout-view-receipt').addEventListener('click', () => {
    hideCheckout();
    document.getElementById('pos-customer-panel').classList.add('hidden');
    document.getElementById('pos-owner-panel').classList.remove('hidden');
    document.getElementById('cart-panel').classList.remove('hidden');
    showReceipt(lastSaleSnapshot);
    setView('receipt');
  });
  document.getElementById('checkout-copy').addEventListener('click', () => {
    const ta = document.getElementById('checkout-lninvoice');
    ta.select();
    document.execCommand('copy');
  });

  document.getElementById('checkout-modal').addEventListener('click', (e) => {
    if (e.target.id === 'checkout-modal') hideCheckout();
  });

  function showReceipt(snapshot) {
    if (!snapshot) return;
    const el = document.getElementById('receipt-content');
    if (!el) return;
    const businessName = getBusinessName() || 'Bitcoin Point-of-Sale';
    let html = '<p class="receipt-business-name">' + escapeHtml(businessName) + '</p><ul class="receipt-items">';
    snapshot.items.forEach((line) => {
      const amt = line.currency === 'USD' ? formatUsd(line.amount) : formatSats(line.amount);
      html += `<li><span>${escapeHtml(line.label)}</span><span>${amt}</span></li>`;
    });
    html += '</ul>';
    html += `<div class="receipt-totals"><div>Subtotal: ${formatUsd(snapshot.subtotalUsd)}</div><div>Tax: ${formatUsd(snapshot.taxUsd)}</div><div>Tip: ${formatUsd(snapshot.tipUsd)}</div><div class="receipt-total">Total: ${formatUsd(snapshot.totalUsd)}</div></div>`;
    const rateLine = formatReceiptRate(snapshot.btcRateUsd);
    if (rateLine) html += '<p class="receipt-rate-line">' + escapeHtml(rateLine) + '</p>';
    el.innerHTML = html;
  }

  function setView(viewId) {
    const settingsView = document.getElementById('view-settings');
    if (viewId !== 'settings' && settingsView) settingsView.classList.remove('settings-import-only');
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    const view = document.getElementById('view-' + viewId);
    const btn = document.querySelector('.nav-btn[data-view="' + viewId + '"]');
    if (view) view.classList.add('active');
    if (btn) btn.classList.add('active');
    if (viewId === 'pos') {
      updateKeypadDisplay();
      renderCart();
    }
    if (viewId === 'settings') {
      if (settingsImportOnly) {
        if (settingsView) settingsView.classList.add('settings-import-only');
        settingsImportOnly = false;
        const importSection = document.getElementById('settings-import-section');
        if (importSection) importSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      loadSettings();
      renderCategoryList();
      renderProductList();
    }
    if (viewId === 'reconciliation') {
      renderReconciliation();
    }
  }

  document.getElementById('receipt-print').addEventListener('click', () => window.print());
  document.getElementById('receipt-new-sale').addEventListener('click', () => {
    cart = [];
    customerTipUsd = 0;
    lastSaleSnapshot = null;
    renderCart();
    setView('pos');
  });

  function formatReceiptRate(btcRateUsd) {
    if (!btcRateUsd || btcRateUsd <= 0) return '';
    const satsPerDollar = Math.round(SATS_PER_BTC / btcRateUsd);
    return '1 BTC = ' + formatUsd(btcRateUsd) + ' · ' + satsPerDollar.toLocaleString() + ' sats/$';
  }

  function formatReceiptDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (_) { return iso; }
  }

  function renderReconciliation() {
    const periodEl = document.getElementById('recon-period');
    const period = periodEl ? periodEl.value : 'day';
    const txns = getTransactions();
    const now = new Date();
    let start;
    if (period === 'day') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      const d = now.getDate() - now.getDay();
      start = new Date(now.getFullYear(), now.getMonth(), d);
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const filtered = txns.filter((t) => new Date(t.date) >= start);
    let sales = 0, tips = 0, taxes = 0;
    filtered.forEach((t) => {
      sales += t.totalUsd || 0;
      tips += t.tipUsd || 0;
      taxes += t.taxUsd || 0;
    });
    const periodLabels = { day: 'Today', week: 'This week', month: 'This month' };
    currentReconData = { periodLabel: periodLabels[period] || period, sales, tips, taxes, receipts: filtered.slice().reverse() };
    const salesEl = document.getElementById('recon-sales');
    const tipsEl = document.getElementById('recon-tips');
    const taxesEl = document.getElementById('recon-taxes');
    if (salesEl) salesEl.textContent = formatUsd(sales);
    if (tipsEl) tipsEl.textContent = formatUsd(tips);
    if (taxesEl) taxesEl.textContent = formatUsd(taxes);
    const listEl = document.getElementById('recon-receipts-list');
    if (listEl) {
      if (filtered.length === 0) {
        listEl.innerHTML = '<p class="text-muted">No receipts in this period.</p>';
      } else {
        const reversed = filtered.slice().reverse();
        listEl.innerHTML = reversed
          .map(
            (t, i) => {
              const actualIdx = reversed.length - 1 - i;
              const txn = filtered[actualIdx];
              const tid = (txn && txn.id) || '';
              return `<div class="recon-receipt-row" data-transaction-id="${escapeAttr(tid)}" data-receipt-index="${actualIdx}">
                <div class="recon-receipt-slide">
                  <button type="button" class="recon-receipt-item">
                    <span class="recon-receipt-date">${escapeHtml(formatReceiptDate(t.date))}</span>
                    <span class="recon-receipt-total">${formatUsd(t.totalUsd || 0)}</span>
                  </button>
                </div>
                <button type="button" class="recon-receipt-delete" aria-label="Delete receipt">Delete</button>
              </div>`;
            }
          )
          .join('');
        listEl.querySelectorAll('.recon-receipt-row').forEach((row) => {
          const slide = row.querySelector('.recon-receipt-slide');
          const receiptBtn = row.querySelector('.recon-receipt-item');
          const deleteBtn = row.querySelector('.recon-receipt-delete');
          const receiptIndex = parseInt(row.dataset.receiptIndex, 10);
          let touchStartX = 0;
          let currentX = 0;
          const deleteWidth = 72;
          function setSlideX(x) {
            const clamped = Math.max(-deleteWidth, Math.min(0, x));
            currentX = clamped;
            if (slide) slide.style.transform = 'translateX(' + clamped + 'px)';
          }
          function openDelete() { setSlideX(-deleteWidth); }
          function closeDelete() { setSlideX(0); }
          function handleMove(clientX) {
            const dx = clientX - touchStartX;
            setSlideX(currentX + dx);
            touchStartX = clientX;
          }
          function handleEnd() {
            if (currentX < -deleteWidth / 2) openDelete();
            else closeDelete();
          }
          row.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
          }, { passive: true });
          row.addEventListener('touchmove', (e) => {
            handleMove(e.touches[0].clientX);
          }, { passive: true });
          row.addEventListener('touchend', handleEnd);
          row.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            touchStartX = e.clientX;
            const onMouseMove = (e2) => handleMove(e2.clientX);
            const onMouseUp = () => {
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
              handleEnd();
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          });
          receiptBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (Math.abs(currentX) < deleteWidth / 2) showReceiptDetailModal(filtered[receiptIndex]);
            else closeDelete();
          });
          deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const txn = filtered[receiptIndex];
            if (txn && confirm('Delete this receipt?')) {
              deleteTransaction(txn);
              renderReconciliation();
            }
          });
        });
      }
    }
    const showPendingEl = document.getElementById('recon-show-pending-invoices');
    const pendingWrapEl = document.getElementById('recon-pending-list-wrap');
    if (pendingWrapEl) pendingWrapEl.classList.toggle('hidden', !(showPendingEl && showPendingEl.checked));
    renderPendingInvoicesList();
  }

  function renderPendingInvoicesList() {
    const listEl = document.getElementById('recon-pending-list');
    const wrapEl = document.getElementById('recon-pending-list-wrap');
    if (!listEl || !wrapEl || wrapEl.classList.contains('hidden')) return;
    const pending = getPendingInvoices();
    if (pending.length === 0) {
      listEl.innerHTML = '<p class="text-muted">No pending unpaid invoices.</p>';
      return;
    }
    listEl.innerHTML = pending
      .map(
        (p) =>
          `<div class="recon-pending-row" data-invoice-id="${escapeAttr(p.invoiceId)}">
            <button type="button" class="recon-pending-view">
              <span class="recon-pending-date">${escapeHtml(formatReceiptDate(p.date))}</span>
              <span class="recon-pending-amount">${escapeHtml(p.amountDisplay || formatUsd(p.totalUsd || 0))}</span>
            </button>
            <button type="button" class="btn btn-ghost btn-sm recon-pending-remove" aria-label="Remove from list">Remove</button>
          </div>`
      )
      .join('');
    listEl.querySelectorAll('.recon-pending-view').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.recon-pending-row');
        const id = row && row.dataset.invoiceId;
        if (!id) return;
        const p = getPendingInvoices().find((x) => x.invoiceId === id);
        if (!p) return;
        if (p.lnInvoice) {
          showCheckout(
            p.lnInvoice,
            p.expirationInSec != null ? p.expirationInSec : 0,
            p.amountDisplay || formatUsd(p.totalUsd || 0),
            p.invoiceId,
            p.saleSnapshot || null
          );
        } else {
          alert('Invoice details no longer available. This invoice may have been created before the app was updated.');
        }
      });
    });
    listEl.querySelectorAll('.recon-pending-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.recon-pending-row');
        const id = row && row.dataset.invoiceId;
        if (id) {
          const list = getPendingInvoices().filter((p) => p.invoiceId !== id);
          savePendingInvoices(list);
          renderPendingInvoicesList();
        }
      });
    });
  }

  function showReceiptDetailModal(txn) {
    currentReceiptTxn = txn;
    const el = document.getElementById('receipt-detail-content');
    if (!el || !txn) return;
    const businessName = getBusinessName() || 'Bitcoin Point-of-Sale';
    let html = '<p class="receipt-business-name">' + escapeHtml(businessName) + '</p><ul class="receipt-items">';
    (txn.items || []).forEach((line) => {
      const amt = line.currency === 'USD' ? formatUsd(line.amount) : formatSats(line.amount);
      html += `<li><span>${escapeHtml(line.label)}</span><span>${amt}</span></li>`;
    });
    html += '</ul>';
    html += `<div class="receipt-totals"><div>Subtotal: ${formatUsd(txn.subtotalUsd || 0)}</div><div>Tax: ${formatUsd(txn.taxUsd || 0)}</div><div>Tip: ${formatUsd(txn.tipUsd || 0)}</div><div class="receipt-total">Total: ${formatUsd(txn.totalUsd || 0)}</div></div>`;
    const rateLine = formatReceiptRate(txn.btcRateUsd);
    if (rateLine) html += '<p class="receipt-rate-line">' + escapeHtml(rateLine) + '</p>';
    html += `<p class="text-muted receipt-detail-date">${escapeHtml(formatReceiptDate(txn.date))}</p>`;
    el.innerHTML = html;
    document.getElementById('receipt-detail-modal').classList.remove('hidden');
  }

  function escapeUrlForAttr(url) {
    return String(url).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function printReceipt(txn) {
    const businessName = getBusinessName() || 'Bitcoin Point-of-Sale';
    const headerImageUrl = getHeaderImageUrl();
    let html = '<div class="receipt-print-document">';
    html += '<div class="receipt-print-header">';
    html += '<div class="receipt-print-header-text">';
    html += '<h1 class="receipt-print-title">' + escapeHtml(businessName) + '</h1>';
    html += '<p class="receipt-print-subtitle">Receipt</p>';
    html += '<p class="receipt-print-date">' + escapeHtml(formatReceiptDate(txn.date)) + '</p>';
    const rateLine = formatReceiptRate(txn.btcRateUsd);
    if (rateLine) html += '<p class="receipt-print-rate">' + escapeHtml(rateLine) + '</p>';
    html += '</div>';
    if (headerImageUrl) html += '<img class="receipt-print-logo" src="' + escapeUrlForAttr(headerImageUrl) + '" alt="" />';
    html += '</div>';
    html += '<table class="receipt-print-table"><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody>';
    (txn.items || []).forEach((line) => {
      const amt = line.currency === 'USD' ? formatUsd(line.amount) : formatSats(line.amount);
      html += '<tr><td>' + escapeHtml(line.label) + '</td><td>' + amt + '</td></tr>';
    });
    html += '</tbody></table>';
    html += '<div class="receipt-print-totals">';
    html += '<div class="receipt-print-totals-row">Subtotal <span>' + formatUsd(txn.subtotalUsd || 0) + '</span></div>';
    html += '<div class="receipt-print-totals-row">Tax <span>' + formatUsd(txn.taxUsd || 0) + '</span></div>';
    html += '<div class="receipt-print-totals-row">Tip <span>' + formatUsd(txn.tipUsd || 0) + '</span></div>';
    html += '<div class="receipt-print-total">Total <span>' + formatUsd(txn.totalUsd || 0) + '</span></div>';
    html += '</div>';
    html += '<p class="receipt-print-thanks">Thank you</p>';
    html += '</div>';
    const area = document.getElementById('receipt-print-area');
    if (area) {
      area.innerHTML = html;
      area.classList.remove('hidden');
      document.body.classList.add('printing-receipt');
      window.print();
      document.body.classList.remove('printing-receipt');
      area.classList.add('hidden');
      area.innerHTML = '';
    }
  }

  function hideReceiptDetailModal() {
    document.getElementById('receipt-detail-modal').classList.add('hidden');
  }

  function printReconciliation() {
    if (!currentReconData) return;
    const businessName = getBusinessName() || 'Bitcoin Point-of-Sale';
    const d = currentReconData;
    const generatedDate = formatReceiptDate(new Date().toISOString());
    const receiptsWithRate = (d.receipts || []).filter((t) => t.btcRateUsd && t.btcRateUsd > 0);
    let avgBtcRateUsd = 0;
    if (receiptsWithRate.length > 0) {
      const totalWeight = receiptsWithRate.reduce((s, t) => s + (t.totalUsd || 0), 0);
      if (totalWeight > 0) {
        avgBtcRateUsd = receiptsWithRate.reduce((s, t) => s + (t.btcRateUsd || 0) * (t.totalUsd || 0), 0) / totalWeight;
      } else {
        avgBtcRateUsd = receiptsWithRate.reduce((s, t) => s + (t.btcRateUsd || 0), 0) / receiptsWithRate.length;
      }
    }
    const avgRateLine = avgBtcRateUsd > 0
      ? '1 BTC = ' + formatUsd(avgBtcRateUsd) + ' · ' + Math.round(SATS_PER_BTC / avgBtcRateUsd).toLocaleString() + ' sats/$ (weighted avg from ' + receiptsWithRate.length + ' receipt' + (receiptsWithRate.length !== 1 ? 's' : '') + ')'
      : '';
    const headerImageUrl = getHeaderImageUrl();
    let html = '<div class="recon-print-document">';
    html += '<div class="recon-print-header">';
    html += '<div class="recon-print-header-text">';
    html += '<h1 class="recon-print-title">' + escapeHtml(businessName) + '</h1>';
    html += '<p class="recon-print-subtitle">Reconciliation</p>';
    html += '<p class="recon-print-period">' + escapeHtml(d.periodLabel) + '</p>';
    html += '<p class="recon-print-generated">Generated ' + escapeHtml(generatedDate) + '</p>';
    if (avgRateLine) html += '<p class="recon-print-avg-rate">' + escapeHtml(avgRateLine) + '</p>';
    html += '</div>';
    if (headerImageUrl) html += '<img class="recon-print-logo" src="' + escapeUrlForAttr(headerImageUrl) + '" alt="" />';
    html += '</div>';
    html += '<div class="recon-print-summary">';
    html += '<div class="recon-print-row">Sales <span>' + formatUsd(d.sales) + '</span></div>';
    html += '<div class="recon-print-row">Tips <span>' + formatUsd(d.tips) + '</span></div>';
    html += '<div class="recon-print-row">Taxes <span>' + formatUsd(d.taxes) + '</span></div>';
    html += '</div>';
    html += '<table class="recon-print-table"><thead><tr><th>Date</th><th>Total</th></tr></thead><tbody>';
    (d.receipts || []).forEach((t) => {
      html += '<tr><td>' + escapeHtml(formatReceiptDate(t.date)) + '</td><td>' + formatUsd(t.totalUsd || 0) + '</td></tr>';
    });
    html += '</tbody></table>';
    html += '<p class="recon-print-count">' + (d.receipts ? d.receipts.length : 0) + ' receipt(s)</p>';
    html += '</div>';
    const area = document.getElementById('recon-print-area');
    if (area) {
      area.innerHTML = html;
      area.classList.remove('hidden');
      document.body.classList.add('printing-reconciliation');
      window.print();
      document.body.classList.remove('printing-reconciliation');
      area.classList.add('hidden');
      area.innerHTML = '';
    }
  }

  document.getElementById('recon-period').addEventListener('change', renderReconciliation);
  const reconShowPendingCheckbox = document.getElementById('recon-show-pending-invoices');
  if (reconShowPendingCheckbox) {
    reconShowPendingCheckbox.addEventListener('change', () => {
      const wrap = document.getElementById('recon-pending-list-wrap');
      if (wrap) wrap.classList.toggle('hidden', !reconShowPendingCheckbox.checked);
      renderPendingInvoicesList();
    });
  }
  document.getElementById('recon-export-pdf').addEventListener('click', printReconciliation);
  document.getElementById('recon-print-btn').addEventListener('click', printReconciliation);
  document.getElementById('receipt-detail-close').addEventListener('click', hideReceiptDetailModal);
  document.getElementById('receipt-detail-close-btn').addEventListener('click', hideReceiptDetailModal);
  document.getElementById('receipt-detail-modal').addEventListener('click', (e) => {
    if (e.target.id === 'receipt-detail-modal') hideReceiptDetailModal();
  });

  document.getElementById('receipt-export-pdf').addEventListener('click', () => {
    if (currentReceiptTxn) printReceipt(currentReceiptTxn);
  });
  document.getElementById('receipt-print-btn').addEventListener('click', () => {
    if (currentReceiptTxn) printReceipt(currentReceiptTxn);
  });

  let pendingProtectedViewId = null;

  function showPinModal(forViewId) {
    pendingProtectedViewId = forViewId;
    const modal = document.getElementById('pin-modal');
    const input = document.getElementById('pin-input');
    const errEl = document.getElementById('pin-error');
    if (input) input.value = '';
    if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); errEl.classList.remove('pin-error-incorrect'); }
    if (modal) modal.classList.remove('hidden');
    if (input) setTimeout(() => input.focus(), 100);
  }

  function hidePinModal() {
    pendingProtectedViewId = null;
    const modal = document.getElementById('pin-modal');
    if (modal) modal.classList.add('hidden');
  }

  function tryNavigateTo(viewId) {
    if (!getProtectEnabled() || viewId === 'pos') {
      setView(viewId);
      return;
    }
    if (viewId === 'reconciliation' || viewId === 'settings') {
      showPinModal(viewId);
      return;
    }
    setView(viewId);
  }

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => tryNavigateTo(btn.dataset.view));
  });
  const headerBusinessName = document.getElementById('header-business-name');
  if (headerBusinessName) headerBusinessName.addEventListener('click', () => setView('pos'));

  function renderProductList() {
    const products = getProducts();
    const categories = getCategories();
    const list = document.getElementById('product-list');
    const catMap = {};
    categories.forEach((c) => { catMap[c.id] = c.name; });
    const catOptions = '<option value="">— None —</option>' + categories.map((c) => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.name)}</option>`).join('');
    list.innerHTML = products
      .map((p) => {
        if (editingProductId === p.id) {
          const catOpts = categories.map((c) => `<option value="${escapeAttr(c.id)}"${p.categoryId === c.id ? ' selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
          return `<li class="inline-edit-row product-inline-row">
            <input type="text" class="product-inline-name" value="${escapeAttr(p.name)}" placeholder="Name" maxlength="100" />
            <select class="product-inline-category"><option value="">— None —</option>${catOpts}</select>
            <input type="number" class="product-inline-price" value="${escapeAttr(p.price)}" placeholder="Price" min="0" step="any" />
            <select class="product-inline-currency">
              <option value="USD"${p.currency === 'USD' ? ' selected' : ''}>USD</option>
              <option value="sats"${p.currency === 'sats' ? ' selected' : ''}>sats</option>
            </select>
            <div class="product-list-actions">
              <button type="button" class="btn btn-ghost btn-sm product-inline-cancel">Cancel</button>
              <button type="button" class="btn btn-primary btn-sm product-inline-save" data-product-id="${escapeAttr(p.id)}">Save</button>
            </div>
          </li>`;
        }
        return `<li>
            <span class="name">${escapeHtml(p.name)}</span>
            <span class="product-list-cat">${escapeHtml(catMap[p.categoryId] || '—')}</span>
            <span class="price">${p.currency === 'USD' ? formatUsd(p.price) : formatSats(p.price)}</span>
            <div class="product-list-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-edit="${escapeAttr(p.id)}">Edit</button>
              <button type="button" class="btn btn-ghost btn-sm" data-delete="${escapeAttr(p.id)}">Delete</button>
            </div>
          </li>`;
      })
      .join('');
    list.querySelectorAll('[data-edit]').forEach((b) => {
      b.addEventListener('click', () => {
        editingProductId = b.dataset.edit;
        renderProductList();
      });
    });
    list.querySelectorAll('[data-delete]').forEach((b) => {
      b.addEventListener('click', () => deleteProduct(b.dataset.delete));
    });
    list.querySelectorAll('.product-inline-save').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.productId;
        const row = b.closest('li');
        const name = (row.querySelector('.product-inline-name') || {}).value;
        const price = (row.querySelector('.product-inline-price') || {}).value;
        const categoryId = (row.querySelector('.product-inline-category') || {}).value || null;
        const currency = (row.querySelector('.product-inline-currency') || {}).value || 'USD';
        if (!name || !name.trim() || !price || !price.trim()) return;
        const products = getProducts();
        const i = products.findIndex((x) => x.id === id);
        if (i >= 0) {
          products[i] = { ...products[i], name: name.trim(), price: price.trim(), currency, categoryId: categoryId || undefined };
          saveProducts(products);
        }
        editingProductId = null;
        renderProductList();
        renderProductGrid();
      });
    });
    list.querySelectorAll('.product-inline-cancel').forEach((b) => {
      b.addEventListener('click', () => {
        editingProductId = null;
        renderProductList();
      });
    });
    const catSelect = document.getElementById('product-category');
    if (catSelect) {
      catSelect.innerHTML = '<option value="">— None —</option>' + categories.map((c) => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.name)}</option>`).join('');
    }
  }

  function renderCategoryList() {
    const categories = getCategories();
    const list = document.getElementById('category-list');
    if (!list) return;
    list.innerHTML = categories
      .map((c) => {
        if (editingCategoryId === c.id) {
          return `<li class="inline-edit-row">
            <input type="text" class="inline-edit-input category-inline-name" value="${escapeAttr(c.name)}" placeholder="Category name" maxlength="80" data-category-id="${escapeAttr(c.id)}" />
            <div class="product-list-actions">
              <button type="button" class="btn btn-ghost btn-sm category-inline-cancel">Cancel</button>
              <button type="button" class="btn btn-primary btn-sm category-inline-save" data-category-id="${escapeAttr(c.id)}">Save</button>
            </div>
          </li>`;
        }
        return `<li>
            <span class="name">${escapeHtml(c.name)}</span>
            <div class="product-list-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-edit-cat="${escapeAttr(c.id)}">Edit</button>
              <button type="button" class="btn btn-ghost btn-sm" data-delete-cat="${escapeAttr(c.id)}">Delete</button>
            </div>
          </li>`;
      })
      .join('');
    list.querySelectorAll('[data-edit-cat]').forEach((b) => {
      b.addEventListener('click', () => {
        editingCategoryId = b.dataset.editCat;
        renderCategoryList();
      });
    });
    list.querySelectorAll('[data-delete-cat]').forEach((b) => {
      b.addEventListener('click', () => deleteCategory(b.dataset.deleteCat));
    });
    list.querySelectorAll('.category-inline-save').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.categoryId;
        const input = b.closest('li') && b.closest('li').querySelector('.category-inline-name');
        const name = (input && input.value) ? input.value.trim() : '';
        if (!name) return;
        const categories = getCategories();
        const i = categories.findIndex((x) => x.id === id);
        if (i >= 0) {
          categories[i] = { ...categories[i], name };
          saveCategories(categories);
        }
        editingCategoryId = null;
        renderCategoryList();
        renderProductList();
        renderProductGrid();
      });
    });
    list.querySelectorAll('.category-inline-cancel').forEach((b) => {
      b.addEventListener('click', () => {
        editingCategoryId = null;
        renderCategoryList();
      });
    });
  }

  function openCategoryForm(id) {
    editingCategoryId = id || null;
    const form = document.getElementById('category-form');
    document.getElementById('category-form-title').textContent = id ? 'Edit category' : 'Add category';
    if (id) {
      const c = getCategories().find((x) => x.id === id);
      if (c) document.getElementById('category-name').value = c.name;
    } else {
      document.getElementById('category-name').value = '';
    }
    form.classList.remove('hidden');
  }

  function closeCategoryForm() {
    document.getElementById('category-form').classList.add('hidden');
    editingCategoryId = null;
  }

  function saveCategory() {
    const name = document.getElementById('category-name').value.trim();
    if (!name) return;
    const categories = getCategories();
    if (editingCategoryId) {
      const i = categories.findIndex((c) => c.id === editingCategoryId);
      if (i >= 0) categories[i] = { ...categories[i], name };
    } else {
      categories.push({ id: generateId(), name });
    }
    saveCategories(categories);
    const saveBtn = document.getElementById('category-form-save');
    if (saveBtn) {
      const orig = saveBtn.textContent;
      saveBtn.textContent = 'Saved!';
      saveBtn.classList.add('save-feedback');
      saveBtn.disabled = true;
      setTimeout(() => {
        closeCategoryForm();
        renderCategoryList();
        renderProductList();
        renderProductGrid();
        saveBtn.textContent = orig;
        saveBtn.classList.remove('save-feedback');
        saveBtn.disabled = false;
      }, 800);
    } else {
      closeCategoryForm();
      renderCategoryList();
      renderProductList();
      renderProductGrid();
    }
  }

  function deleteCategory(id) {
    if (!confirm('Delete this category? Products in it will be uncategorized.')) return;
    const categories = getCategories().filter((c) => c.id !== id);
    saveCategories(categories);
    const products = getProducts().map((p) => (p.categoryId === id ? { ...p, categoryId: null } : p));
    saveProducts(products);
    renderCategoryList();
    renderProductList();
    renderProductGrid();
  }

  document.getElementById('add-category-btn').addEventListener('click', () => openCategoryForm(null));
  document.getElementById('category-form-cancel').addEventListener('click', closeCategoryForm);
  document.getElementById('category-form-save').addEventListener('click', saveCategory);

  function openProductForm(id) {
    editingProductId = id || null;
    const form = document.getElementById('product-form');
    document.getElementById('product-form-title').textContent = id ? 'Edit product' : 'Add product';
    const catSelect = document.getElementById('product-category');
    if (catSelect) {
      catSelect.innerHTML = '<option value="">— None —</option>' + getCategories().map((c) => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.name)}</option>`).join('');
    }
    if (id) {
      const p = getProducts().find((x) => x.id === id);
      if (p) {
        document.getElementById('product-name').value = p.name;
        document.getElementById('product-price').value = p.price;
        document.getElementById('product-currency').value = p.currency;
        if (catSelect) catSelect.value = p.categoryId || '';
      }
    } else {
      document.getElementById('product-name').value = '';
      document.getElementById('product-price').value = '';
      document.getElementById('product-currency').value = 'USD';
      if (catSelect) catSelect.value = '';
    }
    form.classList.remove('hidden');
  }

  function closeProductForm() {
    document.getElementById('product-form').classList.add('hidden');
    editingProductId = null;
  }

  function saveProduct() {
    const name = document.getElementById('product-name').value.trim();
    const price = document.getElementById('product-price').value.trim();
    const currency = document.getElementById('product-currency').value;
    const categoryId = (document.getElementById('product-category') || {}).value || null;
    if (!name || !price) return;
    const products = getProducts();
    if (editingProductId) {
      const i = products.findIndex((p) => p.id === editingProductId);
      if (i >= 0) products[i] = { ...products[i], name, price, currency, categoryId: categoryId || undefined };
    } else {
      products.push({ id: generateId(), name, price, currency, categoryId: categoryId || undefined });
    }
    saveProducts(products);
    const saveBtn = document.getElementById('product-form-save');
    if (saveBtn) {
      const orig = saveBtn.textContent;
      saveBtn.textContent = 'Saved!';
      saveBtn.classList.add('save-feedback');
      saveBtn.disabled = true;
      setTimeout(() => {
        closeProductForm();
        renderProductList();
        renderProductGrid();
        saveBtn.textContent = orig;
        saveBtn.classList.remove('save-feedback');
        saveBtn.disabled = false;
      }, 800);
    } else {
      closeProductForm();
      renderProductList();
      renderProductGrid();
    }
  }

  function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    const products = getProducts().filter((p) => p.id !== id);
    saveProducts(products);
    renderProductList();
    renderProductGrid();
  }

  document.getElementById('add-product-btn').addEventListener('click', () => openProductForm(null));
  document.getElementById('product-form-cancel').addEventListener('click', closeProductForm);
  document.getElementById('product-form-save').addEventListener('click', saveProduct);

  function loadSettings() {
    const bizEl = document.getElementById('settings-business-name');
    if (bizEl) bizEl.value = getBusinessName();
    const headerImgEl = document.getElementById('settings-header-image-url');
    if (headerImgEl) headerImgEl.value = getHeaderImageUrl();
    document.getElementById('settings-api-key').value = getApiKey();
    const devEl = document.getElementById('settings-developer-mode');
    if (devEl) devEl.checked = getDeveloperMode();
    const protectEl = document.getElementById('settings-protect-enabled');
    const pinFields = document.getElementById('settings-protect-pin-fields');
    const pinSetMsg = document.getElementById('settings-protect-pin-set-msg');
    if (protectEl) protectEl.checked = getProtectEnabled();
    if (pinFields) pinFields.classList.toggle('hidden', !getProtectEnabled());
    if (pinSetMsg) {
      const hasPin = getProtectEnabled() && getPinHash();
      pinSetMsg.classList.toggle('hidden', !hasPin);
      if (hasPin) pinSetMsg.textContent = 'PIN is set.';
    }
    const pinLabel = document.getElementById('settings-protect-pin-label');
    if (pinLabel) pinLabel.textContent = getPinHash() ? 'Change 4-digit PIN' : 'Set 4-digit PIN';
    const taxEl = document.getElementById('settings-tax-rate');
    if (taxEl) taxEl.value = getTaxRate();
    const tipEl = document.getElementById('settings-tip-percentages');
    if (tipEl) tipEl.value = getDefaultTipPercentages().join(', ');
  }

  function resetApp() {
    Object.keys(STORAGE_KEYS).forEach((k) => localStorage.removeItem(STORAGE_KEYS[k]));
    sessionStorage.removeItem(SESSION_UNLOCKED);
    window.location.reload();
  }

  const SETTINGS_EXPORT_KEYS = ['businessName', 'headerImageUrl', 'products', 'categories', 'apiKey', 'sandbox', 'developerMode', 'taxRate', 'tipPercentages'];

  function getExportData(scope) {
    const data = { version: 1, exportedAt: new Date().toISOString(), scope };
    if (scope === 'transactions' || scope === 'all') {
      data.transactions = getTransactions();
    }
    if (scope === 'settings' || scope === 'all') {
      data.settings = {};
      SETTINGS_EXPORT_KEYS.forEach((k) => {
        const raw = localStorage.getItem(STORAGE_KEYS[k]);
        if (raw != null) data.settings[k] = raw;
      });
    }
    return data;
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function deriveKey(password, salt) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']).then((keyMaterial) =>
      crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      )
    );
  }

  function encryptExport(data, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    return deriveKey(password, salt).then((key) =>
      crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded).then((cipher) => ({
        encrypted: true,
        salt: Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join(''),
        iv: Array.from(iv).map((b) => b.toString(16).padStart(2, '0')).join(''),
        data: btoa(String.fromCharCode.apply(null, new Uint8Array(cipher))),
      }))
    );
  }

  function decryptExport(enc) {
    const password = (document.getElementById('import-password') || {}).value || '';
    const salt = new Uint8Array(enc.salt.match(/.{2}/g).map((h) => parseInt(h, 16)));
    const iv = new Uint8Array(enc.iv.match(/.{2}/g).map((h) => parseInt(h, 16)));
    const cipher = Uint8Array.from(atob(enc.data), (c) => c.charCodeAt(0));
    return deriveKey(password, salt).then((key) =>
      crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher).then((dec) => {
        return JSON.parse(new TextDecoder().decode(dec));
      })
    );
  }

  function buildImportSummary(data) {
    const parts = [];
    if (data.transactions && data.transactions.length >= 0) {
      parts.push('Reconciliation &amp; receipts: ' + (data.transactions.length) + ' transaction(s)');
    }
    if (data.settings && Object.keys(data.settings).length > 0) {
      parts.push('Settings: business name, products, categories, API, tax &amp; tips, etc.');
    }
    return parts.length ? parts.join('<br />') : 'No data in backup.';
  }

  function applyImport(data) {
    if (data.transactions) {
      localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(data.transactions));
    }
    if (data.settings) {
      Object.keys(data.settings).forEach((k) => {
        if (STORAGE_KEYS[k] != null) localStorage.setItem(STORAGE_KEYS[k], data.settings[k]);
      });
    }
    setProtectEnabled(false);
    setPinHash('');
  }

  function updateExportPasswordState() {
    const format = document.getElementById('export-format').value;
    const feedback = document.getElementById('export-password-feedback');
    const exportBtn = document.getElementById('export-btn');
    const pwd = (document.getElementById('export-password') || {}).value;
    const conf = (document.getElementById('export-password-confirm') || {}).value;
    if (format !== 'encrypted') {
      if (feedback) { feedback.textContent = ''; feedback.classList.add('hidden'); feedback.classList.remove('export-password-match', 'export-password-mismatch'); }
      if (exportBtn) exportBtn.disabled = false;
      return;
    }
    if (!pwd && !conf) {
      if (feedback) { feedback.textContent = ''; feedback.classList.add('hidden'); feedback.classList.remove('export-password-match', 'export-password-mismatch'); }
      if (exportBtn) exportBtn.disabled = true;
      return;
    }
    if (pwd === conf && pwd.length > 0) {
      if (feedback) {
        feedback.textContent = 'Passwords match.';
        feedback.classList.remove('hidden');
        feedback.classList.remove('export-password-mismatch');
        feedback.classList.add('export-password-match');
      }
      if (exportBtn) exportBtn.disabled = false;
    } else {
      if (feedback) {
        feedback.textContent = 'Passwords don\'t match.';
        feedback.classList.remove('hidden');
        feedback.classList.remove('export-password-match');
        feedback.classList.add('export-password-mismatch');
      }
      if (exportBtn) exportBtn.disabled = true;
    }
  }

  document.getElementById('export-format').addEventListener('change', () => {
    const wrap = document.getElementById('export-password-wrap');
    const isEncrypted = document.getElementById('export-format').value === 'encrypted';
    if (wrap) wrap.classList.toggle('hidden', !isEncrypted);
    updateExportPasswordState();
  });
  document.getElementById('export-password').addEventListener('input', updateExportPasswordState);
  document.getElementById('export-password-confirm').addEventListener('input', updateExportPasswordState);

  function exportFilename(scope, encrypted) {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const scopeLabel = scope === 'transactions' ? 'reconciliation' : scope === 'settings' ? 'settings' : 'reconciliation-and-settings';
    const ext = encrypted ? 'enc' : 'json';
    return 'strike-pos-' + scopeLabel + '-' + date + '-' + time + '.' + ext;
  }

  document.getElementById('export-btn').addEventListener('click', () => {
    const scope = document.getElementById('export-scope').value;
    const format = document.getElementById('export-format').value;
    const encrypted = format === 'encrypted';
    const feedback = document.getElementById('export-password-feedback');
    if (format === 'encrypted') {
      const pwd = (document.getElementById('export-password') || {}).value;
      const conf = (document.getElementById('export-password-confirm') || {}).value;
      if (!pwd) {
        if (feedback) { feedback.textContent = 'Enter a password.'; feedback.classList.remove('hidden'); feedback.classList.add('export-password-mismatch'); feedback.classList.remove('export-password-match'); return; }
      }
      if (pwd !== conf) return;
      const data = getExportData(scope);
      encryptExport(data, pwd).then((enc) => {
        const blob = new Blob([JSON.stringify(enc)], { type: 'application/json' });
        downloadBlob(blob, exportFilename(scope, true));
      });
    } else {
      const data = getExportData(scope);
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      downloadBlob(blob, exportFilename(scope, false));
    }
  });

  let pendingImportData = null;

  document.getElementById('import-btn').addEventListener('click', () => {
    const fileInput = document.getElementById('import-file');
    if (!fileInput || !fileInput.files.length) return;
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (parsed.encrypted === true) {
          pendingImportData = parsed;
          document.getElementById('import-password').value = '';
          document.getElementById('import-password-error').textContent = '';
          document.getElementById('import-password-error').classList.add('hidden');
          document.getElementById('import-password-modal').classList.remove('hidden');
        } else {
          pendingImportData = parsed;
          showImportSummaryModal(parsed);
        }
      } catch (e) {
        alert('Invalid backup file.');
      }
    };
    reader.readAsText(file);
  });

  function showImportSummaryModal(data) {
    const content = document.getElementById('import-summary-content');
    if (content) content.innerHTML = '<p>This backup contains:</p><p>' + buildImportSummary(data) + '</p>';
    const warnEl = document.getElementById('import-overwrite-warning');
    if (warnEl) {
      const parts = [];
      if (data.transactions) parts.push('Reconciliation &amp; receipts');
      if (data.settings && Object.keys(data.settings).length > 0) parts.push('Settings');
      if (parts.length === 0) {
        warnEl.innerHTML = 'No data to import.';
      } else {
        warnEl.innerHTML = '<strong>Only the sections in this backup will overwrite your current data:</strong> ' + parts.join(' and ') + '. Other data is left unchanged.';
      }
    }
    pendingImportData = data;
    document.getElementById('import-summary-modal').classList.remove('hidden');
  }

  document.getElementById('import-password-cancel').addEventListener('click', () => {
    pendingImportData = null;
    document.getElementById('import-password-modal').classList.add('hidden');
  });
  document.getElementById('import-password-submit').addEventListener('click', () => {
    const errEl = document.getElementById('import-password-error');
    if (!pendingImportData) return;
    decryptExport(pendingImportData)
      .then((data) => {
        if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
        document.getElementById('import-password-modal').classList.add('hidden');
        showImportSummaryModal(data);
      })
      .catch(() => {
        if (errEl) { errEl.textContent = 'Wrong password or invalid file.'; errEl.classList.remove('hidden'); }
      });
  });

  document.getElementById('import-summary-cancel').addEventListener('click', () => {
    pendingImportData = null;
    document.getElementById('import-summary-modal').classList.add('hidden');
  });
  document.getElementById('import-summary-confirm').addEventListener('click', () => {
    if (pendingImportData) {
      applyImport(pendingImportData);
      pendingImportData = null;
      document.getElementById('import-summary-modal').classList.add('hidden');
      document.getElementById('import-file').value = '';
      location.reload();
    }
  });

  function showSaveFeedback(btnElOrId) {
    const btn = typeof btnElOrId === 'string' ? document.getElementById(btnElOrId) : btnElOrId;
    if (!btn) return;
    const originalText = btn.textContent;
    btn.textContent = 'Saved!';
    btn.classList.add('save-feedback');
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('save-feedback');
      btn.disabled = false;
    }, 2000);
  }

  document.getElementById('settings-save-business').addEventListener('click', () => {
    const name = (document.getElementById('settings-business-name') || {}).value || '';
    const headerImgUrl = (document.getElementById('settings-header-image-url') || {}).value || '';
    setBusinessName(name);
    setHeaderImageUrl(headerImgUrl);
    updateBusinessNameDisplay();
    showSaveFeedback('settings-save-business');
  });

  const settingsDeveloperCheckbox = document.getElementById('settings-developer-mode');
  if (settingsDeveloperCheckbox) {
    settingsDeveloperCheckbox.addEventListener('change', () => {
      setDeveloperMode(settingsDeveloperCheckbox.checked);
    });
  }

  const protectCheckbox = document.getElementById('settings-protect-enabled');
  const protectPinFields = document.getElementById('settings-protect-pin-fields');
  const confirmWrap = document.getElementById('settings-protect-pin-confirm-wrap');
  const pinInput = document.getElementById('settings-protect-pin');
  function revertToSetPin() {
    if (pinInput) pinInput.value = '';
    const pinConf = document.getElementById('settings-protect-pin-confirm');
    if (pinConf) pinConf.value = '';
    if (confirmWrap) confirmWrap.classList.add('hidden');
    const feedback = document.getElementById('settings-protect-pin-error');
    if (feedback) { feedback.textContent = ''; feedback.classList.add('hidden'); feedback.classList.remove('protect-pin-success', 'protect-pin-error-mismatch'); }
  }

  function checkConfirmAndSave() {
    const pin = (document.getElementById('settings-protect-pin') || {}).value;
    const confirm = (document.getElementById('settings-protect-pin-confirm') || {}).value;
    const feedback = document.getElementById('settings-protect-pin-error');
    if (!/^\d{4}$/.test(pin) || !/^\d{4}$/.test(confirm)) return;
    if (pin !== confirm) {
      if (feedback) {
        feedback.textContent = 'PINs do not match.';
        feedback.classList.remove('hidden');
        feedback.classList.remove('protect-pin-success');
        feedback.classList.add('protect-pin-error-mismatch');
      }
      setTimeout(revertToSetPin, 2000);
      return;
    }
    if (feedback) {
      feedback.textContent = 'PINs match.';
      feedback.classList.remove('hidden');
      feedback.classList.remove('protect-pin-error-mismatch');
      feedback.classList.add('protect-pin-success');
    }
    setTimeout(() => {
      hashPin(pin).then((hash) => {
        setPinHash(hash);
        setProtectEnabled(true);
        if (feedback) { feedback.textContent = ''; feedback.classList.add('hidden'); feedback.classList.remove('protect-pin-success'); }
        if (pinInput) pinInput.value = '';
        const pinConf = document.getElementById('settings-protect-pin-confirm');
        if (pinConf) pinConf.value = '';
        if (confirmWrap) confirmWrap.classList.add('hidden');
        const pinSetMsg = document.getElementById('settings-protect-pin-set-msg');
        if (pinSetMsg) { pinSetMsg.textContent = 'PIN is set.'; pinSetMsg.classList.remove('hidden'); }
        const pinLabel = document.getElementById('settings-protect-pin-label');
        if (pinLabel) pinLabel.textContent = 'Change 4-digit PIN';
      });
    }, 2000);
  }

  if (pinInput) {
    pinInput.addEventListener('input', () => {
      const val = pinInput.value;
      const feedback = document.getElementById('settings-protect-pin-error');
      if (confirmWrap) confirmWrap.classList.toggle('hidden', val.length !== 4);
      if (val.length !== 4) {
        const pinConf = document.getElementById('settings-protect-pin-confirm');
        if (pinConf) pinConf.value = '';
        if (feedback) { feedback.textContent = ''; feedback.classList.add('hidden'); feedback.classList.remove('protect-pin-success', 'protect-pin-error-mismatch'); }
      }
    });
  }
  const pinConfirmInput = document.getElementById('settings-protect-pin-confirm');
  if (pinConfirmInput) {
    pinConfirmInput.addEventListener('input', () => {
      if (pinConfirmInput.value.length === 4) checkConfirmAndSave();
    });
  }
  if (protectCheckbox) {
    protectCheckbox.addEventListener('change', () => {
      if (protectPinFields) protectPinFields.classList.toggle('hidden', !protectCheckbox.checked);
      if (!protectCheckbox.checked) {
        setProtectEnabled(false);
        revertToSetPin();
        const pinSetMsg = document.getElementById('settings-protect-pin-set-msg');
        if (pinSetMsg) pinSetMsg.classList.add('hidden');
        const pinLabel = document.getElementById('settings-protect-pin-label');
        if (pinLabel) pinLabel.textContent = 'Set 4-digit PIN';
      }
    });
  }

  document.getElementById('pin-cancel').addEventListener('click', hidePinModal);
  document.getElementById('pin-modal').addEventListener('click', (e) => {
    if (e.target.id === 'pin-modal') hidePinModal();
  });
  document.getElementById('pin-submit').addEventListener('click', () => {
    const input = document.getElementById('pin-input');
    const errEl = document.getElementById('pin-error');
    const pin = (input && input.value) || '';
    if (!/^\d{4}$/.test(pin)) {
      if (errEl) { errEl.textContent = 'Enter your 4-digit PIN.'; errEl.classList.remove('hidden'); }
      return;
    }
    verifyPin(pin).then((ok) => {
      if (!ok) {
        if (input) input.value = '';
        if (errEl) {
          errEl.textContent = 'Incorrect PIN.';
          errEl.classList.remove('hidden');
          errEl.classList.add('pin-error-incorrect');
          setTimeout(() => {
            errEl.textContent = '';
            errEl.classList.add('hidden');
            errEl.classList.remove('pin-error-incorrect');
          }, 2500);
        }
        return;
      }
      const viewId = pendingProtectedViewId;
      hidePinModal();
      if (viewId) setView(viewId);
    });
  });
  document.getElementById('pin-forgot').addEventListener('click', () => {
    hidePinModal();
    document.getElementById('forgot-pin-modal').classList.remove('hidden');
  });
  document.getElementById('forgot-pin-close').addEventListener('click', () => {
    document.getElementById('forgot-pin-modal').classList.add('hidden');
  });
  document.getElementById('forgot-pin-modal').addEventListener('click', (e) => {
    if (e.target.id === 'forgot-pin-modal') document.getElementById('forgot-pin-modal').classList.add('hidden');
  });
  document.getElementById('forgot-pin-import').addEventListener('click', () => {
    document.getElementById('forgot-pin-modal').classList.add('hidden');
    hidePinModal();
    settingsImportOnly = true;
    setView('settings');
  });
  document.getElementById('settings-reset-app').addEventListener('click', () => {
    if (!confirm('Reset the app and clear ALL data? This cannot be undone.')) return;
    resetApp();
  });

  document.getElementById('settings-save').addEventListener('click', () => {
    const key = document.getElementById('settings-api-key').value.trim();
    localStorage.setItem(STORAGE_KEYS.apiKey, key);
    localStorage.setItem(STORAGE_KEYS.sandbox, 'false');
    fetchBtcRate();
    showSaveFeedback('settings-save');
  });

  document.getElementById('settings-save-tax-tips').addEventListener('click', () => {
    const taxStr = (document.getElementById('settings-tax-rate') || {}).value || '0';
    const tipStr = (document.getElementById('settings-tip-percentages') || {}).value || '15, 20';
    const taxRate = parseFloat(taxStr);
    const tips = tipStr.split(',').map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n) && n > 0);
    saveTaxAndTips(isNaN(taxRate) ? 0 : taxRate, tips.length ? tips : [15, 20]);
    showSaveFeedback('settings-save-tax-tips');
  });

  fetchBtcRate();
  setInterval(fetchBtcRate, 60 * 1000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  updateBusinessNameDisplay();
  updateHeaderImageDisplay();
  updateHeaderBtcPrice();
  setView('pos');
  renderCart();

  if (!getApiKey().trim()) {
    document.getElementById('no-api-key-modal').classList.remove('hidden');
  }
  document.getElementById('no-api-key-dismiss').addEventListener('click', function () {
    document.getElementById('no-api-key-modal').classList.add('hidden');
  });
  document.getElementById('no-api-key-settings').addEventListener('click', function () {
    document.getElementById('no-api-key-modal').classList.add('hidden');
    setView('settings');
  });
  document.getElementById('no-api-key-modal').addEventListener('click', function (e) {
    if (e.target.id === 'no-api-key-modal') document.getElementById('no-api-key-modal').classList.add('hidden');
  });
})();
