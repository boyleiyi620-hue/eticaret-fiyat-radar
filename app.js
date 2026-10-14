'use strict';

const SUPABASE_URL = 'https://inicelmrjrvklrgitxiq.supabase.co';
// Supabase publishable key: public client key; database access is restricted by RLS.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rsWlREUKEpf21mO9dwsCcQ_KmNLjmWj';
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const INSTALL_DISMISSED_KEY = 'fiyat-radar-install-dismissed';
const MARKETPLACES = [
  { id: 'amazon', name: 'Amazon Türkiye', mark: 'a', domain: 'amazon.com.tr', search: (q) => `https://www.amazon.com.tr/s?k=${encodeURIComponent(q)}` },
  { id: 'trendyol', name: 'Trendyol', mark: 't', domain: 'trendyol.com', search: (q) => `https://www.trendyol.com/sr?q=${encodeURIComponent(q)}` },
  { id: 'hepsiburada', name: 'Hepsiburada', mark: 'h', domain: 'hepsiburada.com', search: (q) => `https://www.hepsiburada.com/ara?q=${encodeURIComponent(q)}` },
  { id: 'n11', name: 'n11', mark: 'n', domain: 'n11.com', search: (q) => `https://www.n11.com/arama?q=${encodeURIComponent(q)}` }
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const toast = $('#toast');
const authScreen = $('#auth-screen');
const appShell = $('#app-shell');
const installBanner = $('#install-banner');
const installMessage = $('#install-message');
const aiApiKeyInput = $('#ai-api-key');
const chatLog = $('#chat-log');
const supabaseClient = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

let signedInUser = null;
let trackedProducts = [];
let marketplaceOffers = [];
let geminiApiKey = '';
let authMode = 'signin';
let currentView = 'dashboard';
let activeMarket = 'all';
let highestFirst = true;
let deferredPrompt = null;
let videoScenes = [];
let videoUrl = '';
let toastTimer = null;
let userLoadSequence = 0;
const chatHistory = [];

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
}

function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
}

function formatDate(value, short = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tarih yok';
  return date.toLocaleString('tr-TR', short ? { day: '2-digit', month: 'short' } : { dateStyle: 'short', timeStyle: 'short' });
}

function normalizeProductKey(title) {
  return String(title || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

function marketplaceById(id) {
  return MARKETPLACES.find((marketplace) => marketplace.id === id) || null;
}

function marketplaceFromUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return MARKETPLACES.find((marketplace) => hostname === marketplace.domain || hostname.endsWith(`.${marketplace.domain}`)) || null;
  } catch {
    return null;
  }
}

function trustedProductUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Geçerli bir ürün bağlantısı gir.');
  }
  if (url.protocol !== 'https:') throw new Error('Mağaza bağlantısı HTTPS olmalı.');
  const marketplace = marketplaceFromUrl(url.href);
  if (!marketplace) throw new Error('Bağlantı Amazon Türkiye, Trendyol, Hepsiburada veya n11 ilanı olmalı.');
  return { url: url.href, marketplace };
}

function searchUrl(marketplaceId, productName) {
  const marketplace = marketplaceById(marketplaceId);
  return marketplace ? marketplace.search(productName) : '#';
}

function openView(view) {
  const available = ['dashboard', 'watchlist', 'assistant', 'video', 'settings'];
  currentView = available.includes(view) ? view : 'dashboard';
  for (const name of available) {
    const section = $(`#${name}-view`);
    if (section) section.hidden = name !== currentView;
  }
  $$('.nav-item').forEach((button) => {
    const selected = button.dataset.view === currentView;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-current', selected ? 'page' : 'false');
  });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function setAuthMessage(message, isError = false) {
  const output = $('#auth-message');
  output.textContent = message;
  output.classList.toggle('auth-error', isError);
  output.classList.toggle('auth-success', !isError && Boolean(message));
}

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === 'signup';
  $('#auth-title').textContent = isSignup ? 'Ücretsiz hesabını oluştur.' : 'Tekrar hoş geldin.';
  $('#auth-description').textContent = isSignup
    ? 'Ürün ve mağaza fiyatlarını hesabında saklamak için hesap oluştur.'
    : 'Hesabına giriş yaparak fiyat listene devam et.';
  $('#auth-name-field').hidden = !isSignup;
  $('#auth-name').required = isSignup;
  $('#auth-password').autocomplete = isSignup ? 'new-password' : 'current-password';
  $('#auth-submit').textContent = isSignup ? 'Hesap oluştur' : 'Giriş yap';
  $('#auth-mode-toggle').textContent = isSignup ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Ücretsiz hesap oluştur';
  setAuthMessage('');
}

function isAppInstalled() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isInstallBannerDismissed() {
  try { return localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true'; }
  catch { return false; }
}

function hideInstallBanner(remember = false) {
  installBanner.hidden = true;
  toast.classList.remove('install-offset');
  if (remember) {
    try { localStorage.setItem(INSTALL_DISMISSED_KEY, 'true'); } catch { /* PWA installation does not depend on local storage. */ }
  }
}

function showInstallBanner(message) {
  if (!signedInUser || isAppInstalled() || isInstallBannerDismissed()) return;
  installMessage.textContent = message;
  installBanner.hidden = false;
}

function installHint() {
  const isSafari = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (deferredPrompt) return 'Uygulamayı ana ekrana eklemek için aşağıdaki düğmeye bas.';
  if (isSafari) return 'Safari’de Paylaş simgesine dokunup “Ana Ekrana Ekle” seçeneğini seç.';
  return 'Uygulamayı ana ekrana ekleyerek hızlı erişim sağlayabilirsin.';
}

async function renderAuthenticatedUser(user) {
  const previousUserId = signedInUser?.id || null;
  signedInUser = user || null;
  if (previousUserId !== (signedInUser?.id || null)) {
    chatHistory.length = 0;
    chatLog.replaceChildren();
    appendChatMessage('Merhaba! Kaydettiğin fiyatları karşılaştırmana veya ürün seçme ölçütlerini düşünmene yardımcı olabilirim. Gerçek zamanlı mağaza fiyatlarını kendim göremem.');
  }
  authScreen.hidden = Boolean(signedInUser);
  appShell.hidden = !signedInUser;

  if (!signedInUser) {
    trackedProducts = [];
    marketplaceOffers = [];
    $('#watchlist-items').replaceChildren();
    renderDashboard();
    $('#sync-status').textContent = 'Giriş yapılmadı';
    hideInstallBanner();
    return;
  }

  const displayName = signedInUser.user_metadata?.full_name || signedInUser.email || 'Hesabım';
  $('#profile-name').textContent = displayName;
  $('#profile-avatar').textContent = displayName.split(/[\s@]+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toLocaleUpperCase('tr-TR');
  openView(currentView);
  showInstallBanner(installHint());

  if (previousUserId !== signedInUser.id) await loadUserData();
}

async function loadUserData() {
  if (!supabaseClient || !signedInUser) return;
  const requestSequence = ++userLoadSequence;
  const userId = signedInUser.id;
  $('#sync-status').textContent = 'Fiyat listen yükleniyor…';
  $('#watchlist-summary').textContent = 'Takip listen yükleniyor…';
  try {
    const [trackedResult, offersResult] = await Promise.all([
      supabaseClient.from('tracked_products')
        .select('id, title, product_url, target_price, created_at')
        .order('created_at', { ascending: false }).limit(500),
      supabaseClient.from('marketplace_offers')
        .select('id, product_key, product_name, marketplace, product_url, price, observed_at')
        .order('observed_at', { ascending: false }).limit(1000)
    ]);
    if (trackedResult.error) throw trackedResult.error;
    if (offersResult.error) throw offersResult.error;
    if (requestSequence !== userLoadSequence || signedInUser?.id !== userId) return;
    trackedProducts = trackedResult.data || [];
    marketplaceOffers = offersResult.data || [];
    $('#sync-status').textContent = 'Supabase ile eşitlendi';
    renderDashboard();
    renderWatchlist();
  } catch (error) {
    if (requestSequence !== userLoadSequence) return;
    $('#sync-status').textContent = 'Veritabanı bağlantısı gerekli';
    $('#watchlist-summary').textContent = `Liste yüklenemedi: ${error.message}`;
    showToast(`Ürün/fiyat listesi yüklenemedi: ${error.message}`);
  }
}

function groupOffers() {
  const groups = new Map();
  for (const offer of marketplaceOffers) {
    const key = offer.product_key || normalizeProductKey(offer.product_name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { key, name: offer.product_name || 'Ürün', offers: [] });
    const group = groups.get(key);
    if (!group.name && offer.product_name) group.name = offer.product_name;
    group.offers.push(offer);
  }
  return [...groups.values()].map((group) => {
    group.offers.sort((a, b) => Number(a.price) - Number(b.price));
    const prices = group.offers.map((offer) => Number(offer.price)).filter(Number.isFinite);
    group.lowest = prices.length ? Math.min(...prices) : null;
    group.highest = prices.length ? Math.max(...prices) : null;
    group.difference = prices.length > 1 ? group.highest - group.lowest : 0;
    group.percent = group.lowest > 0 ? group.difference / group.lowest * 100 : 0;
    return group;
  });
}

function makeStoreMark(marketplace) {
  const mark = document.createElement('span');
  mark.className = `store-mark ${marketplace.id}`;
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = marketplace.mark;
  return mark;
}

function makeExternalLink(href, text, className = '') {
  const link = document.createElement('a');
  try {
    const safeUrl = new URL(href, window.location.origin);
    link.href = ['https:', 'http:'].includes(safeUrl.protocol) ? safeUrl.href : '#';
  } catch {
    link.href = '#';
  }
  link.target = '_blank';
  link.rel = 'noopener noreferrer nofollow';
  link.textContent = text;
  if (className) link.className = className;
  return link;
}

function addStoreSearchLinks(container, title, marketplaces = MARKETPLACES) {
  for (const marketplace of marketplaces) {
    container.append(makeExternalLink(marketplace.search(title), `${marketplace.name}’de ara`));
  }
}

function renderDealCard(group) {
  const article = document.createElement('article');
  article.className = 'deal';
  article.dataset.market = group.offers.map((offer) => offer.marketplace).join(' ');
  article.dataset.title = group.name;

  const top = document.createElement('div');
  top.className = 'deal-top';
  const titleBlock = document.createElement('div');
  const title = document.createElement('h3');
  title.className = 'deal-title';
  title.textContent = group.name;
  const meta = document.createElement('p');
  meta.className = 'deal-meta';
  meta.textContent = `${group.offers.length} mağazada fiyat · Son kontrol: ${formatDate(group.offers[0]?.observed_at)}`;
  titleBlock.append(title, meta);
  const badge = document.createElement('span');
  badge.className = `deal-diff${group.offers.length < 2 ? ' none' : ''}`;
  badge.textContent = group.offers.length < 2 ? `En yüksek ${formatPrice(group.highest)}` : `${formatPrice(group.difference)} fark · ${group.percent.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}%`;
  top.append(titleBlock, badge);
  article.append(top);

  const offersGrid = document.createElement('div');
  offersGrid.className = 'offers-grid';
  for (const offer of group.offers) {
    const marketplace = marketplaceById(offer.marketplace);
    if (!marketplace) continue;
    const card = document.createElement('div');
    card.className = 'offer-card';
    const head = document.createElement('div');
    head.className = 'offer-head';
    const name = document.createElement('span');
    name.className = 'store-name';
    name.textContent = marketplace.name;
    head.append(makeStoreMark(marketplace), name);
    const price = document.createElement('div');
    price.className = 'store-price';
    price.textContent = formatPrice(offer.price);
    const observed = document.createElement('div');
    observed.className = 'offer-date';
    observed.textContent = `Kaydedildi: ${formatDate(offer.observed_at)}`;
    const productLink = makeExternalLink(offer.product_url, 'İlanı mağazada aç', 'offer-link');
    card.append(head, price, observed, productLink);
    offersGrid.append(card);
  }
  article.append(offersGrid);

  if (group.offers.length > 1) {
    const comparison = document.createElement('p');
    comparison.className = 'deal-meta';
    comparison.style.margin = '9px 0 0';
    comparison.textContent = `En düşük ${formatPrice(group.lowest)} · en yüksek ${formatPrice(group.highest)} · fark ${formatPrice(group.difference)}`;
    article.append(comparison);
  }

  const actions = document.createElement('div');
  actions.className = 'deal-actions';
  const addOffer = document.createElement('button');
  addOffer.type = 'button';
  addOffer.className = 'secondary-btn';
  addOffer.dataset.addOffer = group.key;
  addOffer.dataset.title = group.name;
  addOffer.textContent = '+ Mağaza fiyatı ekle';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger-btn';
  remove.dataset.deleteProduct = group.key;
  remove.dataset.title = group.name;
  remove.textContent = 'Ürünü kaldır';
  actions.append(addOffer, remove);
  article.append(actions);

  const searchLinks = document.createElement('div');
  searchLinks.className = 'store-search-links';
  searchLinks.setAttribute('aria-label', `${group.name} ürününü mağazalarda ara`);
  addStoreSearchLinks(searchLinks, group.name);
  article.append(searchLinks);
  return article;
}

function updateStats(groups) {
  const totalOffers = marketplaceOffers.length;
  const comparisons = groups.filter((group) => group.offers.length > 1);
  const largest = comparisons.reduce((best, group) => !best || group.difference > best.difference ? group : best, null);
  const latest = marketplaceOffers.reduce((best, offer) => !best || new Date(offer.observed_at) > new Date(best.observed_at) ? offer : best, null);
  $('#stat-tracked').textContent = String(trackedProducts.length);
  $('#stat-offers').textContent = String(totalOffers);
  $('#stat-gap').textContent = largest ? formatPrice(largest.difference) : '—';
  $('#stat-gap-foot').textContent = largest ? largest.name : 'En az iki mağaza fiyatı gerekir';
  $('#stat-updated').textContent = latest ? formatDate(latest.observed_at, true) : '—';
}

function renderDashboard() {
  const list = $('#product-list');
  if (!list) return;
  const groups = groupOffers();
  updateStats(groups);
  const query = ($('#search')?.value || '').trim().toLocaleLowerCase('tr-TR');
  const visible = groups.filter((group) => {
    const marketMatch = activeMarket === 'all' || group.offers.some((offer) => offer.marketplace === activeMarket);
    const textMatch = group.name.toLocaleLowerCase('tr-TR').includes(query);
    return marketMatch && textMatch;
  }).sort((a, b) => highestFirst ? b.difference - a.difference : a.difference - b.difference);
  list.replaceChildren(...visible.map(renderDealCard));
  $('#result-count').textContent = `${visible.length} ürün · ${visible.reduce((sum, group) => sum + group.offers.length, 0)} fiyat kaydı`;
  $('#empty-state').style.display = groups.length && visible.length ? 'none' : 'block';
  if (!groups.length) $('#empty-state').querySelector('p').textContent = 'Henüz karşılaştırılacak fiyat yok.';
  else if (!visible.length) $('#empty-state').querySelector('p').textContent = 'Bu arama veya mağaza filtresiyle eşleşen ürün yok.';
}

function renderWatchlist() {
  const list = $('#watchlist-items');
  if (!list) return;
  const groups = groupOffers();
  $('#watchlist-summary').textContent = trackedProducts.length
    ? `${trackedProducts.length} ürün takip listende. Mağaza fiyatları el ile doğrulanır.`
    : 'Henüz ürün eklemedin.';
  $('#watchlist-empty').style.display = trackedProducts.length ? 'none' : 'block';
  list.replaceChildren();
  for (const product of trackedProducts) {
    const key = normalizeProductKey(product.title);
    const offers = groups.find((group) => group.key === key)?.offers || [];
    const item = document.createElement('article');
    item.className = 'tracked-product';
    const info = document.createElement('div');
    const link = makeExternalLink(product.product_url, product.title);
    const description = document.createElement('p');
    const target = product.target_price === null || product.target_price === undefined
      ? 'Hedef fiyat belirlenmedi'
      : `Hedef ${formatPrice(product.target_price)}`;
    description.textContent = `${target} · ${offers.length} fiyat kaydı · Eklendi ${formatDate(product.created_at, true)}`;
    info.append(link, description);
    const actions = document.createElement('div');
    actions.className = 'tracked-actions';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'secondary-btn';
    add.dataset.addOffer = key;
    add.dataset.title = product.title;
    add.textContent = '+ Fiyat ekle';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger-btn';
    remove.dataset.deleteProduct = key;
    remove.dataset.title = product.title;
    remove.textContent = 'Kaldır';
    actions.append(add, remove);
    item.append(info, actions);
    const links = document.createElement('div');
    links.className = 'store-search-links';
    addStoreSearchLinks(links, product.title);
    item.append(links);
    list.append(item);
  }
}

function openProductModal(title = '', marketplaceId = '') {
  const form = $('#product-form');
  form.reset();
  $('#product-title').value = title;
  if (marketplaceById(marketplaceId)) $('#marketplace-select').value = marketplaceId;
  $('#modal').classList.add('open');
  setTimeout(() => $('#product-title').focus(), 0);
}

function closeProductModal() {
  $('#modal').classList.remove('open');
}

async function removeProductGroup(key, title) {
  if (!signedInUser || !supabaseClient) return;
  if (!window.confirm(`“${title}” ürünü ve bu ürüne kaydedilmiş tüm mağaza fiyatları silinsin mi?`)) return;
  try {
    const { error: offerError } = await supabaseClient.from('marketplace_offers')
      .delete().eq('user_id', signedInUser.id).eq('product_key', key);
    if (offerError) throw offerError;
    const matchingRows = trackedProducts.filter((product) => normalizeProductKey(product.title) === key);
    for (const product of matchingRows) {
      const { error } = await supabaseClient.from('tracked_products')
        .delete().eq('user_id', signedInUser.id).eq('id', product.id);
      if (error) throw error;
    }
    await loadUserData();
    showToast('Ürün ve fiyat kayıtları kaldırıldı.');
  } catch (error) {
    showToast(`Ürün kaldırılamadı: ${error.message}`);
    await loadUserData();
  }
}

async function saveOffer(event) {
  event.preventDefault();
  if (!signedInUser || !supabaseClient) {
    showToast('Fiyat kaydetmek için hesabına giriş yap.');
    return;
  }
  const title = $('#product-title').value.trim();
  const selectedMarketplace = $('#marketplace-select').value;
  const enteredPrice = Number($('#product-price').value);
  const targetValue = $('#target-price').value.trim();
  const targetPrice = targetValue ? Number(targetValue) : null;
  if (!title || title.length > 200) return showToast('Ürün adı 1–200 karakter olmalı.');
  if (!Number.isFinite(enteredPrice) || enteredPrice <= 0) return showToast('Görünen fiyat sıfırdan büyük olmalı.');
  if (targetValue && (!Number.isFinite(targetPrice) || targetPrice <= 0)) return showToast('Hedef fiyat sıfırdan büyük olmalı.');

  let productUrl;
  let urlMarketplace;
  try {
    const checked = trustedProductUrl($('#product-url').value.trim());
    productUrl = checked.url;
    urlMarketplace = checked.marketplace;
  } catch (error) {
    showToast(error.message);
    $('#product-url').focus();
    return;
  }
  if (urlMarketplace.id !== selectedMarketplace) {
    showToast(`Bu bağlantı ${urlMarketplace.name} adresine ait. Mağaza seçimini kontrol et.`);
    $('#marketplace-select').value = urlMarketplace.id;
    return;
  }

  const submit = $('#product-submit');
  submit.disabled = true;
  submit.textContent = 'Kaydediliyor…';
  const productKey = normalizeProductKey(title);
  if (!productKey) {
    submit.disabled = false;
    submit.textContent = 'Fiyatı kaydet ve karşılaştır';
    showToast('Ürün adından geçerli bir anahtar oluşturulamadı.');
    return;
  }
  try {
    const existingProduct = trackedProducts.find((product) => normalizeProductKey(product.title) === productKey);
    if (!existingProduct) {
      const { data, error } = await supabaseClient.from('tracked_products').insert({
        user_id: signedInUser.id,
        title,
        product_url: productUrl,
        target_price: targetPrice
      }).select('id, title, product_url, target_price, created_at').single();
      if (error) throw error;
      trackedProducts.unshift(data);
    } else if (targetPrice !== null && Number(existingProduct.target_price) !== targetPrice) {
      const { error } = await supabaseClient.from('tracked_products').update({ target_price: targetPrice })
        .eq('user_id', signedInUser.id).eq('id', existingProduct.id);
      if (error) throw error;
    }

    const { error: offerError } = await supabaseClient.from('marketplace_offers').upsert({
      user_id: signedInUser.id,
      product_key: productKey,
      product_name: title,
      marketplace: selectedMarketplace,
      product_url: productUrl,
      price: enteredPrice,
      observed_at: new Date().toISOString()
    }, { onConflict: 'user_id,product_key,marketplace' });
    if (offerError) throw offerError;

    closeProductModal();
    await loadUserData();
    showToast(`“${title}” · ${marketplaceById(selectedMarketplace).name} fiyatı kaydedildi.`);
  } catch (error) {
    showToast(`Fiyat kaydedilemedi: ${error.message}`);
    await loadUserData();
  } finally {
    submit.disabled = false;
    submit.textContent = 'Fiyatı kaydet ve karşılaştır';
  }
}

function setAssistantState(message, connected = false) {
  const state = $('#assistant-state');
  state.textContent = message;
  state.classList.toggle('connected', connected);
  $('#gemini-help').textContent = message;
}

function geminiErrorMessage(status, data) {
  const detail = data?.error?.message || data?.message || `HTTP ${status}`;
  if (status === 400 || status === 401) return `API anahtarı geçersiz veya istek biçimi hatalı. ${detail}`;
  if (status === 403) return `Google bu anahtara Gemini API erişimi vermedi. AI Studio anahtarının ve Generative Language API erişiminin açık olduğunu kontrol et. ${detail}`;
  if (status === 404) return `Gemini modeli bu anahtarla kullanılamıyor. ${detail}`;
  if (status === 429) return `Google Gemini ücretsiz istek kotası dolmuş olabilir; daha sonra tekrar dene. ${detail}`;
  return `Gemini isteği başarısız (${status}). ${detail}`;
}

async function sendGeminiRequest(key, contents, generationConfig = {}) {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const url = isLocal
    ? `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
    : '/api/gemini';
  const headers = { 'Content-Type': 'application/json' };
  let body;
  if (isLocal) {
    headers['x-goog-api-key'] = key;
    body = JSON.stringify({ contents, generationConfig });
  } else {
    body = JSON.stringify({ apiKey: key, model: GEMINI_MODEL, contents, generationConfig });
  }

  let response;
  try {
    response = await fetch(url, { method: 'POST', headers, body });
  } catch {
    throw new Error('Gemini servisine ulaşılamadı. İnternet bağlantını ve uygulama adresini kontrol et.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(geminiErrorMessage(response.status, data));
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) throw new Error(data.promptFeedback?.blockReason
    ? `Google isteği güvenlik nedeniyle engelledi (${data.promptFeedback.blockReason}).`
    : 'Gemini boş yanıt verdi. Başka bir mesajla tekrar dene.');
  return text;
}

async function validateGeminiKey(key) {
  await sendGeminiRequest(key, [{ role: 'user', parts: [{ text: 'Yalnızca OK yaz.' }] }], { maxOutputTokens: 12, temperature: 0 });
}

function getGeminiKey() {
  if (!geminiApiKey) {
    showToast('Önce Ayarlar’dan ücretsiz Gemini API anahtarını bu sekmeye bağla.');
    openView('settings');
    aiApiKeyInput.focus();
    return null;
  }
  return geminiApiKey;
}

function appendChatMessage(message, className = '') {
  const item = document.createElement('div');
  item.className = `chat-message ${className}`.trim();
  item.textContent = message;
  chatLog.append(item);
  chatLog.scrollTop = chatLog.scrollHeight;
  return item;
}

function savedPriceContext() {
  if (!marketplaceOffers.length) return 'Kullanıcının kaydedilmiş, doğrulanmış fiyatı henüz yok.';
  return groupOffers().slice(0, 30).map((group) => {
    const offers = group.offers.map((offer) => `${marketplaceById(offer.marketplace)?.name || offer.marketplace}: ${formatPrice(offer.price)} (kayıt ${formatDate(offer.observed_at)})`).join('; ');
    return `${group.name}: ${offers}`;
  }).join('\n');
}

function parseSceneJson(answer) {
  const start = answer.indexOf('[');
  const end = answer.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('AI yanıtında storyboard JSON dizisi bulunamadı.');
  const scenes = JSON.parse(answer.slice(start, end + 1));
  if (!Array.isArray(scenes) || scenes.length < 3 || scenes.length > 6) throw new Error('AI 3–6 sahnelik bir taslak döndürmedi.');
  return scenes.map((scene) => ({ title: String(scene?.title || '').trim(), text: String(scene?.text || '').trim() }))
    .filter((scene) => scene.title && scene.text)
    .slice(0, 6);
}

function renderStoryboard(scenes) {
  const board = $('#storyboard');
  board.replaceChildren();
  scenes.forEach((scene, index) => {
    const card = document.createElement('article');
    card.className = 'scene-card';
    const heading = document.createElement('strong');
    heading.textContent = `${String(index + 1).padStart(2, '0')} · ${scene.title}`;
    const text = document.createElement('p');
    text.textContent = scene.text;
    card.append(heading, text);
    board.append(card);
  });
  videoScenes = scenes;
  $('#render-video').disabled = false;
}

function wrapCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(/\s+/);
  let line = '';
  const lines = [];
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines - 1) break;
    } else line = candidate;
  }
  if (line && lines.length < maxLines) lines.push(line);
  lines.forEach((value, index) => context.fillText(value, x, y + index * lineHeight));
}

function createOfflineScenes(prompt) {
  const words = prompt.trim().split(/\s+/).slice(0, 10).join(' ');
  return [
    { title: 'Fikir', text: words },
    { title: 'İhtiyaç', text: 'Günlük hayatı kolaylaştıran küçük bir dokunuş.' },
    { title: 'Çözüm', text: 'İhtiyacına uygun seçeneği şimdi keşfet.' },
    { title: 'Değer', text: 'Kaliteyi, fiyatı ve ihtiyaçlarını birlikte değerlendir.' },
    { title: 'Kapanış', text: 'Senin için doğru seçim burada başlıyor.' }
  ];
}

function startLocalVideoRender() {
  if (!videoScenes.length) return;
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    showToast('Bu tarayıcı WebM video kaydını desteklemiyor. Güncel Chrome, Edge veya Firefox deneyebilirsin.');
    return;
  }
  const button = $('#render-video');
  const status = $('#video-status');
  button.disabled = true;
  status.textContent = 'Video hazırlanıyor… Bu sekmeyi açık tut.';
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext('2d');
  if (!context) {
    button.disabled = false;
    status.textContent = 'Tarayıcı çizim alanı başlatılamadı.';
    return;
  }
  const stream = canvas.captureStream(30);
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) {
    stream.getTracks().forEach((track) => track.stop());
    button.disabled = false;
    status.textContent = 'Bu tarayıcı WebM dışa aktarımını desteklemiyor.';
    showToast('WebM kaydı bu tarayıcıda desteklenmiyor.');
    return;
  }
  let recorder;
  try { recorder = new MediaRecorder(stream, { mimeType }); }
  catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    button.disabled = false;
    status.textContent = `Video kaydı başlatılamadı: ${error.message}`;
    return;
  }
  const chunks = [];
  let failed = false;
  const sceneDuration = 3000;
  const totalDuration = videoScenes.length * sceneDuration;
  const startedAt = performance.now();
  let displayedScene = -1;
  const drawFrame = (now) => {
    if (recorder.state !== 'recording') return;
    const elapsed = now - startedAt;
    const sceneIndex = Math.min(Math.floor(elapsed / sceneDuration), videoScenes.length - 1);
    const scene = videoScenes[sceneIndex];
    if (sceneIndex !== displayedScene) {
      displayedScene = sceneIndex;
      status.textContent = `Video hazırlanıyor… ${sceneIndex + 1}/${videoScenes.length} sahne`;
    }
    const progress = Math.min((elapsed % sceneDuration) / sceneDuration, 1);
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#153d30');
    gradient.addColorStop(1, '#24785a');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalAlpha = 0.12;
    context.fillStyle = '#d7ef75';
    context.beginPath();
    context.arc(1080 + Math.sin(elapsed / 900) * 35, 125, 150 + Math.sin(elapsed / 700) * 10, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    context.fillStyle = '#d7ef75';
    context.font = '700 24px sans-serif';
    context.fillText('FIYAT RADAR  ·  KISA VIDEO', 86, 88);
    context.fillStyle = '#fff';
    context.font = '800 58px sans-serif';
    wrapCanvasText(context, scene.title, 86, 270 + (1 - Math.min(progress * 4, 1)) * 12, 1080, 72, 2);
    context.font = '400 34px sans-serif';
    context.fillStyle = '#e6f2eb';
    wrapCanvasText(context, scene.text, 88, 385, 1050, 49, 4);
    context.fillStyle = 'rgba(255,255,255,.25)';
    context.fillRect(86, 628, 1108, 4);
    context.fillStyle = '#d7ef75';
    context.fillRect(86, 628, 1108 * ((sceneIndex + progress) / videoScenes.length), 4);
    context.fillStyle = '#fff';
    context.font = '500 18px sans-serif';
    context.fillText(`${String(sceneIndex + 1).padStart(2, '0')} / ${String(videoScenes.length).padStart(2, '0')}`, 1090, 674);
    if (elapsed < totalDuration) requestAnimationFrame(drawFrame);
    else recorder.stop();
  };
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  recorder.onerror = () => {
    failed = true;
    stream.getTracks().forEach((track) => track.stop());
    button.disabled = false;
    status.textContent = 'Video kaydedilirken tarayıcı hatası oluştu.';
  };
  recorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());
    if (failed) return;
    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(blob);
    const preview = $('#video-preview');
    preview.src = videoUrl;
    preview.hidden = false;
    const download = $('#download-video');
    download.href = videoUrl;
    download.hidden = false;
    button.disabled = false;
    status.textContent = `WebM video hazır (${(blob.size / 1024 / 1024).toFixed(1)} MB). Önizleyebilir veya indirebilirsin.`;
  };
  recorder.start(250);
  requestAnimationFrame(drawFrame);
}

function bindEvents() {
  $('#auth-mode-toggle').addEventListener('click', () => setAuthMode(authMode === 'signin' ? 'signup' : 'signin'));
  $('#auth-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supabaseClient) {
      setAuthMessage('Supabase istemcisi yüklenemedi. Sayfayı yenile veya internet bağlantısını kontrol et.', true);
      return;
    }
    const button = $('#auth-submit');
    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    button.disabled = true;
    setAuthMessage(authMode === 'signup' ? 'Ücretsiz hesap oluşturuluyor…' : 'Giriş yapılıyor…');
    try {
      if (authMode === 'signup') {
        const fullName = $('#auth-name').value.trim();
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin }
        });
        if (error) throw error;
        if (!data.session) setAuthMessage('Hesabın oluşturuldu. Giriş yapmadan önce e-postana gelen doğrulama bağlantısını aç.');
        else setAuthMessage('Hesabın oluşturuldu. Uygulama açılıyor.');
      } else {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setAuthMessage('');
      }
    } catch (error) {
      setAuthMessage(error.message || 'Giriş başarısız oldu. Bilgilerini kontrol et.', true);
    } finally {
      button.disabled = false;
    }
  });

  $('#sign-out').addEventListener('click', async () => {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signOut();
    if (error) showToast(`Çıkış yapılamadı: ${error.message}`);
    else setAuthMode('signin');
  });

  supabaseClient?.auth.onAuthStateChange((_event, session) => {
    queueMicrotask(() => { void renderAuthenticatedUser(session?.user || null); });
  });

  for (const button of $$('.nav-item')) button.addEventListener('click', () => openView(button.dataset.view));
  for (const button of $$('[data-view-link]')) button.addEventListener('click', () => openView(button.dataset.viewLink));
  $('#add-open').addEventListener('click', () => openProductModal());
  $('#watchlist-add').addEventListener('click', () => openProductModal());
  $('#empty-add').addEventListener('click', () => openProductModal());
  $('#modal-close').addEventListener('click', closeProductModal);
  $('#modal').addEventListener('click', (event) => { if (event.target === $('#modal')) closeProductModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeProductModal(); });
  $('#product-form').addEventListener('submit', saveOffer);
  $('#product-url').addEventListener('change', (event) => {
    const match = marketplaceFromUrl(event.currentTarget.value.trim());
    if (match) $('#marketplace-select').value = match.id;
  });

  $('#product-list').addEventListener('click', (event) => {
    const add = event.target.closest('[data-add-offer]');
    const remove = event.target.closest('[data-delete-product]');
    if (add) openProductModal(add.dataset.title);
    if (remove) void removeProductGroup(remove.dataset.deleteProduct, remove.dataset.title);
  });
  $('#watchlist-items').addEventListener('click', (event) => {
    const add = event.target.closest('[data-add-offer]');
    const remove = event.target.closest('[data-delete-product]');
    if (add) openProductModal(add.dataset.title);
    if (remove) void removeProductGroup(remove.dataset.deleteProduct, remove.dataset.title);
  });

  $$('.filter').forEach((button) => button.addEventListener('click', () => {
    $$('.filter').forEach((item) => item.classList.toggle('active', item === button));
    activeMarket = button.dataset.filter;
    renderDashboard();
  }));
  $('#search').addEventListener('input', renderDashboard);
  $('#sort-btn').addEventListener('click', () => {
    highestFirst = !highestFirst;
    $('#sort-btn').textContent = `En büyük fark ${highestFirst ? 'önce ↓' : 'sonra ↑'}`;
    renderDashboard();
  });

  $('#connect-ai').addEventListener('click', async () => {
    const key = aiApiKeyInput.value.trim();
    if (!key) {
      showToast('Önce Google AI Studio API anahtarını gir.');
      aiApiKeyInput.focus();
      return;
    }
    const button = $('#connect-ai');
    button.disabled = true;
    button.textContent = 'Anahtar doğrulanıyor…';
    setAssistantState('Gemini 3.5 Flash-Lite bağlantısı kontrol ediliyor…');
    try {
      await validateGeminiKey(key);
      geminiApiKey = key;
      aiApiKeyInput.value = '';
      $('#disconnect-ai').hidden = false;
      setAssistantState(`Bağlandı · ${GEMINI_MODEL}`, true);
      showToast('Gemini anahtarı doğrulandı; yalnızca bu sekmede tutuluyor.');
    } catch (error) {
      setAssistantState(error.message);
      showToast(`Gemini anahtarı bağlanamadı: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = 'Anahtarı doğrula ve bağla';
    }
  });

  $('#disconnect-ai').addEventListener('click', () => {
    geminiApiKey = '';
    aiApiKeyInput.value = '';
    $('#disconnect-ai').hidden = true;
    setAssistantState('Ayarlar’dan ücretsiz Gemini anahtarını bağla');
    showToast('Gemini anahtarı bu sekmenin belleğinden silindi.');
  });

  $('#chat-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = $('#chat-input');
    const prompt = input.value.trim();
    if (!prompt) return;
    const key = getGeminiKey();
    if (!key) return;
    appendChatMessage(prompt, 'user');
    input.value = '';
    const pending = appendChatMessage('Yanıt hazırlanıyor…', 'pending');
    $('#chat-send').disabled = true;
    const contextualPrompt = `Kullanıcının sorusu: ${prompt}\n\nKullanıcının kaydettiği fiyatlar (mağaza taraması değildir; kayıt zamanlarını dikkate al):\n${savedPriceContext()}`;
    try {
      const contents = [...chatHistory, { role: 'user', parts: [{ text: contextualPrompt }] }];
      const answer = await sendGeminiRequest(key, contents, { maxOutputTokens: 1200, temperature: 0.7 });
      pending.remove();
      appendChatMessage(answer, 'assistant');
      chatHistory.push({ role: 'user', parts: [{ text: prompt }] }, { role: 'model', parts: [{ text: answer }] });
      if (chatHistory.length > 20) chatHistory.splice(0, chatHistory.length - 20);
    } catch (error) {
      pending.remove();
      appendChatMessage(`Yanıt alınamadı: ${error.message}`, 'assistant');
      showToast(`AI isteği başarısız: ${error.message}`);
    } finally {
      $('#chat-send').disabled = false;
      input.focus();
    }
  });

  $$('.quick-prompt').forEach((button) => button.addEventListener('click', () => {
    $('#chat-input').value = button.textContent;
    $('#chat-form').requestSubmit();
  }));

  $('#generate-scenes').addEventListener('click', async () => {
    const prompt = $('#video-prompt').value.trim();
    if (!prompt) return showToast('Önce video fikrini yaz.');
    const key = getGeminiKey();
    if (!key) return;
    const button = $('#generate-scenes');
    const status = $('#video-status');
    button.disabled = true;
    status.textContent = 'Gemini sahne taslağını oluşturuyor…';
    try {
      const answer = await sendGeminiRequest(key, [{
        role: 'user',
        parts: [{ text: `Bu fikir için Türkçe, 5 sahnelik kısa storyboard hazırla: ${prompt}\nSadece JSON dizisi döndür; her eleman {"title":"kısa başlık","text":"ekranda görünecek en fazla 18 kelimelik metin"} biçiminde olsun.` }]
      }], { responseMimeType: 'application/json', maxOutputTokens: 800, temperature: 0.7 });
      const scenes = parseSceneJson(answer);
      if (scenes.length < 3) throw new Error('AI geçerli bir 3–6 sahnelik taslak oluşturamadı.');
      renderStoryboard(scenes);
      status.textContent = `${scenes.length} sahnelik AI taslağı hazır. WebM videosunu oluşturabilirsin.`;
    } catch (error) {
      status.textContent = `Taslak oluşturulamadı: ${error.message}`;
      showToast(`Video taslağı hatası: ${error.message}`);
    } finally {
      button.disabled = false;
    }
  });

  $('#sample-scenes').addEventListener('click', () => {
    const prompt = $('#video-prompt').value.trim();
    if (!prompt) return showToast('Önce video fikrini yaz.');
    renderStoryboard(createOfflineScenes(prompt));
    $('#video-status').textContent = 'Çevrimdışı örnek taslak hazır. İstersen Gemini ile yeniden oluştur.';
  });
  $('#render-video').addEventListener('click', startLocalVideoRender);

  $('#install-button').addEventListener('click', async () => {
    if (!deferredPrompt) {
      const isSafari = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
      showToast(isSafari ? 'Safari’de Paylaş > Ana Ekrana Ekle seçeneğini kullan.' : 'Tarayıcı menüsünden “Ana ekrana ekle” seçeneğini kullan.');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') {
      hideInstallBanner(true);
      showToast('Uygulama ana ekrana eklendi.');
    } else showToast('Ana ekrana ekleme iptal edildi.');
  });
  $('#dismiss-install').addEventListener('click', () => hideInstallBanner(true));

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    showInstallBanner(installHint());
  });
  window.addEventListener('appinstalled', () => {
    hideInstallBanner(true);
    showToast('Uygulama ana ekrana eklendi.');
  });
}

async function init() {
  bindEvents();
  authScreen.hidden = false;
  appShell.hidden = true;
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(() => {
        // Offline support is optional; online app features remain available.
      });
    });
  }
  if (!supabaseClient) {
    setAuthMessage('Supabase istemcisi yüklenemedi. İnternet bağlantını kontrol edip sayfayı yenile.', true);
    return;
  }
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    setAuthMessage(`Oturum bilgisi okunamadı: ${error.message}`, true);
    return;
  }
  await renderAuthenticatedUser(data.session?.user || null);
}

void init();
