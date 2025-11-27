/**
 * bitter8 Web App
 * Telegram Web App магазин
 */

// === ИНИЦИАЛИЗАЦИЯ TELEGRAM ===

const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
if (tg.colorScheme === 'dark') document.body.classList.add('dark');

// === СОСТОЯНИЕ ===

const state = {
    products: [],
    cart: JSON.parse(localStorage.getItem('cart') || '[]'),
    favorites: JSON.parse(localStorage.getItem('favorites') || '[]'),
    currentPage: 'catalog',
    currentBrand: 'all',
    currentSort: 'price',
    sortDirection: 'asc',
    searchQuery: ''
};

const modalState = {
    productId: null,
    selectedSize: null,
    quantity: 1,
    currentImageIndex: 0,
    images: []
};

// === УТИЛИТЫ ===

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const formatPrice = (p) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0 }).format(p);
const haptic = (type = 'light') => tg.HapticFeedback?.impactOccurred(type);
const saveCart = () => localStorage.setItem('cart', JSON.stringify(state.cart));
const saveFavorites = () => localStorage.setItem('favorites', JSON.stringify(state.favorites));

// === ЗАГРУЗКА ДАННЫХ ===

async function loadProducts() {
    try {
        const res = await fetch('/api/products?refresh=true');
        if (!res.ok) throw new Error();
        state.products = await res.json();
    } catch {
        state.products = [];
        console.warn('Не удалось загрузить товары');
    }
    renderBrands();
    renderProducts();
    updateUI();
    updateSortArrows();
}

// === РЕНДЕРИНГ ===

function renderBrands() {
    const brands = [...new Set(state.products.map(p => p.brand))].sort();
    const el = $('#brands');
    el.innerHTML = '';
    
    // Кнопка "Все"
    const allBtn = document.createElement('button');
    allBtn.className = `brand-chip ${state.currentBrand === 'all' ? 'active' : ''}`;
    allBtn.textContent = 'Все';
    allBtn.onclick = () => selectBrand('all', allBtn);
    el.appendChild(allBtn);
    
    // Кнопки брендов
    brands.forEach(brand => {
        const btn = document.createElement('button');
        btn.className = `brand-chip ${state.currentBrand === brand ? 'active' : ''}`;
        btn.textContent = brand;
        btn.onclick = () => selectBrand(brand, btn);
        el.appendChild(btn);
    });
}

function selectBrand(brand, btn) {
    state.currentBrand = brand;
    $$('.brand-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderProducts();
}

function getFilteredProducts() {
    let filtered = [...state.products];
    
    if (state.currentBrand !== 'all') {
        filtered = filtered.filter(p => p.brand === state.currentBrand);
    }
    
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        filtered = filtered.filter(p => 
            p.name.toLowerCase().includes(q) || 
            p.description?.toLowerCase().includes(q) ||
            p.brand?.toLowerCase().includes(q)
        );
    }
    
    filtered.sort((a, b) => {
        let r = 0;
        if (state.currentSort === 'price') r = a.price - b.price;
        else if (state.currentSort === 'date') r = new Date(a.dateAdded) - new Date(b.dateAdded);
        else if (state.currentSort === 'name') r = a.name.localeCompare(b.name);
        return state.sortDirection === 'asc' ? r : -r;
    });
    
    return filtered;
}

function renderProducts() {
    const filtered = getFilteredProducts();
    const grid = $('#products');
    const empty = $('#emptyProducts');
    
    if (!filtered.length) {
        grid.innerHTML = '';
        empty.classList.add('active');
        return;
    }
    
    empty.classList.remove('active');
    grid.innerHTML = filtered.map(p => {
        const images = [p.image, ...(p.images || [])].filter(Boolean);
        const hasMultiple = images.length > 1;
        
        return `
            <div class="product-card" onclick="showProduct(${p.id})">
            <div class="product-image">
                <button class="favorite-btn ${state.favorites.includes(p.id) ? 'active' : ''}" 
                        onclick="event.stopPropagation(); toggleFavorite(${p.id})">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>
                    ${images.length ? `
                        <div class="product-image-gallery" data-product-id="${p.id}">
                            <div class="product-image-slides">
                                ${images.map((img, i) => `
                                    <div class="product-image-slide ${i === 0 ? 'active' : ''}" style="transform: translateX(${i * 100}%)">
                                        <img src="${img}" alt="${p.name}" onerror="this.parentElement.innerHTML='<div class=product-emoji>${p.emoji || '🛍️'}</div>'">
                                    </div>
                                `).join('')}
                            </div>
                            ${hasMultiple ? `<div class="product-image-indicators">${images.map((_, i) => `<span class="product-image-dot ${i === 0 ? 'active' : ''}"></span>`).join('')}</div>` : ''}
                        </div>
                    ` : `<div class="product-emoji">${p.emoji || '🛍️'}</div>`}
                </div>
                <div class="product-info">
                    <div class="product-name">${p.name}</div>
                    <div class="product-price">${formatPrice(p.price)}</div>
                </div>
            </div>
        `;
    }).join('');
    
    setTimeout(initProductSwipes, 50);
}

function renderFavorites() {
    const favs = state.products.filter(p => state.favorites.includes(p.id));
    const grid = $('#favoriteProducts');
    const empty = $('#emptyFavorites');
    
    if (!favs.length) {
        grid.innerHTML = '';
        empty.classList.add('active');
        return;
    }
    
    empty.classList.remove('active');
    grid.innerHTML = favs.map(p => `
        <div class="product-card" onclick="showProduct(${p.id})">
            <div class="product-image">
                <button class="favorite-btn active" onclick="event.stopPropagation(); toggleFavorite(${p.id})">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>
                ${p.image ? `<img src="${p.image}" alt="${p.name}">` : `<div class="product-emoji">${p.emoji || '🛍️'}</div>`}
            </div>
            <div class="product-info">
                <div class="product-name">${p.name}</div>
                <div class="product-price">${formatPrice(p.price)}</div>
            </div>
        </div>
    `).join('');
}

function renderCart() {
    const items = $('#cartItems');
    const empty = $('#emptyCart');
    const footer = $('#cartFooter');
    const checkout = $('#checkoutBar');
    
    if (!state.cart.length) {
        items.innerHTML = '';
        empty.classList.add('active');
        footer.classList.remove('active');
        checkout.classList.remove('active');
        return;
    }
    
    empty.classList.remove('active');
    footer.classList.add('active');
    checkout.classList.add('active');
    
    items.innerHTML = state.cart.map((item, i) => {
        const p = state.products.find(x => x.id === item.id) || item;
        return `
            <div class="cart-item">
                <div class="cart-item-image">${p.image ? `<img src="${p.image}">` : p.emoji || '🛍️'}</div>
                <div class="cart-item-info">
                    <div class="cart-item-name">${p.name}${item.size ? ` • ${item.size}` : ''}</div>
                    <div class="cart-item-desc">${p.description || ''}</div>
                    <div class="cart-item-bottom">
                        <div class="cart-controls">
                            <button class="qty-btn" onclick="changeQty(${i}, -1)">−</button>
                            <span class="qty-value">${item.quantity}</span>
                            <button class="qty-btn" onclick="changeQty(${i}, 1)">+</button>
                        </div>
                        <div class="cart-item-price">${formatPrice(p.price)}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    const count = state.cart.reduce((s, i) => s + i.quantity, 0);
    const total = state.cart.reduce((s, i) => s + (state.products.find(p => p.id === i.id)?.price || i.price) * i.quantity, 0);
    
    $('#cartItemCount').textContent = count;
    $('#cartSubtotal').textContent = formatPrice(total);
    $('#cartTotal').textContent = formatPrice(total);
    $('#checkoutPrice').textContent = formatPrice(total);
}

// === КОРЗИНА И ИЗБРАННОЕ ===

function addToCart(id, size = null) {
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    
    const key = size ? `${id}_${size}` : id;
    const existing = state.cart.find(i => (i.size ? `${i.id}_${i.size}` : i.id) === key);
    
    if (existing) {
        existing.quantity++;
    } else {
        state.cart.push({ id, quantity: 1, size, ...p });
    }
    
    saveCart();
    updateUI();
    haptic();
}

function changeQty(index, delta) {
    if (index < 0 || index >= state.cart.length) return;
    state.cart[index].quantity += delta;
    if (state.cart[index].quantity <= 0) state.cart.splice(index, 1);
    saveCart();
    renderCart();
    updateUI();
}

function toggleFavorite(id) {
    const idx = state.favorites.indexOf(id);
    idx > -1 ? state.favorites.splice(idx, 1) : state.favorites.push(id);
    saveFavorites();
    renderProducts();
    renderFavorites();
    updateUI();
    haptic();
}

// === МОДАЛЬНОЕ ОКНО ===

function showProduct(id) {
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    
    Object.assign(modalState, { productId: id, selectedSize: null, quantity: 1, currentImageIndex: 0 });
    modalState.images = [p.image, ...(p.images || [])].filter(Boolean);
    
    const container = $('#modalImageContainer');
    const imageEl = $('#modalImage');
    
    setTimeout(() => {
        const w = container.offsetWidth || window.innerWidth;
        
        if (modalState.images.length) {
            imageEl.style.width = `${modalState.images.length * w}px`;
            imageEl.style.transform = 'translateX(0)';
            imageEl.innerHTML = modalState.images.map((img, i) => `
                <div class="modal-image-slide" style="width:${w}px;min-width:${w}px">
                    <img src="${img}" alt="${p.name}" onerror="this.parentElement.innerHTML='<div style=font-size:8rem>${p.emoji || '🛍️'}</div>'">
                </div>
            `).join('');
        } else {
            imageEl.style.width = `${w}px`;
            imageEl.innerHTML = `<div class="modal-image-slide" style="width:${w}px"><div style="font-size:8rem">${p.emoji || '🛍️'}</div></div>`;
        }
        
        updateImageIndicators();
        setupSwipeHandlers();
        setupImageClickZones();
    }, 50);
    
    // Избранное
    const modalFavBtn = $('#modalFavoriteBtn');
    modalFavBtn.classList.toggle('active', state.favorites.includes(id));
    modalFavBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
    `;
    
    // Размеры (для одежды)
    const sizeSection = $('#modalSizeSection');
    const sizesEl = $('#modalSizes');
    const isClothing = p.specs?.some(s => /размер|кро/i.test(s)) || /рубашка|куртка|штаны/i.test(p.name);
    
    if (isClothing) {
        sizeSection.style.display = 'block';
        sizesEl.innerHTML = ['S', 'M', 'L', 'XL'].map(s => `<button class="modal-size-btn" data-size="${s}">${s}</button>`).join('');
        sizesEl.querySelector('.modal-size-btn')?.classList.add('active');
        modalState.selectedSize = 'S';
        
        sizesEl.querySelectorAll('.modal-size-btn').forEach(btn => {
            btn.onclick = () => {
                sizesEl.querySelectorAll('.modal-size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                modalState.selectedSize = btn.dataset.size;
                haptic();
            };
        });
    } else {
        sizeSection.style.display = 'none';
    }
    
    // Информация
    $('#modalName').textContent = p.name;
    $('#modalPrice').textContent = formatPrice(p.price);
    
    const desc = p.fullDescription || p.description;
    const descEl = $('#modalDesc');
    const readMore = $('#modalReadMore');
    descEl.textContent = desc;
    descEl.classList.remove('collapsed');
    
    // Проверка длины описания
    const needsMore = desc.length > 150;
    readMore.style.display = needsMore ? 'flex' : 'none';
    if (needsMore) {
        descEl.classList.add('collapsed');
        readMore.classList.remove('expanded');
        readMore.onclick = () => {
            descEl.classList.toggle('collapsed');
            readMore.classList.toggle('expanded');
        };
    }
    
    // Характеристики
    const specsSection = $('#modalSpecsSection');
    if (p.specs?.length) {
        specsSection.style.display = 'block';
        $('#modalSpecs').innerHTML = p.specs.map(s => `<li>${s}</li>`).join('');
    } else {
        specsSection.style.display = 'none';
    }
    
    $('#modalQtyValue').textContent = modalState.quantity;
    $('#productModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    $('.app').style.display = 'none';
    $('.nav-bar').style.display = 'none';
    
    haptic();
}

function closeModal() {
    $('#productModal').classList.remove('active');
    document.body.style.overflow = '';
    $('.app').style.display = '';
    $('.nav-bar').style.display = '';
}

function updateImageIndicators() {
    const el = $('#modalImageIndicators');
    if (modalState.images.length <= 1) {
        el.innerHTML = '';
        el.style.display = 'none';
        return;
    }
    
    el.style.display = 'flex';
    el.innerHTML = modalState.images.map((_, i) => `
        <button class="modal-image-indicator ${i === modalState.currentImageIndex ? 'active' : ''}" onclick="goToImage(${i})"></button>
    `).join('');
}

function goToImage(index) {
    if (index < 0 || index >= modalState.images.length) return;
    modalState.currentImageIndex = index;
    
    const container = $('#modalImageContainer');
    const imageEl = $('#modalImage');
    const w = container.offsetWidth;
    
    imageEl.style.transition = 'transform 0.3s ease';
    imageEl.style.transform = `translateX(-${index * w}px)`;
    
    updateImageIndicators();
    haptic();
}

function setupSwipeHandlers() {
    const container = $('#modalImageContainer');
    if (!container || modalState.images.length <= 1) return;
    
    // Клонируем для удаления старых обработчиков
    const newContainer = container.cloneNode(true);
    container.parentNode.replaceChild(newContainer, container);
    newContainer.id = 'modalImageContainer';
    
    const imageEl = $('#modalImage');
    let startX = 0, startOffset = 0, currentX = 0, velocity = 0, lastX = 0, lastTime = 0;
    
    const handleStart = (x) => {
        startX = x;
        startOffset = -modalState.currentImageIndex * newContainer.offsetWidth;
        currentX = startOffset;
        lastX = x;
        lastTime = Date.now();
        velocity = 0;
        imageEl.style.transition = 'none';
    };
    
    const handleMove = (x) => {
        const delta = x - startX;
        const w = newContainer.offsetWidth;
        const minX = -(modalState.images.length - 1) * w;
        
        let newX = startOffset + delta;
        if (newX > 0) newX = newX * 0.3;
        else if (newX < minX) newX = minX + (newX - minX) * 0.3;
        
        currentX = newX;
        imageEl.style.transform = `translateX(${newX}px)`;
        
        const now = Date.now();
        if (now - lastTime > 0) velocity = (x - lastX) / (now - lastTime);
        lastX = x;
        lastTime = now;
    };
    
    const handleEnd = () => {
        const w = newContainer.offsetWidth;
        const delta = currentX - startOffset;
        let target = modalState.currentImageIndex;
        
        if (Math.abs(velocity) > 0.5) {
            target = velocity < 0 
                ? (target + 1) % modalState.images.length 
                : (target - 1 + modalState.images.length) % modalState.images.length;
        } else if (Math.abs(delta) > w * 0.25) {
            target = delta < 0 
                ? (target + 1) % modalState.images.length 
                : (target - 1 + modalState.images.length) % modalState.images.length;
        }
        
        goToImage(target);
    };
    
    // Touch events
    newContainer.addEventListener('touchstart', e => { e.preventDefault(); handleStart(e.touches[0].clientX); }, { passive: false });
    newContainer.addEventListener('touchmove', e => { e.preventDefault(); handleMove(e.touches[0].clientX); }, { passive: false });
    newContainer.addEventListener('touchend', handleEnd);
    
    // Mouse events
    let mouseDown = false;
    newContainer.addEventListener('mousedown', e => { mouseDown = true; handleStart(e.clientX); e.preventDefault(); });
    newContainer.addEventListener('mousemove', e => { if (mouseDown) handleMove(e.clientX); });
    newContainer.addEventListener('mouseup', () => { if (mouseDown) { mouseDown = false; handleEnd(); } });
    newContainer.addEventListener('mouseleave', () => { if (mouseDown) { mouseDown = false; goToImage(modalState.currentImageIndex); } });
    
    newContainer.style.cursor = 'grab';
}

function setupImageClickZones() {
    const container = $('#modalImageContainer');
    if (!container || modalState.images.length <= 1) return;
    
    container.querySelectorAll('.modal-image-left-zone, .modal-image-right-zone').forEach(z => z.remove());
    
    const leftZone = document.createElement('div');
    leftZone.className = 'modal-image-left-zone';
    leftZone.onclick = e => { e.stopPropagation(); goToImage((modalState.currentImageIndex - 1 + modalState.images.length) % modalState.images.length); };
    
    const rightZone = document.createElement('div');
    rightZone.className = 'modal-image-right-zone';
    rightZone.onclick = e => { e.stopPropagation(); goToImage((modalState.currentImageIndex + 1) % modalState.images.length); };
    
    container.appendChild(leftZone);
    container.appendChild(rightZone);
}

// === НАВИГАЦИЯ ===

function navigateToPage(page) {
    state.currentPage = page;
    
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    $(`.nav-btn[data-page="${page}"]`)?.classList.add('active');
    
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`section[data-page="${page}"]`)?.classList.add('active');
    
    const brandsWrapper = $('#brandsWrapper');
    const searchBtn = $('#searchBtn');
    const sortMenu = $('#sortMenu');
    const searchBar = $('#searchBar');
    const checkoutBar = $('#checkoutBar');
    
    if (page === 'catalog') {
        brandsWrapper.style.display = 'flex';
        searchBtn.style.display = 'flex';
    } else {
        brandsWrapper.style.display = 'none';
        sortMenu.classList.remove('active');
        searchBar.classList.remove('active');
        searchBtn.style.display = 'none';
    }
    
    checkoutBar.classList.toggle('active', page === 'cart' && state.cart.length > 0);
    
    if (page === 'favorites') renderFavorites();
    if (page === 'cart') renderCart();
    if (page === 'profile') loadProfile();
    
    tg.HapticFeedback?.selectionChanged();
}

// === ПРОФИЛЬ ===

function loadProfile() {
    const user = tg.initDataUnsafe?.user;
    
    let emoji = localStorage.getItem('userEmoji');
    if (!emoji) {
        const emojis = ['😀', '😎', '🤩', '😇', '🥳', '🤗', '😊', '🙂', '😌', '🤓'];
        emoji = emojis[Math.floor(Math.random() * emojis.length)];
        localStorage.setItem('userEmoji', emoji);
    }
    
    const name = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Гость' : 'Гость';
    const username = user?.username ? `@${user.username}` : '@bitter228';
    
    $('#profileName').textContent = name;
    $('#profileUsername').textContent = username;
    $('#profileId').textContent = user?.id || '—';
    
    const avatar = $('#profileAvatar');
    avatar.style.backgroundImage = user?.photo_url ? `url(${user.photo_url})` : 'none';
    avatar.textContent = user?.photo_url ? '' : (user?.first_name?.[0] || emoji);
    
    loadOrders(user?.id || 'guest');
}

async function loadOrders(userId) {
    try {
        const res = await fetch(`/api/orders/${userId}`);
        const { orders = [] } = await res.json();
        
        const list = $('#ordersList');
        const empty = $('#emptyOrders');
        
        if (!orders.length) {
            list.classList.remove('active');
            empty.classList.add('active');
            return;
        }
        
        empty.classList.remove('active');
        list.classList.add('active');
        list.innerHTML = orders.map(o => `
            <div class="order-item">
                <div class="order-number">Заказ #${o.order_number}</div>
                <div class="order-date">${new Date(o.created_at).toLocaleDateString('ru-RU')}</div>
            </div>
        `).join('');
    } catch {}
}

// === СОРТИРОВКА ===

function updateSortArrows() {
    $$('.sort-menu-item').forEach(item => {
        const sort = item.dataset.sort;
        const arrow = item.querySelector('.sort-arrow');
        if (!arrow) return;
        
        const isActive = state.currentSort === sort;
        item.classList.toggle('active', isActive);
        
        if (isActive) {
            arrow.textContent = state.sortDirection === 'asc' ? '↑' : '↓';
        } else {
            arrow.textContent = sort === 'date' ? '↓' : '↑';
        }
    });
}

function initSortHandlers() {
    $$('.sort-menu-item').forEach(item => {
        item.onclick = e => {
            if (e.target.closest('.sort-direction-btn')) return;
            
            const sort = item.dataset.sort;
            if (state.currentSort === sort) {
                state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                state.currentSort = sort;
                state.sortDirection = sort === 'date' ? 'desc' : 'asc';
            }
            
            updateSortArrows();
            renderProducts();
            tg.HapticFeedback?.selectionChanged();
        };
    });
    
    $$('.sort-direction-btn').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            const sort = btn.dataset.sort;
            
            if (state.currentSort === sort) {
                state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                state.currentSort = sort;
                state.sortDirection = sort === 'date' ? 'desc' : 'asc';
            }
            
            updateSortArrows();
            renderProducts();
            haptic();
        };
    });
    
    updateSortArrows();
}

// === СВАЙП ПРЕВЬЮ ===

function initProductSwipes() {
    $$('.product-image-gallery').forEach(gallery => {
        const id = parseInt(gallery.dataset.productId);
        const p = state.products.find(x => x.id === id);
        if (!p) return;
        
        const images = [p.image, ...(p.images || [])].filter(Boolean);
        if (images.length <= 1) return;
        
        const slides = gallery.querySelectorAll('.product-image-slide');
        const dots = gallery.querySelectorAll('.product-image-dot');
        let current = 0;
        
        const update = () => {
            slides.forEach((s, i) => {
                s.classList.toggle('active', i === current);
                s.style.transform = `translateX(${(i - current) * 100}%)`;
            });
            dots.forEach((d, i) => d.classList.toggle('active', i === current));
        };
        
        let startX = 0;
        
        gallery.addEventListener('touchstart', e => { e.stopPropagation(); startX = e.touches[0].clientX; }, { passive: true });
        gallery.addEventListener('touchend', e => {
            e.stopPropagation();
            const delta = startX - e.changedTouches[0].clientX;
            if (Math.abs(delta) > 50) {
                current = delta > 0 ? (current + 1) % images.length : (current - 1 + images.length) % images.length;
                update();
                haptic();
            }
        }, { passive: true });
        
        // Зоны кликов
        const left = document.createElement('div');
        left.className = 'product-image-left-zone';
        left.onclick = e => { e.stopPropagation(); current = (current - 1 + images.length) % images.length; update(); haptic(); };
        
        const right = document.createElement('div');
        right.className = 'product-image-right-zone';
        right.onclick = e => { e.stopPropagation(); current = (current + 1) % images.length; update(); haptic(); };
        
        gallery.appendChild(left);
        gallery.appendChild(right);
    });
}

// === UI ===

function updateUI() {
    const cartCount = state.cart.reduce((s, i) => s + i.quantity, 0);
    const cartBadge = $('#cartBadge');
    cartBadge.textContent = cartCount;
    cartBadge.classList.toggle('active', cartCount > 0);
    
    const favBadge = $('#favoritesBadge');
    favBadge.textContent = state.favorites.length;
    favBadge.classList.toggle('active', state.favorites.length > 0);
}

// === СОБЫТИЯ ===

document.addEventListener('DOMContentLoaded', () => {
    // Навигация
    $$('.nav-btn').forEach(btn => {
        btn.onclick = () => navigateToPage(btn.dataset.page);
    });
    
    // Поиск
    $('#searchBtn').onclick = () => {
        if (state.currentPage !== 'catalog') return;
        const bar = $('#searchBar');
        bar.classList.toggle('active');
        if (bar.classList.contains('active')) {
            $('#searchInput').focus();
        } else {
            $('#searchInput').value = '';
            state.searchQuery = '';
            $('#searchClear').classList.remove('active');
            renderProducts();
        }
    };
    
    $('#searchInput').oninput = e => {
        state.searchQuery = e.target.value.trim();
        $('#searchClear').classList.toggle('active', state.searchQuery.length > 0);
        renderProducts();
    };
    
    $('#searchClear').onclick = () => {
        $('#searchInput').value = '';
        state.searchQuery = '';
        $('#searchClear').classList.remove('active');
        renderProducts();
    };
    
    // Сортировка
    $('#sortToggleBtn').onclick = e => {
        e.stopPropagation();
        $('#sortMenu').classList.toggle('active');
        haptic();
    };
    
    document.onclick = e => {
        if (!$('#sortMenu').contains(e.target) && e.target !== $('#sortToggleBtn')) {
            $('#sortMenu').classList.remove('active');
        }
    };
    
    initSortHandlers();
    
    // Очистка
    $('#clearFavorites').onclick = () => {
        state.favorites = [];
        saveFavorites();
        renderFavorites();
        updateUI();
    };
    
    $('#clearCart').onclick = () => {
        if (!state.cart.length) return;
        if (tg.showConfirm) {
            tg.showConfirm('Очистить корзину?', ok => {
                if (ok) { state.cart = []; saveCart(); renderCart(); updateUI(); }
            });
        } else {
            state.cart = [];
            saveCart();
            renderCart();
            updateUI();
        }
    };
    
    // Модальное окно
    $('#modalClose').onclick = closeModal;
    
    $('#modalFavoriteBtn').onclick = e => {
        e.stopPropagation();
        if (modalState.productId) {
            toggleFavorite(modalState.productId);
            $('#modalFavoriteBtn').classList.toggle('active', state.favorites.includes(modalState.productId));
        }
    };
    
    $('#modalShareBtn').onclick = () => {
        if (tg.shareUrl) tg.shareUrl(location.href);
        else if (navigator.share) navigator.share({ title: $('#modalName').textContent, url: location.href });
        haptic();
    };
    
    $('#modalQtyPlus').onclick = () => { modalState.quantity++; $('#modalQtyValue').textContent = modalState.quantity; haptic(); };
    $('#modalQtyMinus').onclick = () => { if (modalState.quantity > 1) { modalState.quantity--; $('#modalQtyValue').textContent = modalState.quantity; haptic(); } };
    
    $('#modalAddBtn').onclick = () => {
        if (!modalState.productId) return;
        for (let i = 0; i < modalState.quantity; i++) addToCart(modalState.productId, modalState.selectedSize);
        closeModal();
        navigateToPage('cart');
        tg.HapticFeedback?.notificationOccurred('success');
    };
    
    // Оформление заказа
    $('#checkoutBtn').onclick = async () => {
        if (!state.cart.length) return;
        
        const data = {
            items: state.cart.map(i => ({ name: i.name, price: i.price, quantity: i.quantity })),
            total: state.cart.reduce((s, i) => s + i.price * i.quantity, 0),
            userId: tg.initDataUnsafe?.user?.id || 'unknown',
            userName: tg.initDataUnsafe?.user?.first_name || 'Гость',
            timestamp: new Date().toISOString()
        };
        
        try {
            await fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            tg.showAlert('✅ Заказ оформлен!');
            state.cart = [];
            saveCart();
            renderCart();
            updateUI();
            tg.HapticFeedback?.notificationOccurred('success');
        } catch {
            tg.showAlert('❌ Ошибка оформления');
        }
    };
    
    // ESC
    document.onkeydown = e => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            
            if ($('#productModal').classList.contains('active')) { closeModal(); haptic(); return; }
            if ($('#sortMenu').classList.contains('active')) { $('#sortMenu').classList.remove('active'); haptic(); return; }
            if ($('#searchBar').classList.contains('active')) {
                $('#searchBar').classList.remove('active');
                $('#searchInput').value = '';
                state.searchQuery = '';
                renderProducts();
                haptic();
                return;
            }
            if (state.currentPage === 'catalog' && state.currentBrand !== 'all') {
                state.currentBrand = 'all';
                renderBrands();
                renderProducts();
                haptic();
                return;
            }
            if (state.currentPage !== 'catalog') navigateToPage('catalog');
        }
    };
    
    // Инициализация
    loadProducts();
    loadProfile();
});
