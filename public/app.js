/**
 * bitter8 Web App
 * Фронтенд приложение для Telegram Web App
 * Управление каталогом, корзиной, избранным
 */

// ==================== ИНИЦИАЛИЗАЦИЯ TELEGRAM WEB APP ====================

const tg = window.Telegram.WebApp;
tg.ready();   // Готовность Web App
tg.expand();  // Развернуть на весь экран

// Применение темы Telegram (темная/светлая)
if (tg.colorScheme === 'dark') {
    document.body.classList.add('dark');
}

// ==================== СОСТОЯНИЕ ПРИЛОЖЕНИЯ ====================

const state = {
    products: [],
    cart: JSON.parse(localStorage.getItem('cart') || '[]'),
    favorites: JSON.parse(localStorage.getItem('favorites') || '[]'),
    currentPage: 'catalog',
    currentBrand: 'all',
    currentSort: 'price',        // Поле сортировки: price, date, name
    sortDirection: 'asc',        // Направление: asc (↑) или desc (↓)
    searchQuery: ''
};

// Инициализация направления сортировки по умолчанию
if (state.currentSort === 'date') {
    state.sortDirection = 'desc'; // Для даты по умолчанию новые сверху
}

/**
 * Загрузка товаров с сервера
 * Загружает список товаров из /api/products
 * При ошибке использует fallback данные
 */
async function loadProducts() {
    try {
        const res = await fetch('/api/products?refresh=true');
        if (!res.ok) throw new Error('Failed to load');
        state.products = await res.json();
        console.log('Loaded products:', state.products.length, state.products);
    } catch (error) {
        console.error('Error loading products:', error);
        // Показываем сообщение об ошибке, но не используем fallback
        // Товары должны загружаться из products.json
        state.products = [];
        console.warn('Не удалось загрузить товары. Проверьте products.json и перезагрузите страницу.');
    }
    renderBrands();
    renderProducts();
    updateUI();
    // Обновляем стрелки после загрузки товаров
    updateSortArrows();
}

/**
 * Рендеринг фильтров брендов
 * Создает кнопки для каждого бренда + кнопку "Все"
 */
function renderBrands() {
    const brands = [...new Set(state.products.map(p => p.brand))].sort();
    const brandsEl = document.getElementById('brands');
    
    // Очищаем все кнопки
    brandsEl.innerHTML = '';
    
    // Создаем кнопку "Все"
    const allBtn = document.createElement('button');
    allBtn.className = 'brand-chip';
    allBtn.dataset.brand = 'all';
    allBtn.textContent = 'Все';
    if (state.currentBrand === 'all') {
        allBtn.classList.add('active');
    }
    allBtn.addEventListener('click', () => {
            state.currentBrand = 'all';
            document.querySelectorAll('.brand-chip').forEach(b => b.classList.remove('active'));
        allBtn.classList.add('active');
            renderProducts();
        });
    brandsEl.appendChild(allBtn);
    
    // Создаем кнопки брендов
    brands.forEach(brand => {
        const btn = document.createElement('button');
        btn.className = 'brand-chip';
        btn.textContent = brand;
        btn.dataset.brand = brand;
        if (state.currentBrand === brand) {
            btn.classList.add('active');
        }
        btn.addEventListener('click', () => {
            state.currentBrand = brand;
            document.querySelectorAll('.brand-chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderProducts();
        });
        brandsEl.appendChild(btn);
    });
}

/**
 * Фильтрация и сортировка товаров
 * Применяет фильтры по бренду и поиску, затем сортирует
 * @returns {Array} Отфильтрованный и отсортированный массив товаров
 */
function getFilteredProducts() {
    let filtered = [...state.products];
    
    // Brand filter
    if (state.currentBrand !== 'all') {
        filtered = filtered.filter(p => p.brand === state.currentBrand);
    }
    
    // Search filter
    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        filtered = filtered.filter(p => 
            p.name.toLowerCase().includes(query) ||
            p.description.toLowerCase().includes(query) ||
            p.brand?.toLowerCase().includes(query)
        );
    }
    
    // Sort
    filtered.sort((a, b) => {
        let result = 0;
        
        if (state.currentSort === 'price') {
            result = a.price - b.price;
        } else if (state.currentSort === 'date') {
            result = new Date(a.dateAdded) - new Date(b.dateAdded);
        } else if (state.currentSort === 'name') {
            result = a.name.localeCompare(b.name);
        }
        
        // Применяем направление сортировки
        return state.sortDirection === 'asc' ? result : -result;
    });
    
    return filtered;
}

/**
 * Рендеринг списка товаров
 * Отображает товары в сетке или показывает пустое состояние
 */
function renderProducts() {
    const filtered = getFilteredProducts();
    const grid = document.getElementById('products');
    const empty = document.getElementById('emptyProducts');
    
    if (filtered.length === 0) {
        grid.innerHTML = '';
        empty.classList.add('active');
        return;
    }
    
    empty.classList.remove('active');
    grid.innerHTML = filtered.map(product => {
        const imageContent = product.image 
            ? `<img src="${product.image}" alt="${product.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
               <div class="product-emoji" style="display:none;">${product.emoji || '🛍️'}</div>`
            : `<div class="product-emoji">${product.emoji || '🛍️'}</div>`;
        
        return `
            <div class="product-card" onclick="showProduct(${product.id})">
                    <div class="product-image">
                    <button class="favorite-btn ${state.favorites.includes(product.id) ? 'active' : ''}" 
                            onclick="event.stopPropagation(); toggleFavorite(${product.id})">
                        ♡
                    </button>
                    ${imageContent}
                    </div>
                <div class="product-info">
                    <div class="product-name">${product.name}</div>
                        <div class="product-price">${formatPrice(product.price)}</div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Рендеринг избранных товаров
 * Показывает товары из favorites или пустое состояние с уточкой
 */
function renderFavorites() {
    const favoriteProducts = state.products.filter(p => state.favorites.includes(p.id));
    const grid = document.getElementById('favoriteProducts');
    const empty = document.getElementById('emptyFavorites');
    const stickerEl = document.getElementById('emptyFavoritesSticker');
    
    if (favoriteProducts.length === 0) {
        grid.innerHTML = '';
        empty.classList.add('active');
        // Показываем анимированную уточку из Telegram
        if (stickerEl && !stickerEl.hasAttribute('data-sticker-loaded')) {
            showTelegramDuck(stickerEl);
            stickerEl.setAttribute('data-sticker-loaded', 'true');
        }
        return;
    }
    
    empty.classList.remove('active');
    grid.innerHTML = favoriteProducts.map(product => {
        const imageContent = product.image 
            ? `<img src="${product.image}" alt="${product.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
               <div class="product-emoji" style="display:none;">${product.emoji || '🛍️'}</div>`
            : `<div class="product-emoji">${product.emoji || '🛍️'}</div>`;
    
        return `
            <div class="product-card" onclick="showProduct(${product.id})">
                <div class="product-image">
                    <button class="favorite-btn active" onclick="event.stopPropagation(); toggleFavorite(${product.id})">
                        ♡
                    </button>
                    ${imageContent}
                </div>
                <div class="product-info">
                    <div class="product-name">${product.name}</div>
                    <div class="product-price">${formatPrice(product.price)}</div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Отображение анимированной уточки из Telegram
 * Пытается загрузить стикер, при ошибке показывает эмодзи
 * @param {HTMLElement} container - Контейнер для уточки
 */
function showTelegramDuck(container) {
    // Популярная уточка из Telegram - используем несколько вариантов для надежности
    const stickerUrls = [
        'https://tlgrm.ru/_/stickers/ccd/8dd/ccd8dd5d-d10b-4177-ae89-f3ba9b4fb01b/1.webp',
        'https://cdn.tlgrm.app/stickers/ccd/8dd/ccd8dd5d-d10b-4177-ae89-f3ba9b4fb01b/192/1.webp',
        'https://tlgrm.ru/_/stickers/ccd/8dd/ccd8dd5d-d10b-4177-ae89-f3ba9b4fb01b/192/1.webp'
    ];
    
    // Пробуем загрузить стикер, если не получается - показываем эмодзи уточки
    const img = document.createElement('img');
    img.src = stickerUrls[0];
    img.alt = 'Уточка';
    img.className = 'telegram-sticker';
    img.onerror = function() {
        // Если стикер не загрузился, пробуем следующий URL
        if (stickerUrls.length > 1) {
            this.src = stickerUrls[1];
            this.onerror = function() {
                if (stickerUrls.length > 2) {
                    this.src = stickerUrls[2];
                    this.onerror = function() {
                        // Если все не удалось, показываем большую уточку эмодзи
                        container.innerHTML = '<div style="font-size: 8rem; animation: duckBounce 2s ease-in-out infinite;">🦆</div>';
                    };
                } else {
                    container.innerHTML = '<div style="font-size: 8rem; animation: duckBounce 2s ease-in-out infinite;">🦆</div>';
                }
            };
        } else {
            container.innerHTML = '<div style="font-size: 8rem; animation: duckBounce 2s ease-in-out infinite;">🦆</div>';
        }
    };
    container.innerHTML = '';
    container.appendChild(img);
}

/**
 * Рендеринг корзины
 * Отображает товары в корзине, подсчитывает итоговую сумму
 * Показывает пустое состояние с уточкой если корзина пуста
 */
function renderCart() {
    const cartItems = document.getElementById('cartItems');
    const empty = document.getElementById('emptyCart');
    const stickerEl = document.getElementById('emptyCartSticker');
    const footer = document.getElementById('cartFooter');
    const checkoutBar = document.getElementById('checkoutBar');
    
    if (state.cart.length === 0) {
        cartItems.innerHTML = '';
        empty.classList.add('active');
        footer.classList.remove('active');
        checkoutBar.classList.remove('active');
        // Показываем анимированную уточку из Telegram
        if (stickerEl && !stickerEl.hasAttribute('data-sticker-loaded')) {
            showTelegramDuck(stickerEl);
            stickerEl.setAttribute('data-sticker-loaded', 'true');
        }
        return;
    }
    
    empty.classList.remove('active');
    footer.classList.add('active');
    checkoutBar.classList.add('active');
    
    // Render cart items
    cartItems.innerHTML = state.cart.map((item, index) => {
        const product = state.products.find(p => p.id === item.id) || item;
        const imageContent = product.image 
            ? `<img src="${product.image}" alt="${product.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
               <div class="product-emoji" style="display:none;">${product.emoji || '🛍️'}</div>`
            : `${product.emoji || '🛍️'}`;
        
        const sizeText = item.size ? ` • Размер: ${item.size}` : '';
        const itemKey = item.size ? `${item.id}_${item.size}` : item.id;
        
        return `
            <div class="cart-item" data-cart-key="${itemKey}">
                <div class="cart-item-image">${imageContent}</div>
                <div class="cart-item-info">
                    <div class="cart-item-name">${product.name}${sizeText}</div>
                    <div class="cart-item-desc">${product.description || ''}</div>
                    <div class="cart-item-bottom">
                        <div class="cart-controls">
                            <button class="qty-btn" onclick="changeQuantityByIndex(${index}, -1)">−</button>
                            <span class="qty-value">${item.quantity}</span>
                            <button class="qty-btn" onclick="changeQuantityByIndex(${index}, 1)">+</button>
                        </div>
                        <div class="cart-item-price">${formatPrice(product.price)}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Calculate totals
    const itemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    const total = state.cart.reduce((sum, item) => {
        const product = state.products.find(p => p.id === item.id) || item;
        return sum + (product.price * item.quantity);
    }, 0);
    
    // Update summary
    document.getElementById('cartItemCount').textContent = itemCount;
    document.getElementById('cartSubtotal').textContent = formatPrice(total);
    document.getElementById('cartTotal').textContent = formatPrice(total);
    document.getElementById('checkoutPrice').textContent = formatPrice(total);
}

/**
 * Добавить товар в корзину
 * Поддерживает размеры для одежды
 * Если товар уже есть, увеличивает количество
 * @param {number} productId - ID товара
 * @param {string|null} size - Размер (для одежды)
 */
function addToCart(productId, size = null) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;
    
    // Create unique key for cart item (productId + size)
    const cartKey = size ? `${productId}_${size}` : productId;
    
    const existing = state.cart.find(item => {
        const itemKey = item.size ? `${item.id}_${item.size}` : item.id;
        return itemKey === cartKey;
    });
    
    if (existing) {
        existing.quantity++;
        } else {
        state.cart.push({ 
            id: productId, 
            quantity: 1, 
            size: size,
            ...product 
        });
    }
    saveCart();
    updateUI();
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

/**
 * Изменить количество товара в корзине
 * @param {number} productId - ID товара
 * @param {number} delta - Изменение количества (+1 или -1)
 */
function changeQuantity(productId, delta) {
    const item = state.cart.find(i => i.id === productId);
    if (!item) return;
    
    item.quantity += delta;
    if (item.quantity <= 0) {
        state.cart = state.cart.filter(i => i.id !== productId);
    }
    
    saveCart();
        renderCart();
    updateUI();
}

/**
 * Изменить количество товара по индексу (для товаров с размерами)
 * @param {number} index - Индекс товара в массиве корзины
 * @param {number} delta - Изменение количества
 */
function changeQuantityByIndex(index, delta) {
    if (index < 0 || index >= state.cart.length) return;
    
    const item = state.cart[index];
    item.quantity += delta;
    if (item.quantity <= 0) {
        state.cart.splice(index, 1);
    }
    
    saveCart();
        renderCart();
    updateUI();
}

/**
 * Переключить избранное
 * Добавляет/удаляет товар из избранного
 * @param {number} productId - ID товара
 */
function toggleFavorite(productId) {
    const index = state.favorites.indexOf(productId);
    if (index > -1) {
        state.favorites.splice(index, 1);
        } else {
        state.favorites.push(productId);
    }
    saveFavorites();
    renderProducts();
    renderFavorites();
    updateUI();
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

// Clear favorites
document.getElementById('clearFavorites').addEventListener('click', () => {
    if (state.favorites.length === 0) return;
    state.favorites = [];
    saveFavorites();
    renderFavorites();
    updateUI();
});

// Clear cart
document.getElementById('clearCart').addEventListener('click', () => {
    if (state.cart.length === 0) return;
    if (tg.showConfirm) {
        tg.showConfirm('Очистить корзину?', (confirmed) => {
            if (confirmed) {
                state.cart = [];
                saveCart();
                renderCart();
                updateUI();
            }
        });
    } else {
        state.cart = [];
        saveCart();
        renderCart();
        updateUI();
    }
});

// ==================== МОДАЛЬНОЕ ОКНО ТОВАРА ====================

/**
 * Состояние модального окна товара
 */
let modalState = {
    productId: null,
    selectedSize: null,
    quantity: 1,
    currentImageIndex: 0,
    images: [],
    touchStartX: 0,
    touchEndX: 0
};

/**
 * Показать модальное окно товара
 * Загружает данные товара, настраивает галерею, размеры, описание
 * @param {number} productId - ID товара
 */
function showProduct(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;
    
    modalState.productId = productId;
    modalState.selectedSize = null;
    modalState.quantity = 1;
    modalState.currentImageIndex = 0;
    
    // Prepare images array
    const allImages = [];
    if (product.image) {
        allImages.push(product.image);
    }
    if (product.images && Array.isArray(product.images)) {
        allImages.push(...product.images);
    }
    modalState.images = allImages;
    console.log('Total images for product:', modalState.images.length, modalState.images);
    
    // Show images with swipe support
    const modalImageEl = document.getElementById('modalImage');
    const modalImageContainer = document.getElementById('modalImageContainer');
    
    // Wait for container to be rendered to get correct width
    setTimeout(() => {
        const containerWidth = modalImageContainer.offsetWidth || window.innerWidth;
        
        if (modalState.images.length > 0) {
            modalImageEl.style.display = 'flex';
            modalImageEl.style.width = `${modalState.images.length * containerWidth}px`;
            modalImageEl.style.transform = 'translateX(0)';
            
            modalImageEl.innerHTML = modalState.images.map((img, index) => `
                <div class="modal-image-slide" style="width: ${containerWidth}px; min-width: ${containerWidth}px;">
                    <img src="${img}" alt="${product.name}" 
                 onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'font-size: 8rem\\'>${product.emoji || '🛍️'}</div>';">
                </div>
            `).join('');
    } else {
            modalImageEl.style.display = 'flex';
            modalImageEl.style.width = `${containerWidth}px`;
            modalImageEl.innerHTML = `<div class="modal-image-slide" style="width: ${containerWidth}px; min-width: ${containerWidth}px;"><div style="font-size: 8rem">${product.emoji || '🛍️'}</div></div>`;
        }
        
        // Update indicators after images are loaded
        updateImageIndicators();
        setupSwipeHandlers();
    }, 50);
    
    
    // Update favorite button
    const favoriteBtn = document.getElementById('modalFavoriteBtn');
    favoriteBtn.classList.toggle('active', state.favorites.includes(productId));
    
    // Size selection (show only for clothing items)
    const sizeSection = document.getElementById('modalSizeSection');
    const sizesContainer = document.getElementById('modalSizes');
    const isClothing = product.specs?.some(spec => spec.toLowerCase().includes('размер') || spec.toLowerCase().includes('кро')) || 
                       product.name.toLowerCase().includes('рубашка') || 
                       product.name.toLowerCase().includes('куртка') ||
                       product.name.toLowerCase().includes('штаны');
    
    if (isClothing) {
        sizeSection.style.display = 'block';
        const sizes = ['S', 'M', 'L', 'XL'];
        sizesContainer.innerHTML = sizes.map(size => 
            `<button class="modal-size-btn" data-size="${size}">${size}</button>`
        ).join('');
        
        // Select first size by default
        const firstSizeBtn = sizesContainer.querySelector('.modal-size-btn');
        if (firstSizeBtn) {
            firstSizeBtn.classList.add('active');
            modalState.selectedSize = 'S';
        }
        
        // Size button handlers
        sizesContainer.querySelectorAll('.modal-size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                sizesContainer.querySelectorAll('.modal-size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                modalState.selectedSize = btn.dataset.size;
                if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
            });
        });
    } else {
        sizeSection.style.display = 'none';
    }
    
    // Product name and price
    document.getElementById('modalName').textContent = product.name;
    document.getElementById('modalPrice').textContent = formatPrice(product.price);
    
    // Description with read more
    const descText = product.fullDescription || product.description;
    const descEl = document.getElementById('modalDesc');
    descEl.textContent = descText;
    descEl.classList.remove('collapsed');
    
    const readMoreBtn = document.getElementById('modalReadMore');
    // Check if description is long enough to need "read more"
    const tempEl = document.createElement('div');
    tempEl.style.cssText = 'position: absolute; visibility: hidden; width: 100%;';
    tempEl.textContent = descText;
    document.body.appendChild(tempEl);
    const needsReadMore = tempEl.offsetHeight > 60; // Approximate height for 3 lines
    document.body.removeChild(tempEl);
    
    if (needsReadMore) {
        readMoreBtn.style.display = 'flex';
        descEl.classList.add('collapsed');
        readMoreBtn.classList.remove('expanded');
        readMoreBtn.onclick = () => {
            descEl.classList.toggle('collapsed');
            readMoreBtn.classList.toggle('expanded');
        };
    } else {
        readMoreBtn.style.display = 'none';
    }
    
    // Specs
    const specs = product.specs || [];
    const specsSection = document.getElementById('modalSpecsSection');
    if (specs.length > 0) {
        specsSection.style.display = 'block';
    document.getElementById('modalSpecs').innerHTML = specs.map(spec => `<li>${spec}</li>`).join('');
    } else {
        specsSection.style.display = 'none';
    }
    
    // Quantity
    document.getElementById('modalQtyValue').textContent = modalState.quantity;
    
    // Show modal
    const modal = document.getElementById('productModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Hide main app content
    const app = document.querySelector('.app');
    if (app) app.style.display = 'none';
    
    // Hide navigation bar
    const navBar = document.querySelector('.nav-bar');
    if (navBar) navBar.style.display = 'none';
    
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

/**
 * Обновить индикаторы изображений в галерее
 * Показывает точки для навигации по изображениям
 */
function updateImageIndicators() {
    const indicatorsEl = document.getElementById('modalImageIndicators');
    if (modalState.images.length <= 1) {
        indicatorsEl.innerHTML = '';
        indicatorsEl.style.display = 'none';
        return;
    }
    
    indicatorsEl.style.display = 'flex';
    indicatorsEl.innerHTML = modalState.images.map((_, index) => `
        <button class="modal-image-indicator ${index === modalState.currentImageIndex ? 'active' : ''}" 
                onclick="goToImage(${index})"></button>
    `).join('');
}

/**
 * Перейти к конкретному изображению в галерее
 * @param {number} index - Индекс изображения
 */
function goToImage(index) {
    if (index < 0 || index >= modalState.images.length) return;
    
    modalState.currentImageIndex = index;
    const modalImageEl = document.getElementById('modalImage');
    const container = document.getElementById('modalImageContainer');
    if (!container) return;
    
    const containerWidth = container.offsetWidth;
    modalImageEl.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    modalImageEl.style.transform = `translateX(-${index * containerWidth}px)`;
    
    updateImageIndicators();
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

/**
 * Настройка обработчиков свайпа для галереи
 * Поддерживает touch и mouse события
 * Реализует плавную прокрутку с инерцией
 */
function setupSwipeHandlers() {
    const container = document.getElementById('modalImageContainer');
    if (!container || modalState.images.length <= 1) return;
    
    // Remove old listeners by cloning
    const containerParent = container.parentNode;
    const newContainer = container.cloneNode(true);
    containerParent.replaceChild(newContainer, container);
    newContainer.id = 'modalImageContainer';
    
    const modalImageEl = document.getElementById('modalImage');
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let currentX = 0;
    let isSwiping = false;
    let startOffset = 0;
    let velocity = 0;
    let lastMoveX = 0;
    let lastMoveTime = 0;
    
    // Touch events
    newContainer.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();
        isSwiping = true;
        startOffset = -modalState.currentImageIndex * newContainer.offsetWidth;
        currentX = startOffset;
        lastMoveX = touchStartX;
        lastMoveTime = touchStartTime;
        velocity = 0;
        modalImageEl.style.transition = 'none';
    }, { passive: false });
    
    newContainer.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        e.preventDefault();
        const touch = e.touches[0];
        const now = Date.now();
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        
        // Only swipe horizontally if horizontal movement is greater
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            const containerWidth = newContainer.offsetWidth;
            const newX = startOffset + deltaX;
            
            // Calculate boundaries
            const minX = -(modalState.images.length - 1) * containerWidth;
            const maxX = 0;
            
            // Apply boundaries with resistance
            let boundedX = newX;
            if (newX > maxX) {
                boundedX = maxX + (newX - maxX) * 0.3; // Resistance at start
            } else if (newX < minX) {
                boundedX = minX + (newX - minX) * 0.3; // Resistance at end
            }
            
            currentX = boundedX;
            modalImageEl.style.transform = `translateX(${boundedX}px)`;
            
            // Calculate velocity
            if (now - lastMoveTime > 0) {
                velocity = (touch.clientX - lastMoveX) / (now - lastMoveTime);
            }
            lastMoveX = touch.clientX;
            lastMoveTime = now;
        }
    }, { passive: false });
    
    newContainer.addEventListener('touchend', (e) => {
        if (!isSwiping) return;
        isSwiping = false;
        modalImageEl.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        
        const containerWidth = newContainer.offsetWidth;
        const swipeThreshold = containerWidth * 0.25; // 25% of container width
        const velocityThreshold = 0.5; // pixels per ms
        
        const deltaX = currentX - startOffset;
        const absDeltaX = Math.abs(deltaX);
        
        let targetIndex = modalState.currentImageIndex;
        
        // Check velocity-based swipe
        if (Math.abs(velocity) > velocityThreshold) {
            if (velocity < 0 && modalState.currentImageIndex < modalState.images.length - 1) {
                targetIndex = modalState.currentImageIndex + 1;
            } else if (velocity > 0 && modalState.currentImageIndex > 0) {
                targetIndex = modalState.currentImageIndex - 1;
            }
        } 
        // Check distance-based swipe
        else if (absDeltaX > swipeThreshold) {
            if (deltaX < 0 && modalState.currentImageIndex < modalState.images.length - 1) {
                targetIndex = modalState.currentImageIndex + 1;
            } else if (deltaX > 0 && modalState.currentImageIndex > 0) {
                targetIndex = modalState.currentImageIndex - 1;
            }
        }
        
        goToImage(targetIndex);
    }, { passive: false });
    
    newContainer.addEventListener('touchcancel', () => {
        if (isSwiping) {
            isSwiping = false;
            goToImage(modalState.currentImageIndex);
        }
    }, { passive: false });
    
    // Mouse drag support
    let mouseDown = false;
    let mouseStartX = 0;
    let mouseStartTime = 0;
    let mouseVelocity = 0;
    let mouseLastX = 0;
    let mouseLastTime = 0;
    
    newContainer.addEventListener('mousedown', (e) => {
        mouseDown = true;
        mouseStartX = e.clientX;
        mouseStartTime = Date.now();
        startOffset = -modalState.currentImageIndex * newContainer.offsetWidth;
        currentX = startOffset;
        mouseLastX = mouseStartX;
        mouseLastTime = mouseStartTime;
        mouseVelocity = 0;
        modalImageEl.style.transition = 'none';
        newContainer.style.cursor = 'grabbing';
        e.preventDefault();
    });
    
    newContainer.addEventListener('mousemove', (e) => {
        if (!mouseDown) return;
        e.preventDefault();
        const now = Date.now();
        const deltaX = e.clientX - mouseStartX;
        const containerWidth = newContainer.offsetWidth;
        const newX = startOffset + deltaX;
        
        const minX = -(modalState.images.length - 1) * containerWidth;
        const maxX = 0;
        
        let boundedX = newX;
        if (newX > maxX) {
            boundedX = maxX + (newX - maxX) * 0.3;
        } else if (newX < minX) {
            boundedX = minX + (newX - minX) * 0.3;
        }
        
        currentX = boundedX;
        modalImageEl.style.transform = `translateX(${boundedX}px)`;
        
        if (now - mouseLastTime > 0) {
            mouseVelocity = (e.clientX - mouseLastX) / (now - mouseLastTime);
        }
        mouseLastX = e.clientX;
        mouseLastTime = now;
    });
    
    newContainer.addEventListener('mouseup', (e) => {
        if (!mouseDown) return;
        mouseDown = false;
        newContainer.style.cursor = 'grab';
        modalImageEl.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        
        const containerWidth = newContainer.offsetWidth;
        const swipeThreshold = containerWidth * 0.25;
        const velocityThreshold = 0.5;
        
        const deltaX = currentX - startOffset;
        const absDeltaX = Math.abs(deltaX);
        
        let targetIndex = modalState.currentImageIndex;
        
        if (Math.abs(mouseVelocity) > velocityThreshold) {
            if (mouseVelocity < 0 && modalState.currentImageIndex < modalState.images.length - 1) {
                targetIndex = modalState.currentImageIndex + 1;
            } else if (mouseVelocity > 0 && modalState.currentImageIndex > 0) {
                targetIndex = modalState.currentImageIndex - 1;
            }
        } else if (absDeltaX > swipeThreshold) {
            if (deltaX < 0 && modalState.currentImageIndex < modalState.images.length - 1) {
                targetIndex = modalState.currentImageIndex + 1;
            } else if (deltaX > 0 && modalState.currentImageIndex > 0) {
                targetIndex = modalState.currentImageIndex - 1;
            }
        }
        
        goToImage(targetIndex);
    });
    
    newContainer.addEventListener('mouseleave', () => {
        if (mouseDown) {
            mouseDown = false;
            newContainer.style.cursor = 'grab';
            goToImage(modalState.currentImageIndex);
        }
    });
    
    newContainer.style.cursor = 'grab';
}

/**
 * Закрыть модальное окно товара
 * Восстанавливает отображение основного контента
 */
function closeModal() {
    const modal = document.getElementById('productModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    
    // Show main app content
    const app = document.querySelector('.app');
    if (app) app.style.display = '';
    
    // Show navigation bar
    const navBar = document.querySelector('.nav-bar');
    if (navBar) navBar.style.display = '';
}

document.getElementById('modalClose').addEventListener('click', closeModal);

// Modal favorite button
document.getElementById('modalFavoriteBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (modalState.productId) {
        toggleFavorite(modalState.productId);
        const favoriteBtn = document.getElementById('modalFavoriteBtn');
        favoriteBtn.classList.toggle('active', state.favorites.includes(modalState.productId));
    }
});

// Modal share button
document.getElementById('modalShareBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (tg && tg.shareUrl) {
        tg.shareUrl(window.location.href);
    } else if (navigator.share) {
        navigator.share({
            title: document.getElementById('modalName').textContent,
            text: document.getElementById('modalDesc').textContent,
            url: window.location.href
        });
    }
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
});

// Modal quantity controls
document.getElementById('modalQtyPlus').addEventListener('click', () => {
    modalState.quantity++;
    document.getElementById('modalQtyValue').textContent = modalState.quantity;
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
});

document.getElementById('modalQtyMinus').addEventListener('click', () => {
    if (modalState.quantity > 1) {
        modalState.quantity--;
        document.getElementById('modalQtyValue').textContent = modalState.quantity;
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    }
});

// Modal add to cart button
document.getElementById('modalAddBtn').addEventListener('click', () => {
    if (!modalState.productId) return;
    
    // Add to cart with quantity
    for (let i = 0; i < modalState.quantity; i++) {
        addToCart(modalState.productId, modalState.selectedSize);
    }
    
    closeModal();
    
    // Navigate to cart page
    const cartBtn = document.querySelector('[data-page="cart"]');
    if (cartBtn) {
        cartBtn.click();
    }
    
    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
});

// Modal support button
document.getElementById('modalSupportBtn').addEventListener('click', () => {
    if (tg && tg.openLink) {
        // Open Telegram support link or bot
        tg.openLink('https://t.me/your_support_bot');
    } else {
        tg.showAlert('Свяжитесь с нами через Telegram: @your_support_bot');
    }
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
});

/**
 * Переключение между страницами приложения
 * Обновляет навигацию, показывает/скрывает элементы управления
 * @param {string} page - Название страницы (catalog, favorites, cart, profile)
 */
function navigateToPage(page) {
        state.currentPage = page;
        
        // Update nav
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const navBtn = document.querySelector(`[data-page="${page}"]`);
    if (navBtn) navBtn.classList.add('active');
        
        // Update pages
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.querySelector(`[data-page="${page}"]`);
    if (pageEl && pageEl.classList.contains('page')) {
        pageEl.classList.add('active');
    } else {
        const pageSection = document.querySelector(`section[data-page="${page}"]`);
        if (pageSection) pageSection.classList.add('active');
    }
        
        // Show/hide catalog controls (brands, sort, search)
        const brandsWrapper = document.getElementById('brandsWrapper');
        const sortMenu = document.getElementById('sortMenu');
        const searchBar = document.getElementById('searchBar');
        const searchBtn = document.getElementById('searchBtn');
        
        if (page === 'catalog') {
            brandsWrapper.style.display = 'flex';
            searchBtn.style.display = 'flex';
        } else {
            brandsWrapper.style.display = 'none';
            sortMenu.classList.remove('active');
            searchBar.classList.remove('active');
            searchBtn.style.display = 'none';
        }
        
        // Show/hide checkout bar
        const checkoutBar = document.getElementById('checkoutBar');
        if (page === 'cart' && state.cart.length > 0) {
            checkoutBar.classList.add('active');
        } else {
            checkoutBar.classList.remove('active');
        }
        
        // Render page content
        if (page === 'favorites') renderFavorites();
        if (page === 'cart') renderCart();
        if (page === 'profile') loadProfile();
        
        if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
}

// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        navigateToPage(page);
    });
});

// Search
const searchBtn = document.getElementById('searchBtn');
const searchBar = document.getElementById('searchBar');
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    
searchBtn.addEventListener('click', () => {
    if (state.currentPage !== 'catalog') return;
    searchBar.classList.toggle('active');
    if (searchBar.classList.contains('active')) {
        searchInput.focus();
    } else {
        searchInput.value = '';
        state.searchQuery = '';
        searchClear.classList.remove('active');
        renderProducts();
    }
});
    
    searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    searchClear.classList.toggle('active', state.searchQuery.length > 0);
    renderProducts();
    });
    
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
    state.searchQuery = '';
    searchClear.classList.remove('active');
    renderProducts();
});

// Sort toggle
const sortToggleBtn = document.getElementById('sortToggleBtn');
const sortMenu = document.getElementById('sortMenu');

sortToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sortMenu.classList.toggle('active');
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
});

// Close sort menu when clicking outside
document.addEventListener('click', (e) => {
    if (!sortMenu.contains(e.target) && e.target !== sortToggleBtn) {
        sortMenu.classList.remove('active');
    }
});

/**
 * Обновление отображения стрелок сортировки
 * Показывает текущее состояние сортировки для всех опций
 */
function updateSortArrows() {
    document.querySelectorAll('.sort-menu-item').forEach(item => {
        const sort = item.dataset.sort;
        const arrow = item.querySelector('.sort-arrow');
        if (!arrow) return;
        
        const isActive = state.currentSort === sort;
        
        if (isActive) {
            // Для активной опции показываем текущее направление
            item.classList.add('active');
            arrow.textContent = state.sortDirection === 'asc' ? '↑' : '↓';
        } else {
            // Для неактивных показываем дефолтное направление
            item.classList.remove('active');
            if (sort === 'date') {
                arrow.textContent = '↓'; // По умолчанию новые сверху
            } else {
                arrow.textContent = '↑'; // По умолчанию по возрастанию
            }
        }
    });
}

/**
 * Инициализация обработчиков сортировки
 * Вызывается после загрузки DOM
 */
function initSortHandlers() {
    /**
     * Обработка выбора поля сортировки
     */
    document.querySelectorAll('.sort-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Игнорируем клик по кнопке направления
            if (e.target.closest('.sort-direction-btn')) return;
            
            const sort = item.dataset.sort;
            
            // Если уже выбрано это поле, переключаем направление
            if (state.currentSort === sort) {
                state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                // Иначе выбираем новое поле с дефолтным направлением
                state.currentSort = sort;
                // Для даты по умолчанию desc (новые сверху), для остальных asc
                state.sortDirection = sort === 'date' ? 'desc' : 'asc';
            }
            
            updateSortArrows();
            renderProducts();
            if (tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
        });
    });

    /**
     * Обработка кнопок изменения направления сортировки
     */
    document.querySelectorAll('.sort-direction-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Предотвращаем срабатывание клика на родителе
            
            const sort = btn.dataset.sort;
            
            // Если это активное поле, переключаем направление
            if (state.currentSort === sort) {
                state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                // Иначе выбираем это поле
                state.currentSort = sort;
                state.sortDirection = sort === 'date' ? 'desc' : 'asc';
            }
            
            updateSortArrows();
            renderProducts();
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        });
    });
    
    // Инициализация стрелок при загрузке
    updateSortArrows();
}

/**
 * Оформление заказа
 * Отправляет данные заказа на сервер через Telegram WebApp API
 */
document.getElementById('checkoutBtn').addEventListener('click', async () => {
    if (state.cart.length === 0) return;
    
    const orderData = {
        items: state.cart.map(item => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity
        })),
        total: state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        userId: tg.initDataUnsafe?.user?.id || 'unknown',
        userName: tg.initDataUnsafe?.user?.first_name || 'Гость',
        timestamp: new Date().toISOString()
    };
    
    try {
        await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
        
        tg.showAlert('✅ Заказ оформлен! Мы свяжемся с вами.');
        state.cart = [];
        saveCart();
        renderCart();
        updateUI();
        
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } catch (error) {
        console.error('Checkout error:', error);
        tg.showAlert('❌ Ошибка оформления заказа');
    }
});

// Random emoji for avatar
const avatarEmojis = ['😀', '😎', '🤩', '😇', '🥳', '🤗', '😊', '🙂', '😌', '🤓', '🧐', '🤠', '🥸', '😏', '👽', '🤖', '👾', '🎃', '🎭', '🎨'];

function getRandomEmoji() {
    return avatarEmojis[Math.floor(Math.random() * avatarEmojis.length)];
}

/**
 * Загрузка профиля пользователя
 * Получает данные из Telegram WebApp API
 * Отображает имя, username, аватар, загружает заказы
 */
function loadProfile() {
    const user = tg.initDataUnsafe?.user;
    
    // Get or create stored emoji for consistency
    let userEmoji = localStorage.getItem('userEmoji');
    if (!userEmoji) {
        userEmoji = getRandomEmoji();
        localStorage.setItem('userEmoji', userEmoji);
    }
    
    // Name
    let displayName = 'Гость';
    if (user && (user.first_name || user.last_name)) {
        displayName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    document.getElementById('profileName').textContent = displayName;
    
    // Username
    let displayUsername = '@bitter228';
    if (user && user.username) {
        displayUsername = `@${user.username}`;
    }
    document.getElementById('profileUsername').textContent = displayUsername;
    
    // User ID
    if (user && user.id) {
        document.getElementById('profileId').textContent = user.id;
    } else {
        document.getElementById('profileId').textContent = '—';
    }
    
    // Avatar - try to get photo URL from Telegram, otherwise use emoji or initials
    const avatarEl = document.getElementById('profileAvatar');
    let avatarContent = userEmoji;
    
    // Reset background image styles
    avatarEl.style.backgroundImage = 'none';
    
    if (user && user.photo_url) {
        // If Telegram provides photo URL
        avatarEl.style.backgroundImage = `url(${user.photo_url})`;
        avatarEl.textContent = '';
    } else if (user && (user.first_name || user.last_name)) {
        // Use initials if name exists
        const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase();
        if (initials) {
            avatarContent = initials;
        }
        avatarEl.textContent = avatarContent;
    } else {
        // Use random emoji
        avatarEl.textContent = avatarContent;
    }
    
    // Load orders
    const userId = user?.id || 'guest';
    loadOrders(userId);
}

/**
 * Загрузка истории заказов пользователя
 * @param {string|number} userId - ID пользователя
 */
async function loadOrders(userId) {
    try {
        const res = await fetch(`/api/orders/${userId}`);
        const data = await res.json();
        const orders = data.orders || [];
        
        const list = document.getElementById('ordersList');
        const empty = document.getElementById('emptyOrders');
        
        if (orders.length === 0) {
            list.classList.remove('active');
            empty.classList.add('active');
            return;
        }
        
        empty.classList.remove('active');
        list.classList.add('active');
        
        list.innerHTML = orders.map(order => `
            <div class="order-item">
                <div class="order-number">Заказ #${order.order_number}</div>
                <div class="order-date">${new Date(order.created_at).toLocaleDateString('ru-RU')}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

/**
 * Обновление UI элементов
 * Обновляет бейджи корзины и избранного
 */
function updateUI() {
    // Cart badge
    const cartCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    const cartBadge = document.getElementById('cartBadge');
    cartBadge.textContent = cartCount;
    cartBadge.classList.toggle('active', cartCount > 0);
    
    // Favorites badge
    const favBadge = document.getElementById('favoritesBadge');
    favBadge.textContent = state.favorites.length;
    favBadge.classList.toggle('active', state.favorites.length > 0);
}

/**
 * Сохранение корзины в localStorage
 */
function saveCart() {
    localStorage.setItem('cart', JSON.stringify(state.cart));
}

/**
 * Сохранение избранного в localStorage
 */
function saveFavorites() {
    localStorage.setItem('favorites', JSON.stringify(state.favorites));
}

/**
 * Форматирование цены в рубли
 * @param {number} price - Цена
 * @returns {string} Отформатированная цена
 */
function formatPrice(price) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0
    }).format(price);
}

/**
 * Инициализация видимости элементов управления
 * Показывает/скрывает элементы в зависимости от страницы
 */
function initPageControls() {
    // By default, show only catalog controls (since catalog is the initial page)
    const brandsWrapper = document.getElementById('brandsWrapper');
    const searchBtn = document.getElementById('searchBtn');
    const checkoutBar = document.getElementById('checkoutBar');
    
    brandsWrapper.style.display = 'flex';
    searchBtn.style.display = 'flex';
    checkoutBar.classList.remove('active');
}

/**
 * Обработчик клавиши ESC
 * Навигация назад: закрывает модальное окно → меню сортировки → поиск → сброс фильтров → возврат на каталог
 * Предотвращает закрытие Web App
 */
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
        // Всегда предотвращаем закрытие приложения
        e.preventDefault();
        e.stopPropagation();
        
        // 1. Закрыть модальное окно товара, если открыто
        const modal = document.getElementById('productModal');
        if (modal && modal.classList.contains('active')) {
            closeModal();
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
            return;
        }
        
        // 2. Закрыть меню сортировки, если открыто
        const sortMenu = document.getElementById('sortMenu');
        if (sortMenu && sortMenu.classList.contains('active')) {
            sortMenu.classList.remove('active');
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
            return;
        }
        
        // 3. Закрыть поиск, если открыт
        const searchBar = document.getElementById('searchBar');
        if (searchBar && searchBar.classList.contains('active')) {
            searchBar.classList.remove('active');
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = '';
                state.searchQuery = '';
                renderProducts();
            }
            const searchClear = document.getElementById('searchClear');
            if (searchClear) searchClear.classList.remove('active');
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
            return;
        }
        
        // 4. Сбросить фильтр бренда на "Все", если выбран другой бренд
        if (state.currentPage === 'catalog' && state.currentBrand !== 'all') {
            state.currentBrand = 'all';
            renderBrands();
            renderProducts();
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
            return;
        }
        
        // 5. Вернуться на каталог с любой страницы
        if (state.currentPage !== 'catalog') {
            navigateToPage('catalog');
        }
        // Если уже на каталоге и ничего не открыто - ESC предотвращает закрытие приложения, но ничего не делает
    }
});

// ==================== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ====================

/**
 * Инициализация приложения при загрузке DOM
 * Настраивает начальное состояние, загружает товары и профиль
 */
document.addEventListener('DOMContentLoaded', () => {
    initPageControls();
    // Убеждаемся, что каталог активен при загрузке
    state.currentPage = 'catalog';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-page="catalog"]').classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const catalogNavBtn = document.querySelector('[data-page="catalog"]');
    if (catalogNavBtn) catalogNavBtn.classList.add('active');
    
    // Инициализация обработчиков сортировки
    initSortHandlers();
    
    loadProducts();
    loadProfile();
});
