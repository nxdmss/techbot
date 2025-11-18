const tg = window.Telegram.WebApp;

tg.expand();

// Detect dark theme
const isDark = tg.colorScheme === 'dark';

// Apply theme colors
if (isDark) {
    // Dark theme colors
    document.documentElement.style.setProperty('--bg-primary', tg.themeParams.bg_color || '#1c1c1e');
    document.documentElement.style.setProperty('--bg-secondary', tg.themeParams.secondary_bg_color || '#2c2c2e');
    document.documentElement.style.setProperty('--text-primary', tg.themeParams.text_color || '#ffffff');
    document.documentElement.style.setProperty('--text-secondary', tg.themeParams.hint_color || '#98989d');
    document.documentElement.style.setProperty('--text-tertiary', '#636366');
    document.documentElement.style.setProperty('--border', '#38383a');
    document.documentElement.style.setProperty('--accent', tg.themeParams.button_color || '#0a84ff');
    document.documentElement.style.setProperty('--accent-hover', '#409cff');
    
    // Dark mode specific
    document.body.classList.add('dark-theme');
} else {
    // Light theme colors (keep existing)
    document.documentElement.style.setProperty('--bg-primary', '#ffffff');
    document.documentElement.style.setProperty('--bg-secondary', '#f5f5f7');
    document.documentElement.style.setProperty('--text-primary', '#1d1d1f');
    document.documentElement.style.setProperty('--text-secondary', '#6e6e73');
    document.documentElement.style.setProperty('--text-tertiary', '#86868b');
    document.documentElement.style.setProperty('--border', '#d2d2d7');
    document.documentElement.style.setProperty('--accent', '#0071e3');
    document.documentElement.style.setProperty('--accent-hover', '#0077ed');
}

// Store theme params for reference
document.documentElement.style.setProperty('--tg-theme-bg-color', tg.themeParams.bg_color || '#ffffff');
document.documentElement.style.setProperty('--tg-theme-text-color', tg.themeParams.text_color || '#000000');
document.documentElement.style.setProperty('--tg-theme-hint-color', tg.themeParams.hint_color || '#999999');
document.documentElement.style.setProperty('--tg-theme-button-color', tg.themeParams.button_color || '#2481cc');
document.documentElement.style.setProperty('--tg-theme-button-text-color', tg.themeParams.button_text_color || '#ffffff');
document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', tg.themeParams.secondary_bg_color || '#f4f4f5');

let products = [];
let cart = [];
let currentBrandFilter = 'all';

// Swiper state for each product card
const cardSwipers = {};
let modalSwiper = { currentIndex: 0, images: [] };

async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        products = await response.json();
        initializeBrands();
        renderProducts();
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        products = [];
        renderProducts();
    }
}

function createSwiper(productId, images) {
    const hasMultipleImages = images && images.length > 1;
    
    const swiperHTML = `
        <div class="product-image-swiper">
            <div class="product-images-container" data-swiper-id="${productId}">
                ${images.map((img, index) => `
                    <div class="product-image-slide">
                        <img src="${img}" alt="" class="product-img" onerror="this.style.display='none';">
                    </div>
                `).join('')}
            </div>
            ${hasMultipleImages ? `
                <div class="swiper-zone prev" onclick="event.stopPropagation(); swipeCard(${productId}, 'prev')"></div>
                <div class="swiper-zone next" onclick="event.stopPropagation(); swipeCard(${productId}, 'next')"></div>
                <button class="swiper-arrow prev" onclick="event.stopPropagation(); swipeCard(${productId}, 'prev')">‹</button>
                <button class="swiper-arrow next" onclick="event.stopPropagation(); swipeCard(${productId}, 'next')">›</button>
            ` : ''}
        </div>
    `;
    
    return swiperHTML;
}

function swipeCard(productId, direction) {
    if (tg.HapticFeedback) {
        tg.HapticFeedback.selectionChanged();
    }
    
    const product = products.find(p => p.id === productId);
    if (!product || !product.images) return;
    
    if (!cardSwipers[productId]) {
        cardSwipers[productId] = { currentIndex: 0 };
    }
    
    const state = cardSwipers[productId];
    const maxIndex = product.images.length - 1;
    
    if (direction === 'next') {
        state.currentIndex = state.currentIndex >= maxIndex ? 0 : state.currentIndex + 1;
    } else {
        state.currentIndex = state.currentIndex <= 0 ? maxIndex : state.currentIndex - 1;
    }
    
    updateCardSwiper(productId);
}

function updateCardSwiper(productId) {
    const container = document.querySelector(`[data-swiper-id="${productId}"]`);
    if (!container) return;
    
    const state = cardSwipers[productId];
    const offset = -state.currentIndex * 100;
    container.style.transform = `translateX(${offset}%)`;
}

function renderProducts() {
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = products.map(product => {
        const images = product.images || (product.image ? [product.image] : []);
        cardSwipers[product.id] = { currentIndex: 0 };
        
        return `
            <div class="product-card" onclick="showProductDetail(${product.id})" style="cursor: pointer;">
                ${images.length > 0 ? createSwiper(product.id, images) : `
                    <div class="product-image">
                        <span class="product-emoji">${product.emoji || '🛍️'}</span>
                    </div>
                `}
                <button class="mini-cart-btn" data-product-id="${product.id}">
                    🛒
                </button>
                <button class="add-to-cart-btn" data-product-id="${product.id}">
                    В корзину
                </button>
                <div class="product-info">
                    <div class="product-name">${product.name}</div>
                    <div class="product-description">${product.description}</div>
                    <div class="product-footer">
                        <div class="product-price">${formatPrice(product.price)}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Добавляем обработчики событий для кнопок добавления в корзину
    grid.querySelectorAll('.add-to-cart-btn, .mini-cart-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const productId = parseInt(this.getAttribute('data-product-id'));
            addToCartWithAnimation(productId, this);
        });
    });
}

function createModalSwiper(images) {
    const hasMultipleImages = images && images.length > 1;
    
    return `
        <div class="modal-image-swiper">
            <div class="modal-images-container">
                ${images.map((img, index) => `
                    <div class="modal-image-slide">
                        <img src="${img}" alt="">
                    </div>
                `).join('')}
            </div>
            ${hasMultipleImages ? `
                <div class="modal-swiper-zone prev" onclick="swipeModal('prev')"></div>
                <div class="modal-swiper-zone next" onclick="swipeModal('next')"></div>
                <button class="modal-swiper-arrow prev" onclick="swipeModal('prev')">‹</button>
                <button class="modal-swiper-arrow next" onclick="swipeModal('next')">›</button>
            ` : ''}
        </div>
    `;
}

function swipeModal(direction) {
    if (tg.HapticFeedback) {
        tg.HapticFeedback.selectionChanged();
    }
    
    const maxIndex = modalSwiper.images.length - 1;
    
    if (direction === 'next') {
        modalSwiper.currentIndex = modalSwiper.currentIndex >= maxIndex ? 0 : modalSwiper.currentIndex + 1;
    } else {
        modalSwiper.currentIndex = modalSwiper.currentIndex <= 0 ? maxIndex : modalSwiper.currentIndex - 1;
    }
    
    updateModalSwiper();
}

function swipeModalTo(index) {
    if (tg.HapticFeedback) {
        tg.HapticFeedback.selectionChanged();
    }
    
    modalSwiper.currentIndex = index;
    updateModalSwiper();
}

function updateModalSwiper() {
    const container = document.querySelector('.modal-images-container');
    if (!container) return;
    
    const offset = -modalSwiper.currentIndex * 100;
    container.style.transform = `translateX(${offset}%)`;
}

function showProductDetail(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    if (tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
    
    // Setup modal swiper
    modalSwiper.images = product.images || (product.image ? [product.image] : []);
    modalSwiper.currentIndex = 0;
    
    // Update modal content
    document.getElementById('modalProductName').textContent = product.name;
    document.getElementById('modalProductPrice').textContent = formatPrice(product.price);
    document.getElementById('modalProductDesc').textContent = product.fullDescription || product.description;
    
    // Create image swiper
    const modalImageContainer = document.querySelector('.product-modal-image');
    modalImageContainer.innerHTML = createModalSwiper(modalSwiper.images);
    
    const specsList = document.getElementById('modalProductSpecs');
    if (product.specs && product.specs.length > 0) {
        specsList.innerHTML = product.specs.map(spec => `<li>${spec}</li>`).join('');
    } else {
        specsList.innerHTML = '<li>Информация о характеристиках скоро появится</li>';
    }
    
    const addBtn = document.getElementById('modalAddToCart');
    addBtn.onclick = () => {
        addToCart(productId);
        document.getElementById('productModal').classList.remove('active');
    };
    
    document.getElementById('productModal').classList.add('active');
}

function formatPrice(price) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0
    }).format(price);
}

function addToCart(productId) {
    if (tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
    
    const product = products.find(p => p.id === productId);
    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({ ...product, quantity: 1 });
    }
    
    // Добавляем анимацию пульсации к кнопке корзины
    const cartButton = document.getElementById('cartButton');
    cartButton.classList.add('pulse');
    setTimeout(() => {
        cartButton.classList.remove('pulse');
    }, 500);
    
    updateCartUI();
}

function removeFromCart(productId) {
    const index = cart.findIndex(item => item.id === productId);
    if (index > -1) {
        if (cart[index].quantity > 1) {
            cart[index].quantity--;
        } else {
            cart.splice(index, 1);
        }
    }
    updateCartUI();
}

function updateCartUI() {
    const cartCount = document.getElementById('cartCount');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    if (totalItems > 0) {
        cartCount.textContent = totalItems;
        cartCount.classList.remove('hidden');
    } else {
        cartCount.classList.add('hidden');
    }
    
    if (document.getElementById('cartModal').classList.contains('active')) {
        renderCart();
    }
}

function renderCart() {
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');
    
    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <div class="empty-cart-icon">🛒</div>
                <p>Корзина пуста</p>
            </div>
        `;
        cartTotal.textContent = '0 ₽';
        return;
    }
    
    cartItems.innerHTML = cart.map(item => {
        const displayImage = item.images && item.images.length > 0 ? item.images[0] : item.image;
        return `
            <div class="cart-item">
                <div class="cart-item-image">
                    ${displayImage 
                        ? `<img src="${displayImage}" alt="${item.name}" class="cart-item-img" onerror="this.style.display='none'; this.parentElement.innerHTML='${item.emoji || '🛍️'}'">` 
                        : `<span class="product-emoji">${item.emoji || '🛍️'}</span>`
                    }
                </div>
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-price">${formatPrice(item.price)}</div>
                    <div class="cart-item-controls">
                        <button class="quantity-btn" onclick="removeFromCart(${item.id})">−</button>
                        <span class="quantity">${item.quantity}</span>
                        <button class="quantity-btn" onclick="addToCart(${item.id})">+</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cartTotal.textContent = formatPrice(total);
}

document.getElementById('cartButton').addEventListener('click', () => {
    if (tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('medium');
    }
    document.getElementById('cartModal').classList.add('active');
    renderCart();
});

document.getElementById('closeCart').addEventListener('click', () => {
    document.getElementById('cartModal').classList.remove('active');
});

document.getElementById('cartModal').addEventListener('click', (e) => {
    if (e.target.id === 'cartModal') {
        document.getElementById('cartModal').classList.remove('active');
    }
});


document.getElementById('checkoutBtn').addEventListener('click', async () => {
    if (cart.length === 0) return;
    
    if (tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('medium');
    }
    
    const orderData = {
        items: cart.map(item => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity
        })),
        total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        userId: tg.initDataUnsafe?.user?.id || 'unknown',
        userName: tg.initDataUnsafe?.user?.first_name || 'Неизвестно',
        timestamp: new Date().toISOString()
    };
    
    try {
        const response = await fetch('/api/data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(orderData)
        });
        
        if (response.ok) {
            tg.showAlert('✅ Заказ успешно оформлен!\n\nМы свяжемся с вами в ближайшее время.', () => {
                cart = [];
                updateCartUI();
                document.getElementById('cartModal').classList.remove('active');
            });
        } else {
            throw new Error('Server error');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        tg.showAlert('❌ Ошибка оформления заказа. Попробуйте снова.');
    }
});


function formatPrice(price) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0
    }).format(price);
}

function addToCart(productId) {
    if (tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
    
    const product = products.find(p => p.id === productId);
    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({ ...product, quantity: 1 });
    }
    
    // Добавляем анимацию пульсации к кнопке корзины
    const cartButton = document.getElementById('cartButton');
    cartButton.classList.add('pulse');
    setTimeout(() => {
        cartButton.classList.remove('pulse');
    }, 500);
    
    updateCartUI();
}

function removeFromCart(productId) {
    const index = cart.findIndex(item => item.id === productId);
    if (index > -1) {
        if (cart[index].quantity > 1) {
            cart[index].quantity--;
        } else {
            cart.splice(index, 1);
        }
    }
    updateCartUI();
}

function updateCartUI() {
    const cartCount = document.getElementById('cartCount');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    if (totalItems > 0) {
        cartCount.textContent = totalItems;
        cartCount.classList.remove('hidden');
    } else {
        cartCount.classList.add('hidden');
    }
    
    if (document.getElementById('cartModal').classList.contains('active')) {
        renderCart();
    }
}

function renderCart() {
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');
    
    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <div class="empty-cart-icon">🛒</div>
                <p>Корзина пуста</p>
            </div>
        `;
        cartTotal.textContent = '0 ₽';
        return;
    }
    
    cartItems.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-image">
                ${item.image 
                    ? `<img src="${item.image}" alt="${item.name}" class="cart-item-img" onerror="this.style.display='none'; this.parentElement.innerHTML='${item.emoji || '🛍️'}'">` 
                    : `<span class="product-emoji">${item.emoji || '🛍️'}</span>`
                }
            </div>
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">${formatPrice(item.price)}</div>
                <div class="cart-item-controls">
                    <button class="quantity-btn" onclick="removeFromCart(${item.id})">−</button>
                    <span class="quantity">${item.quantity}</span>
                    <button class="quantity-btn" onclick="addToCart(${item.id})">+</button>
                </div>
            </div>
        </div>
    `).join('');
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cartTotal.textContent = formatPrice(total);
}

document.getElementById('cartButton').addEventListener('click', () => {
    if (tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('medium');
    }
    document.getElementById('cartModal').classList.add('active');
    renderCart();
});

document.getElementById('closeCart').addEventListener('click', () => {
    document.getElementById('cartModal').classList.remove('active');
});

document.getElementById('cartModal').addEventListener('click', (e) => {
    if (e.target.id === 'cartModal') {
        document.getElementById('cartModal').classList.remove('active');
    }
});

document.getElementById('checkoutBtn').addEventListener('click', () => {
    if (cart.length === 0) return;
    
    if (tg.HapticFeedback) {
        tg.HapticFeedback.notificationOccurred('success');
    }
    
    const orderData = {
        items: cart.map(item => ({
            name: item.name,
            price: item.price,
            quantity: item.quantity
        })),
        total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
        userId: tg.initDataUnsafe?.user?.id || 'unknown',
        userName: tg.initDataUnsafe?.user?.first_name || 'Неизвестно',
        timestamp: new Date().toISOString()
    };
    
    tg.sendData(JSON.stringify(orderData));
    
    fetch('/api/data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData)
    }).then(() => {
        tg.showAlert('✅ Заказ оформлен! Мы свяжемся с вами в ближайшее время.', () => {
            tg.close();
        });
    }).catch(error => {
        console.error('Ошибка:', error);
        tg.showAlert('❌ Ошибка оформления заказа. Попробуйте снова.');
    });
});

// Product Modal Controls
document.getElementById('closeProductModal').addEventListener('click', () => {
    document.getElementById('productModal').classList.remove('active');
});

document.getElementById('productModal').addEventListener('click', (e) => {
    if (e.target.id === 'productModal') {
        document.getElementById('productModal').classList.remove('active');
    }
});

// Emoji explosion effect on double click
function createEmojiExplosion(x, y) {
    const emojis = ['🎉', '✨', '💫', '⭐', '🌟', '💥', '🎊', '🎈', '🔥', '💰', '🚀', '⚡', '💎', '👑', '🏆', '🎆', '🌠', '💖', '🎇', '🌈'];
    const emojiCount = 30; // Количество эмодзи
    
    // Создаём все эмодзи одновременно
    for (let i = 0; i < emojiCount; i++) {
        const emoji = document.createElement('div');
        emoji.className = 'emoji-explosion';
        emoji.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        emoji.style.left = x + 'px';
        emoji.style.top = y + 'px';
        
        // Случайное направление с полным разбросом 360 градусов
        const angle = (Math.PI * 2 * Math.random());
        const distance = 80 + Math.random() * 150;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance - Math.random() * 30;
        
        emoji.style.setProperty('--tx', tx + 'px');
        emoji.style.setProperty('--ty', ty + 'px');
        
        document.body.appendChild(emoji);
        
        // Удаляем после анимации
        setTimeout(() => {
            emoji.remove();
        }, 1200);
    }
}

// Add double click listener to logo
function initializeLogoEffect() {
    const logo = document.querySelector('.logo');
    const heroTitle = document.querySelector('.hero-content h1');
    
    if (logo) {
        logo.addEventListener('dblclick', (e) => {
            createEmojiExplosion(e.clientX, e.clientY);
        });
    }
    
    if (heroTitle) {
        heroTitle.addEventListener('dblclick', (e) => {
            createEmojiExplosion(e.clientX, e.clientY);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    initializeSearch();
    initializeSearchToggle();
    initializeLogoEffect();
    console.log('TechShop загружен');
    console.log('Пользователь:', tg.initDataUnsafe?.user);
});


// Search toggle functionality
function initializeSearchToggle() {
    const searchToggle = document.getElementById('searchToggle');
    const searchBox = document.getElementById('searchBox');
    const searchInput = document.getElementById('searchInput');
    
    if (!searchToggle || !searchBox) return;
    
    searchToggle.addEventListener('click', () => {
        const isActive = searchBox.classList.contains('active');
        
        if (isActive) {
            searchBox.classList.remove('active');
            searchToggle.classList.remove('active');
            searchInput.value = '';
            document.getElementById('searchClear').style.display = 'none';
            applyFilters();
        } else {
            searchBox.classList.add('active');
            searchToggle.classList.add('active');
            setTimeout(() => {
                searchInput.focus();
            }, 350);
        }
        
        if (tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('light');
        }
    });
}

// Search functionality
let filteredProducts = [];

function initializeSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        if (query) {
            searchClear.style.display = 'flex';
        } else {
            searchClear.style.display = 'none';
        }
        
        filterProducts(query);
    });
    
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.style.display = 'none';
        applyFilters();
        searchInput.focus();
    });
}

function filterProducts(query) {
    applyFilters();
}

function renderFilteredProducts() {
    const grid = document.getElementById('productsGrid');
    
    grid.innerHTML = filteredProducts.map(product => {
        const images = product.images || (product.image ? [product.image] : []);
        cardSwipers[product.id] = { currentIndex: 0 };
        
        return `
            <div class="product-card" onclick="showProductDetail(${product.id})" style="cursor: pointer;">
                ${images.length > 0 ? createSwiper(product.id, images) : `
                    <div class="product-image">
                        <span class="product-emoji">${product.emoji || '🛍️'}</span>
                    </div>
                `}
                <button class="mini-cart-btn" data-product-id="${product.id}">
                    🛒
                </button>
                <button class="add-to-cart-btn" data-product-id="${product.id}">
                    В корзину
                </button>
                <div class="product-info">
                    <div class="product-name">${product.name}</div>
                    <div class="product-description">${product.description}</div>
                    <div class="product-footer">
                        <div class="product-price">${formatPrice(product.price)}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // Добавляем обработчики событий для кнопок добавления в корзину
    grid.querySelectorAll('.add-to-cart-btn, .mini-cart-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const productId = parseInt(this.getAttribute('data-product-id'));
            addToCartWithAnimation(productId, this);
        });
    });
}

// Brands functionality
function initializeBrands() {
    const brandsScroll = document.getElementById('brandsScroll');
    if (!brandsScroll) return;
    
    // Check if brands are already initialized
    const existingBrands = brandsScroll.querySelectorAll('.brand-chip:not([data-brand="all"])');
    if (existingBrands.length > 0) {
        return; // Brands already added
    }
    
    // Brand logos mapping (PNG images)
    const brandLogos = {
        'Ajazz': '/images/brands/ajazz.png',
        'Apple': '/images/brands/apple.png',
        'Sony': '/images/brands/sony.png',
        'Samsung': '/images/brands/samsung.png',
        'Xiaomi': '/images/brands/xiaomi.png'
    };
    
    // Get unique brands from products
    const brands = [...new Set(products.map(p => p.brand).filter(Boolean))].sort();
    
    // Generate brand chips with logos
    const brandChips = brands.map(brand => `
        <button class="brand-chip" data-brand="${brand}" onclick="filterByBrand('${brand}')">
            <span class="brand-logo"><img src="${brandLogos[brand] || '/images/brands/default.png'}" alt="${brand}"></span>
            <span class="brand-name">${brand}</span>
        </button>
    `).join('');
    
    // Find the "ВСЕ" button and append brands after it
    const allButton = brandsScroll.querySelector('[data-brand="all"]');
    if (allButton) {
        allButton.insertAdjacentHTML('afterend', brandChips);
    } else {
        brandsScroll.innerHTML = brandChips;
    }
}

function filterByBrand(brand) {
    if (tg.HapticFeedback) {
        tg.HapticFeedback.selectionChanged();
    }
    
    currentBrandFilter = brand;
    
    // Update active state
    document.querySelectorAll('.brand-chip').forEach(chip => {
        chip.classList.remove('active');
    });
    
    const activeChip = document.querySelector(`[data-brand="${brand}"]`);
    if (activeChip) {
        activeChip.classList.add('active');
        // Smooth scroll to active chip
        activeChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
    
    applyFilters();
}

function applyFilters() {
    const searchInput = document.getElementById('searchInput');
    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
    
    let filtered = products;
    
    // Apply brand filter
    if (currentBrandFilter !== 'all') {
        filtered = filtered.filter(p => p.brand === currentBrandFilter);
    }
    
    // Apply search filter
    if (searchQuery) {
        filtered = filtered.filter(product => {
            const nameMatch = product.name.toLowerCase().includes(searchQuery);
            const descMatch = product.description.toLowerCase().includes(searchQuery);
            const fullDescMatch = product.fullDescription && product.fullDescription.toLowerCase().includes(searchQuery);
            const brandMatch = product.brand && product.brand.toLowerCase().includes(searchQuery);
            
            let specsMatch = false;
            if (product.specs && Array.isArray(product.specs)) {
                specsMatch = product.specs.some(spec => 
                    spec.toLowerCase().includes(searchQuery)
                );
            }
            
            return nameMatch || descMatch || fullDescMatch || specsMatch || brandMatch;
        });
    }
    
    filteredProducts = filtered;
    
    const grid = document.getElementById('productsGrid');
    const noResults = document.getElementById('noResults');
    
    
    if (filteredProducts.length === 0) {
        grid.innerHTML = '';
        noResults.style.display = 'block';
    } else {
        noResults.style.display = 'none';
        renderFilteredProducts();
    }
}

// ==================== PAGE TRANSITIONS ====================

// Плавные переходы между страницами
function fadeOutAndSwitch(callback) {
    const mainPage = document.getElementById('mainPage');
    if (mainPage) {
        mainPage.classList.add('fade-out');
        setTimeout(() => {
            if (callback) callback();
            mainPage.classList.remove('fade-out');
            mainPage.classList.add('fade-in');
            setTimeout(() => {
                mainPage.classList.remove('fade-in');
            }, 400);
        }, 300);
    }
}

// ==================== SWIPE GESTURES ====================

// Инициализация свайп жестов для модальных окон
function initSwipeGestures() {
    const modals = [
        { element: document.getElementById('cartModal'), content: '.cart-content' },
        { element: document.getElementById('productModal'), content: '.product-modal-content' }
    ];

    modals.forEach(({ element, content }) => {
        if (!element) return;
        
        const modalContent = element.querySelector(content);
        if (!modalContent) return;

        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        let initialTransform = '';

        const handleTouchStart = (e) => {
            // Проверяем что касание началось в верхней части модального окна
            const touch = e.touches[0];
            const rect = modalContent.getBoundingClientRect();
            const touchY = touch.clientY - rect.top;
            
            if (touchY > 60) return; // Свайп работает только в верхней части (где индикатор)
            
            startY = touch.clientY;
            isDragging = true;
            initialTransform = modalContent.style.transform || '';
            modalContent.style.transition = 'none';
        };

        const handleTouchMove = (e) => {
            if (!isDragging) return;
            
            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;
            
            // Позволяем свайпить только вниз
            if (deltaY > 0) {
                e.preventDefault();
                const opacity = Math.max(0, 1 - deltaY / 300);
                element.style.backgroundColor = `rgba(0, 0, 0, ${opacity * 0.5})`;
                modalContent.style.transform = `translateY(${deltaY}px)`;
            }
        };

        const handleTouchEnd = (e) => {
            if (!isDragging) return;
            
            const deltaY = currentY - startY;
            isDragging = false;
            
            modalContent.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            element.style.transition = 'background-color 0.3s ease';
            
            // Если свайпнули больше 100px вниз - закрываем
            if (deltaY > 100) {
                if (tg.HapticFeedback) {
                    tg.HapticFeedback.impactOccurred('light');
                }
                element.classList.remove('active');
                setTimeout(() => {
                    modalContent.style.transform = initialTransform;
                    element.style.backgroundColor = '';
                }, 300);
            } else {
                // Возвращаем на место
                modalContent.style.transform = initialTransform;
                element.style.backgroundColor = '';
            }
        };

        modalContent.addEventListener('touchstart', handleTouchStart, { passive: false });
        modalContent.addEventListener('touchmove', handleTouchMove, { passive: false });
        modalContent.addEventListener('touchend', handleTouchEnd);
    });
}

// ==================== FLYING PRODUCT ANIMATION ====================

// Анимация полёта товара в корзину
function createFlyingProduct(productElement, productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    // Получаем координаты карточки товара и корзины
    const productRect = productElement.getBoundingClientRect();
    const cartButton = document.getElementById('cartButton');
    const cartRect = cartButton.getBoundingClientRect();

    // Создаём летящий элемент
    const flyingProduct = document.createElement('div');
    flyingProduct.className = 'flying-product';
    flyingProduct.innerHTML = `<img src="${product.images[0]}" alt="${product.name}">`;
    
    // Начальные координаты (центр карточки товара)
    const startX = productRect.left + productRect.width / 2 - 40;
    const startY = productRect.top + productRect.height / 2 - 40;
    
    // Конечные координаты (центр кнопки корзины)
    const endX = cartRect.left + cartRect.width / 2 - 40;
    const endY = cartRect.top + cartRect.height / 2 - 40;
    
    // Позиционируем в месте нажатия
    flyingProduct.style.left = `${startX}px`;
    flyingProduct.style.top = `${startY}px`;
    flyingProduct.style.transition = 'none';
    
    document.body.appendChild(flyingProduct);

    // Запускаем анимацию через изменение left/top для плавного движения
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            flyingProduct.style.transition = 'all 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            flyingProduct.style.left = `${endX}px`;
            flyingProduct.style.top = `${endY}px`;
            flyingProduct.style.transform = 'scale(0.2) rotate(180deg)';
            flyingProduct.style.opacity = '0.3';
        });
    });

    // Удаляем элемент после анимации
    setTimeout(() => {
        flyingProduct.remove();
        
        // Добавляем пульсацию корзины
        cartButton.classList.add('pulse');
        setTimeout(() => {
            cartButton.classList.remove('pulse');
        }, 500);
    }, 700);

    // Тактильная обратная связь
    if (tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('medium');
    }
}

// Модифицируем функцию addToCart для поддержки анимации
const originalAddToCart = addToCart;
function addToCartWithAnimation(productId, sourceElement) {
    if (sourceElement) {
        // Находим ближайшую карточку товара
        const productCard = sourceElement.closest('.product-card');
        if (productCard) {
            createFlyingProduct(productCard, productId);
        }
    }
    
    // Вызываем оригинальную функцию добавления в корзину
    originalAddToCart(productId);
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    initSwipeGestures();
});

// Также инициализируем после загрузки Telegram WebApp
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSwipeGestures);
} else {
    initSwipeGestures();
}

