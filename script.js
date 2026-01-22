// ============================================
//  Campus Lost & Found - Main Application
// ============================================

// Category Icons Mapping
const categoryIcons = {
    electronics: 'fa-laptop',
    accessories: 'fa-glasses',
    documents: 'fa-file-alt',
    clothing: 'fa-tshirt',
    keys: 'fa-key',
    bags: 'fa-shopping-bag',
    other: 'fa-box'
};

// Location Names Mapping
const locationNames = {
    library: 'Library',
    cafeteria: 'Cafeteria',
    gym: 'Gymnasium',
    science: 'Science Building',
    arts: 'Arts Building',
    engineering: 'Engineering Building',
    dormitory: 'Dormitory',
    parking: 'Parking Lot',
    stadium: 'Stadium',
    other: 'Other Location'
};

// State
let currentPage = 1;
let currentFilters = {};
let allItems = [];

// Initialize on DOM Load
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    updateAuthUI();
    await loadItems();
    await loadActivityFeed();
    await loadNotifications();
    await loadStats();
    setupEventListeners();
    animateStats();
    setupScrollEffects();
    setDefaultDate();
}

// Update UI based on auth state
function updateAuthUI() {
    const user = API.Auth.getCurrentUser();
    const loginBtn = document.querySelector('.nav-actions .btn-primary');
    
    if (user && loginBtn) {
        loginBtn.innerHTML = `<i class="fas fa-user"></i> ${user.name.split(' ')[0]}`;
        loginBtn.onclick = () => openModal('profileModal');
    }

    // Update notification badge
    updateNotificationBadge();
}

async function updateNotificationBadge() {
    if (!API.Auth.isLoggedIn()) return;
    
    try {
        const data = await API.Notifications.getAll(true);
        const badge = document.querySelector('.notification-badge');
        if (badge) {
            badge.textContent = data.unreadCount || 0;
            badge.style.display = data.unreadCount > 0 ? 'flex' : 'none';
        }
    } catch (error) {
        console.log('Could not fetch notifications');
    }
}

// Load Items from API
async function loadItems(filters = {}) {
    const grid = document.getElementById('itemsGrid');
    
    try {
        grid.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading items...</div>';
        
        const data = await API.Items.getAll({ ...currentFilters, ...filters });
        allItems = data.items;
        
        if (allItems.length === 0) {
            grid.innerHTML = '<div class="no-items"><i class="fas fa-box-open"></i><p>No items found</p></div>';
            return;
        }

        grid.innerHTML = allItems.map(item => createItemCard(item)).join('');
        
        // Update load more button
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = data.pagination.page < data.pagination.pages ? 'inline-flex' : 'none';
        }
    } catch (error) {
        console.error('Error loading items:', error);
        grid.innerHTML = '<div class="error"><i class="fas fa-exclamation-circle"></i><p>Failed to load items. Please try again.</p></div>';
    }
}

function createItemCard(item) {
    const icon = categoryIcons[item.category] || 'fa-box';
    const location = locationNames[item.location] || item.location;
    const initials = item.reporter?.name?.split(' ').map(n => n[0]).join('') || '?';
    const hasReward = item.reward && item.reward.amount > 0;
    const rewardBadge = hasReward ? `
        <span class="item-reward-badge">
            <i class="fas fa-gift"></i> ₹${item.reward.amount}
        </span>
    ` : '';
    
    return `
        <div class="item-card ${hasReward ? 'has-reward' : ''}" onclick="openItemDetail(${item.id})">
            <div class="item-image">
                ${item.image ? 
                    `<img src="${item.image}" alt="${item.name}">` : 
                    `<i class="fas ${icon}"></i>`
                }
                <span class="item-status ${item.status}">${item.status}</span>
                <span class="item-category">${item.category}</span>
                ${rewardBadge}
            </div>
            <div class="item-content">
                <h3 class="item-title">${item.name}</h3>
                <div class="item-location">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${location}</span>
                </div>
                <div class="item-date">
                    <i class="fas fa-calendar-alt"></i>
                    <span>${formatDate(item.dateLostFound || item.createdAt)}</span>
                </div>
            </div>
            <div class="item-footer">
                <div class="item-reporter">
                    <div class="reporter-avatar">${initials}</div>
                    <span class="reporter-name">${item.reporter?.name || 'Anonymous'}</span>
                </div>
                <button class="item-action ${hasReward ? 'has-reward-btn' : ''}" onclick="event.stopPropagation(); claimItem(${item.id})">
                    ${item.status === 'lost' ? 'I Found This' : 'This is Mine'}
                </button>
            </div>
        </div>
    `;
}

// Load Activity Feed
async function loadActivityFeed() {
    const feed = document.getElementById('activityFeed');
    
    try {
        const data = await API.Stats.getActivity(10);
        
        if (data.activities.length === 0) {
            feed.innerHTML = '<p class="no-activity">No recent activity</p>';
            return;
        }

        feed.innerHTML = data.activities.map(activity => `
            <div class="feed-item">
                <div class="feed-icon ${activity.type}">
                    <i class="fas ${activity.type === 'lost' ? 'fa-search' : activity.type === 'found' ? 'fa-hand-holding-heart' : 'fa-handshake'}"></i>
                </div>
                <div class="feed-content">
                    <p>${activity.message}</p>
                    <span>${formatTimeAgo(activity.createdAt)}</span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading activity:', error);
        feed.innerHTML = '<p class="error">Failed to load activity</p>';
    }
}

// Load Notifications
async function loadNotifications() {
    if (!API.Auth.isLoggedIn()) return;

    const list = document.getElementById('notificationList');
    
    try {
        const data = await API.Notifications.getAll();
        
        if (data.notifications.length === 0) {
            list.innerHTML = '<p class="no-notifications">No notifications</p>';
            return;
        }

        list.innerHTML = data.notifications.map(notification => `
            <div class="notification-item ${notification.isRead ? '' : 'unread'}" onclick="handleNotificationClick(${notification.id}, ${notification.relatedItemId})">
                <div class="notification-icon ${notification.type}">
                    <i class="fas ${notification.type === 'match' ? 'fa-check-circle' : notification.type === 'claim' ? 'fa-hand-paper' : notification.type === 'approved' ? 'fa-thumbs-up' : 'fa-info-circle'}"></i>
                </div>
                <div class="notification-content">
                    <p>${notification.message}</p>
                    <span>${formatTimeAgo(notification.createdAt)}</span>
                </div>
            </div>
        `).join('');

        updateNotificationBadge();
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

// Load Statistics
async function loadStats() {
    try {
        const data = await API.Stats.getOverview();
        
        // Update stat values
        const statElements = document.querySelectorAll('[data-count]');
        statElements.forEach(el => {
            const key = el.dataset.stat;
            if (key && data.overview[key] !== undefined) {
                el.dataset.count = data.overview[key];
            }
        });

        // Update hero stats
        const heroStats = document.querySelectorAll('.hero-stats .stat-number');
        if (heroStats.length >= 3) {
            heroStats[0].dataset.count = data.overview.totalItems || 0;
            heroStats[1].dataset.count = data.overview.claimedItems + data.overview.returnedItems || 0;
            heroStats[2].dataset.count = data.overview.totalUsers || 0;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Mobile Menu
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    }

    // Category Pills
    const pills = document.querySelectorAll('.pill');
    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            pills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            const category = pill.dataset.category === 'all' ? '' : pill.dataset.category;
            currentFilters.category = category;
            
            // Sync with dropdown
            const categoryDropdown = document.getElementById('categoryFilter');
            if (categoryDropdown) {
                categoryDropdown.value = category;
            }
            
            loadItems();
        });
    });

    // Auth Tabs
    const authTabs = document.querySelectorAll('.auth-tab');
    authTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            authTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
            document.getElementById(tab.dataset.tab + 'Form').classList.add('active');
        });
    });

    // Report Type Selector
    const typeBtns = document.querySelectorAll('.type-btn');
    typeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            typeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('reportType').value = btn.dataset.type;
        });
    });

    // Image Upload
    const uploadArea = document.getElementById('imageUploadArea');
    const imageInput = document.getElementById('itemImage');
    
    if (uploadArea && imageInput) {
        uploadArea.addEventListener('click', (e) => {
            // Don't trigger if clicking on buttons
            if (e.target.closest('.btn-upload-option')) return;
            imageInput.click();
        });
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--primary)';
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.borderColor = 'var(--gray-300)';
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--gray-300)';
            handleImageUpload(e.dataTransfer.files);
        });
        imageInput.addEventListener('change', (e) => {
            handleImageUpload(e.target.files);
        });
    }

    // Forms
    document.getElementById('reportForm')?.addEventListener('submit', handleReportSubmit);
    document.getElementById('contactForm')?.addEventListener('submit', handleContactSubmit);
    document.getElementById('loginForm')?.addEventListener('submit', handleLoginSubmit);
    document.getElementById('registerForm')?.addEventListener('submit', handleRegisterSubmit);
    document.getElementById('profileForm')?.addEventListener('submit', handleProfileUpdate);
    document.getElementById('passwordForm')?.addEventListener('submit', handlePasswordChange);

    // Notification Button
    const notificationBtn = document.getElementById('notificationBtn');
    if (notificationBtn) {
        notificationBtn.addEventListener('click', toggleNotificationPanel);
    }

    // Close notification panel on outside click
    document.addEventListener('click', (e) => {
        const panel = document.getElementById('notificationPanel');
        const btn = document.getElementById('notificationBtn');
        if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
            panel.classList.remove('active');
        }
    });

    // Quick Search
    const quickSearchInput = document.getElementById('quickSearchInput');
    if (quickSearchInput) {
        let debounceTimer;
        quickSearchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                filterItems();
            }, 300);
        });
    }

    // Category and Status Filter dropdowns
    document.getElementById('categoryFilter')?.addEventListener('change', filterItems);
    document.getElementById('statusFilter')?.addEventListener('change', filterItems);

    // Load More Button
    document.getElementById('loadMoreBtn')?.addEventListener('click', async () => {
        currentPage++;
        currentFilters.page = currentPage;
        await loadItems();
    });

    // Newsletter Form
    document.querySelector('.newsletter-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = e.target.querySelector('input').value;
        
        try {
            await API.Contact.subscribeNewsletter(email);
            showToast('Successfully subscribed to notifications!', 'success');
            e.target.reset();
        } catch (error) {
            showToast(error.message || 'Failed to subscribe', 'error');
        }
    });

    // Mark all notifications as read
    document.querySelector('.mark-read')?.addEventListener('click', async () => {
        if (!API.Auth.isLoggedIn()) return;
        
        try {
            await API.Notifications.markAllAsRead();
            await loadNotifications();
            showToast('All notifications marked as read', 'success');
        } catch (error) {
            showToast('Failed to mark notifications as read', 'error');
        }
    });
}

// Scroll Effects
function setupScrollEffects() {
    const navbar = document.querySelector('.navbar');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Animate Statistics
function animateStats() {
    const stats = document.querySelectorAll('[data-count]');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = parseInt(entry.target.dataset.count);
                animateValue(entry.target, 0, target, 2000);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    stats.forEach(stat => observer.observe(stat));
}

function animateValue(element, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const value = Math.floor(progress * (end - start) + start);
        element.textContent = value.toLocaleString();
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Modal Functions
function openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    // Load profile data when opening profile modal
    if (modalId === 'profileModal' && API.Auth.isLoggedIn()) {
        loadProfile();
    }
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
    document.body.style.overflow = '';
}

// Item Detail Modal
async function openItemDetail(itemId) {
    try {
        const item = await API.Items.getById(itemId);
        
        const icon = categoryIcons[item.category] || 'fa-box';
        const location = locationNames[item.location] || item.location;
        const hasReward = item.reward && item.reward.amount > 0;
        const currencySymbol = item.reward?.currency === 'USD' ? '$' : item.reward?.currency === 'EUR' ? '€' : '₹';

        const rewardSection = hasReward ? `
            <div class="item-reward-section">
                <div class="reward-banner ${item.reward.status}">
                    <div class="reward-icon">
                        <i class="fas fa-gift"></i>
                    </div>
                    <div class="reward-details">
                        <span class="reward-label">${item.reward.status === 'paid' ? 'Reward Paid' : item.reward.status === 'claimed' ? 'Reward Claimed' : 'Reward Offered'}</span>
                        <span class="reward-amount">${currencySymbol}${item.reward.amount}</span>
                    </div>
                    ${item.reward.anonymous ? '<span class="reward-anonymous-tag"><i class="fas fa-user-secret"></i> Anonymous</span>' : ''}
                </div>
                ${item.reward.status === 'offered' ? `
                    <p class="reward-info">Help find this item and earn the reward!</p>
                ` : ''}
            </div>
        ` : '';

        const detailHTML = `
            <div class="item-detail-image">
                ${item.image ? 
                    `<img src="${item.image}" alt="${item.name}">` : 
                    `<i class="fas ${icon}"></i>`
                }
            </div>
            <div class="item-detail-content">
                <div class="item-detail-header">
                    <h2 class="item-detail-title">${item.name}</h2>
                    <span class="item-detail-status ${item.status}">${item.status.toUpperCase()}</span>
                </div>
                ${rewardSection}
                <div class="item-detail-info">
                    <div class="info-item">
                        <i class="fas fa-folder"></i>
                        <div>
                            <strong>Category</strong>
                            <span>${item.category.charAt(0).toUpperCase() + item.category.slice(1)}</span>
                        </div>
                    </div>
                    <div class="info-item">
                        <i class="fas fa-map-marker-alt"></i>
                        <div>
                            <strong>Location</strong>
                            <span>${location}</span>
                        </div>
                    </div>
                    <div class="info-item">
                        <i class="fas fa-calendar"></i>
                        <div>
                            <strong>Date</strong>
                            <span>${formatDate(item.dateLostFound)}</span>
                        </div>
                    </div>
                    <div class="info-item">
                        <i class="fas fa-user"></i>
                        <div>
                            <strong>Reported By</strong>
                            <span>${item.reporter?.name || 'Anonymous'}</span>
                        </div>
                    </div>
                </div>
                <div class="item-description">
                    <h4>Description</h4>
                    <p>${item.description}</p>
                </div>
                ${item.claims && item.claims.length > 0 ? `
                    <div class="item-claims">
                        <h4>Claims (${item.claims.length})</h4>
                        <div class="claims-list">
                            ${item.claims.map(claim => `
                                <div class="claim-item">
                                    <span class="claim-status ${claim.status}">${claim.status}</span>
                                    <span>${claim.claimer.name}</span>
                                    <span>${formatTimeAgo(claim.createdAt)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                <div class="item-detail-actions">
                    <button class="btn-primary btn-large" onclick="claimItem(${item.id}); closeModal('itemModal')">
                        <i class="fas ${item.status === 'lost' ? 'fa-hand-holding-heart' : 'fa-hand-paper'}"></i>
                        ${item.status === 'lost' ? 'I Found This Item' : 'This is My Item'}
                    </button>
                    <button class="btn-secondary btn-large" onclick="contactReporter('${item.reporter?.email || ''}')">
                        <i class="fas fa-envelope"></i>
                        Contact Reporter
                    </button>
                    ${hasReward && item.reward.status === 'offered' ? `
                        <button class="btn-reward btn-large" onclick="claimReward(${item.id})">
                            <i class="fas fa-gift"></i>
                            Claim ${currencySymbol}${item.reward.amount} Reward
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        document.getElementById('itemDetail').innerHTML = detailHTML;
        openModal('itemModal');
    } catch (error) {
        showToast('Failed to load item details', 'error');
    }
}

// Filter Items
function filterItems() {
    const search = document.getElementById('quickSearchInput')?.value || '';
    const category = document.getElementById('categoryFilter')?.value || '';
    const status = document.getElementById('statusFilter')?.value || '';

    currentFilters = {
        search: search,
        category: category,
        status: status,
        page: 1
    };
    currentPage = 1;

    // Sync category pills with dropdown
    const pills = document.querySelectorAll('.pill');
    pills.forEach(pill => {
        pill.classList.remove('active');
        const pillCategory = pill.dataset.category === 'all' ? '' : pill.dataset.category;
        if (pillCategory === category) {
            pill.classList.add('active');
        }
    });
    // If no category selected, activate "All Items" pill
    if (!category) {
        const allPill = document.querySelector('.pill[data-category="all"]');
        if (allPill) allPill.classList.add('active');
    }

    loadItems();
}

// Handle Image Upload
function handleImageUpload(files) {
    const preview = document.getElementById('imagePreview');
    preview.innerHTML = '';

    Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                preview.appendChild(img);
            };
            reader.readAsDataURL(file);
        }
    });
}

// Form Handlers
async function handleReportSubmit(e) {
    e.preventDefault();
    
    if (!API.Auth.isLoggedIn()) {
        showToast('Please login to report an item', 'error');
        closeModal('reportModal');
        openModal('loginModal');
        return;
    }

    const formData = new FormData();
    formData.append('status', document.getElementById('reportType').value);
    formData.append('name', document.getElementById('itemName').value);
    formData.append('category', document.getElementById('itemCategory').value);
    formData.append('location', document.getElementById('itemLocation').value);
    formData.append('dateLostFound', document.getElementById('itemDate').value);
    formData.append('description', document.getElementById('itemDescription').value);
    
    // Reward fields
    const offerReward = document.getElementById('offerReward')?.checked;
    if (offerReward) {
        const rewardAmount = document.getElementById('rewardAmount')?.value || 0;
        const rewardCurrency = document.getElementById('rewardCurrency')?.value || 'INR';
        const rewardAnonymous = document.getElementById('rewardAnonymous')?.checked || false;
        
        formData.append('rewardAmount', rewardAmount);
        formData.append('rewardCurrency', rewardCurrency);
        formData.append('rewardAnonymous', rewardAnonymous);
    }
    
    const imageFile = document.getElementById('itemImage').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const result = await API.Items.create(formData);
        
        closeModal('reportModal');
        e.target.reset();
        document.getElementById('imagePreview').innerHTML = '';
        
        // Reset reward fields
        if (document.getElementById('rewardFields')) {
            document.getElementById('rewardFields').style.display = 'none';
        }
        if (document.getElementById('offerReward')) {
            document.getElementById('offerReward').checked = false;
        }
        
        showToast(result.message || 'Item reported successfully!', 'success');
        
        // Reload items and activity
        await loadItems();
        await loadActivityFeed();
    } catch (error) {
        showToast(error.message || 'Failed to report item', 'error');
    }
}

async function handleContactSubmit(e) {
    e.preventDefault();
    
    const formData = {
        name: e.target.querySelector('input[type="text"]').value,
        email: e.target.querySelector('input[type="email"]').value,
        subject: e.target.querySelector('select').value,
        message: e.target.querySelector('textarea').value
    };

    try {
        await API.Contact.sendMessage(formData);
        showToast('Your message has been sent successfully!', 'success');
        e.target.reset();
    } catch (error) {
        showToast(error.message || 'Failed to send message', 'error');
    }
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    
    const email = e.target.querySelector('input[type="email"]').value;
    const password = e.target.querySelector('input[type="password"]').value;

    try {
        const result = await API.Auth.login(email, password);
        showToast(result.message || 'Login successful!', 'success');
        closeModal('loginModal');
        updateAuthUI();
        await loadNotifications();
    } catch (error) {
        showToast(error.message || 'Login failed', 'error');
    }
}

async function handleRegisterSubmit(e) {
    e.preventDefault();
    
    const inputs = e.target.querySelectorAll('input');
    const userData = {
        name: inputs[0].value,
        studentId: inputs[1].value,
        email: inputs[2].value,
        password: inputs[3].value
    };

    // Check password confirmation
    if (inputs[3].value !== inputs[4].value) {
        showToast('Passwords do not match', 'error');
        return;
    }

    try {
        const result = await API.Auth.register(userData);
        showToast(result.message || 'Registration successful!', 'success');
        closeModal('loginModal');
        updateAuthUI();
    } catch (error) {
        showToast(error.message || 'Registration failed', 'error');
    }
}

// Handle notification click
async function handleNotificationClick(notificationId, itemId) {
    try {
        await API.Notifications.markAsRead(notificationId);
        
        if (itemId) {
            closeNotificationPanel();
            openItemDetail(itemId);
        }
        
        await loadNotifications();
    } catch (error) {
        console.error('Error handling notification:', error);
    }
}

function closeNotificationPanel() {
    document.getElementById('notificationPanel')?.classList.remove('active');
}

// Utility Functions
function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    const navActions = document.querySelector('.nav-actions');
    
    if (navLinks) {
        navLinks.classList.toggle('mobile-active');
    }
    if (navActions) {
        navActions.classList.toggle('mobile-active');
    }
}

function toggleNotificationPanel() {
    const panel = document.getElementById('notificationPanel');
    panel?.classList.toggle('active');
    
    if (panel?.classList.contains('active')) {
        loadNotifications();
    }
}

async function claimItem(itemId) {
    if (!API.Auth.isLoggedIn()) {
        showToast('Please login to claim an item', 'error');
        openModal('loginModal');
        return;
    }

    try {
        const result = await API.Items.claim(itemId, 'I believe this item belongs to me / I found this item');
        showToast(result.message || 'Claim submitted successfully!', 'success');
    } catch (error) {
        showToast(error.message || 'Failed to submit claim', 'error');
    }
}

function contactReporter(email) {
    if (!email) {
        showToast('Contact information not available', 'error');
        return;
    }
    window.location.href = `mailto:${email}?subject=Regarding your Lost & Found report`;
}

function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
}

function formatTimeAgo(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    
    return formatDate(dateString);
}

function setDefaultDate() {
    const dateInput = document.getElementById('itemDate');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
        dateInput.max = today;
    }
}

// Toast Notifications
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `
        <i class="fas ${icons[type]} toast-icon"></i>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Profile Functions
async function loadProfile() {
    if (!API.Auth.isLoggedIn()) return;
    
    try {
        const data = await API.Auth.getProfile();
        
        // Update stored user data with latest from server
        sessionStorage.setItem('currentUser', JSON.stringify(data.user));
        
        // Update profile header
        document.getElementById('profileName').textContent = data.user.name;
        document.getElementById('profileEmail').textContent = data.user.email;
        
        // Update avatar - show image if available, otherwise show initials
        const profileAvatar = document.getElementById('profileAvatar');
        const avatarImg = document.getElementById('profileAvatarImg');
        const avatarIcon = document.getElementById('profileAvatarIcon');
        
        if (data.user.avatar) {
            // Show profile picture
            if (avatarImg) {
                avatarImg.src = data.user.avatar;
                avatarImg.style.display = 'block';
                avatarImg.style.width = '100%';
                avatarImg.style.height = '100%';
                avatarImg.style.objectFit = 'cover';
                avatarImg.style.borderRadius = '50%';
            }
            if (avatarIcon) avatarIcon.style.display = 'none';
        } else {
            // Show initials as fallback
            const initials = data.user.name.split(' ').map(n => n[0]).join('').toUpperCase();
            if (avatarImg) avatarImg.style.display = 'none';
            if (avatarIcon) {
                avatarIcon.style.display = 'flex';
                avatarIcon.className = '';  // Remove fa-user class
                avatarIcon.textContent = initials;
                avatarIcon.style.fontSize = '1.5rem';
                avatarIcon.style.fontWeight = 'bold';
                avatarIcon.style.fontFamily = 'Poppins, sans-serif';
            }
        }
        
        // Update form fields
        document.getElementById('editName').value = data.user.name || '';
        document.getElementById('editStudentId').value = data.user.studentId || '';
        document.getElementById('editEmail').value = data.user.email || '';
        document.getElementById('editPhone').value = data.user.phone || '';
        
        // Update stats
        document.getElementById('statTotal').textContent = data.stats?.total || 0;
        document.getElementById('statLost').textContent = data.stats?.lost || 0;
        document.getElementById('statFound').textContent = data.stats?.found || 0;
        document.getElementById('statResolved').textContent = data.stats?.resolved || 0;
        
    } catch (error) {
        console.error('Error loading profile:', error);
        showToast('Failed to load profile', 'error');
    }
}

async function loadMyItems() {
    const container = document.getElementById('myItemsList');
    
    try {
        const data = await API.Users.getItems();
        
        if (!data.items || data.items.length === 0) {
            container.innerHTML = `
                <div class="no-items-message">
                    <i class="fas fa-box-open"></i>
                    <p>You haven't reported any items yet</p>
                </div>
            `;
            return;
        }

        container.innerHTML = data.items.map(item => `
            <div class="my-item-card" onclick="openItemDetail(${item.id}); closeModal('profileModal');">
                <div class="my-item-icon">
                    <i class="fas ${categoryIcons[item.category] || 'fa-box'}"></i>
                </div>
                <div class="my-item-info">
                    <h4>${item.name}</h4>
                    <p>${locationNames[item.location] || item.location} • ${formatDate(item.dateLostFound)}</p>
                </div>
                <span class="my-item-status ${item.status}">${item.status}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading items:', error);
        container.innerHTML = '<p class="error">Failed to load your items</p>';
    }
}

async function loadMyClaims() {
    const container = document.getElementById('myClaimsList');
    
    try {
        const data = await API.Users.getClaims();
        
        if (!data.claims || data.claims.length === 0) {
            container.innerHTML = `
                <div class="no-items-message">
                    <i class="fas fa-hand-paper"></i>
                    <p>You haven't made any claims yet</p>
                </div>
            `;
            return;
        }

        container.innerHTML = data.claims.map(claim => `
            <div class="my-claim-card" onclick="openItemDetail(${claim.item.id}); closeModal('profileModal');">
                <div class="my-item-icon">
                    <i class="fas fa-hand-paper"></i>
                </div>
                <div class="my-item-info">
                    <h4>${claim.item.name}</h4>
                    <p>Claimed on ${formatDate(claim.createdAt)}</p>
                </div>
                <span class="my-item-status ${claim.status}">${claim.status}</span>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading claims:', error);
        container.innerHTML = '<p class="error">Failed to load your claims</p>';
    }
}

function switchProfileTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.profile-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });
    
    // Update tab content
    document.querySelectorAll('.profile-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    // Load data for the tab
    if (tabName === 'items') {
        loadMyItems();
    } else if (tabName === 'claims') {
        loadMyClaims();
    }
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    
    const formData = {
        name: document.getElementById('editName').value,
        phone: document.getElementById('editPhone').value
    };

    try {
        await API.Users.updateProfile(formData);
        showToast('Profile updated successfully!', 'success');
        
        // Update the stored user data
        const currentUser = API.Auth.getCurrentUser();
        if (currentUser) {
            currentUser.name = formData.name;
            currentUser.phone = formData.phone;
            sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
        }
        
        updateAuthUI();
    } catch (error) {
        showToast(error.message || 'Failed to update profile', 'error');
    }
}

async function handlePasswordChange(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('Please fill in all password fields', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }

    try {
        await API.Auth.changePassword(currentPassword, newPassword);
        showToast('Password updated successfully!', 'success');
        
        // Clear password fields
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';
    } catch (error) {
        showToast(error.message || 'Failed to update password', 'error');
    }
}

function handleLogout() {
    API.Auth.logout();
    closeModal('profileModal');
    showToast('Logged out successfully!', 'success');
    
    // Reset login button
    const loginBtn = document.querySelector('.nav-actions .btn-primary');
    if (loginBtn) {
        loginBtn.innerHTML = '<i class="fas fa-user"></i> Login';
        loginBtn.onclick = () => openModal('loginModal');
    }
    
    // Reload items
    loadItems();
}

// Make functions globally available
window.openModal = openModal;
window.closeModal = closeModal;
window.openItemDetail = openItemDetail;
window.claimItem = claimItem;
window.contactReporter = contactReporter;
window.scrollToSection = scrollToSection;
window.filterItems = filterItems;
window.handleNotificationClick = handleNotificationClick;
window.switchProfileTab = switchProfileTab;
window.handleLogout = handleLogout;
window.openCameraCapture = openCameraCapture;
window.closeCameraCapture = closeCameraCapture;
window.switchCamera = switchCamera;
window.capturePhoto = capturePhoto;
window.usePhoto = usePhoto;
window.retakePhoto = retakePhoto;

// ============================================
//  Camera Capture Functionality
// ============================================

let cameraStream = null;
let currentFacingMode = 'environment'; // 'user' for front camera, 'environment' for back
let capturedImageBlob = null;

async function openCameraCapture() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');
    
    try {
        // Check if camera is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('Camera not supported on this device', 'error');
            return;
        }
        
        openModal('cameraModal');
        
        // Request camera access
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: currentFacingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });
        
        video.srcObject = cameraStream;
        
        // Reset UI
        document.getElementById('cameraVideo').style.display = 'block';
        document.getElementById('cameraPreview').style.display = 'none';
        document.getElementById('captureBtn').style.display = 'inline-flex';
        document.getElementById('switchCameraBtn').style.display = 'inline-flex';
        document.getElementById('usePhotoBtn').style.display = 'none';
        document.getElementById('retakeBtn').style.display = 'none';
        
    } catch (error) {
        console.error('Camera error:', error);
        closeCameraCapture();
        
        if (error.name === 'NotAllowedError') {
            showToast('Camera permission denied. Please allow camera access.', 'error');
        } else if (error.name === 'NotFoundError') {
            showToast('No camera found on this device', 'error');
        } else {
            showToast('Could not access camera', 'error');
        }
    }
}

function closeCameraCapture() {
    // Stop camera stream
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    closeModal('cameraModal');
    capturedImageBlob = null;
}

async function switchCamera() {
    // Toggle facing mode
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    
    // Stop current stream
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
    }
    
    const video = document.getElementById('cameraVideo');
    
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: currentFacingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });
        
        video.srcObject = cameraStream;
    } catch (error) {
        console.error('Switch camera error:', error);
        showToast('Could not switch camera', 'error');
    }
}

function capturePhoto() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    const preview = document.getElementById('cameraPreview');
    const capturedImg = document.getElementById('capturedImage');
    
    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw video frame to canvas
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    // Convert to blob
    canvas.toBlob((blob) => {
        capturedImageBlob = blob;
        capturedImg.src = URL.createObjectURL(blob);
        
        // Show preview, hide video
        video.style.display = 'none';
        preview.style.display = 'block';
        
        // Update buttons
        document.getElementById('captureBtn').style.display = 'none';
        document.getElementById('switchCameraBtn').style.display = 'none';
        document.getElementById('usePhotoBtn').style.display = 'inline-flex';
        document.getElementById('retakeBtn').style.display = 'inline-flex';
    }, 'image/jpeg', 0.9);
}

function retakePhoto() {
    const video = document.getElementById('cameraVideo');
    const preview = document.getElementById('cameraPreview');
    
    // Show video, hide preview
    video.style.display = 'block';
    preview.style.display = 'none';
    
    // Update buttons
    document.getElementById('captureBtn').style.display = 'inline-flex';
    document.getElementById('switchCameraBtn').style.display = 'inline-flex';
    document.getElementById('usePhotoBtn').style.display = 'none';
    document.getElementById('retakeBtn').style.display = 'none';
    
    capturedImageBlob = null;
}

function usePhoto() {
    if (!capturedImageBlob) {
        showToast('No photo captured', 'error');
        return;
    }
    
    // Create a File object from the blob
    const file = new File([capturedImageBlob], 'camera-photo.jpg', { type: 'image/jpeg' });
    
    // Set the file to the image input
    const imageInput = document.getElementById('itemImage');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    imageInput.files = dataTransfer.files;
    
    // Show preview
    handleImageUpload([file]);
    
    // Close camera modal
    closeCameraCapture();
    
    showToast('Photo added successfully!', 'success');
}

// ============================================
//  Profile Picture Upload
// ============================================

// Initialize profile picture upload listener
function initProfilePictureUpload() {
    const profilePictureInput = document.getElementById('profilePictureInput');
    
    if (profilePictureInput) {
        // Remove any existing listener first
        profilePictureInput.removeEventListener('change', handleProfilePictureUpload);
        profilePictureInput.addEventListener('change', handleProfilePictureUpload);
    }
}

// Call on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initProfilePictureUpload);

async function handleProfilePictureUpload(e) {
    const file = e.target.files[0];
    
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('Image size should be less than 5MB', 'error');
        return;
    }
    
    // Check if user is logged in
    if (!API.Auth.isLoggedIn()) {
        showToast('Please login first', 'error');
        return;
    }
    
    try {
        showToast('Uploading profile picture...', 'info');
        
        const formData = new FormData();
        formData.append('avatar', file);
        
        // Get current profile data
        const user = API.Auth.getCurrentUser();
        if (user) {
            formData.append('name', user.name || '');
            if (user.phone) formData.append('phone', user.phone);
            if (user.studentId) formData.append('studentId', user.studentId);
        }
        
        const response = await fetch('/api/users/profile', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${sessionStorage.getItem('authToken')}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to upload profile picture');
        }
        
        // Update stored user data
        sessionStorage.setItem('currentUser', JSON.stringify(data.user));
        
        // Update avatar in UI immediately
        const modal = document.getElementById('profileModal');
        const imgElement = modal ? modal.querySelector('#profileAvatarImg') : null;
        const iconElement = modal ? modal.querySelector('#profileAvatarIcon') : null;
        
        if (data.user && data.user.avatar && imgElement) {
            imgElement.src = data.user.avatar;
            imgElement.style.display = 'block';
            imgElement.style.width = '100%';
            imgElement.style.height = '100%';
            imgElement.style.objectFit = 'cover';
            imgElement.style.borderRadius = '50%';
            
            if (iconElement) {
                iconElement.style.display = 'none';
            }
        }
        
        showToast('Profile picture updated!', 'success');
        
    } catch (error) {
        console.error('Profile picture upload error:', error);
        showToast(error.message || 'Failed to upload profile picture', 'error');
    }
    
    // Reset the file input so the same file can be selected again
    e.target.value = '';
}

// Update profile avatar display when profile modal opens
function updateProfileAvatar() {
    const user = API.Auth.getCurrentUser();
    if (!user) return;
    
    const profileModal = document.getElementById('profileModal');
    if (!profileModal) return;
    
    const avatarImg = profileModal.querySelector('#profileAvatarImg');
    const avatarIcon = profileModal.querySelector('#profileAvatarIcon');
    
    if (user.avatar) {
        // Show profile picture
        if (avatarImg) {
            avatarImg.src = user.avatar;
            avatarImg.style.display = 'block';
            avatarImg.style.width = '100%';
            avatarImg.style.height = '100%';
            avatarImg.style.objectFit = 'cover';
            avatarImg.style.borderRadius = '50%';
        }
        if (avatarIcon) avatarIcon.style.display = 'none';
    } else {
        // Show initials as fallback
        const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U';
        if (avatarImg) avatarImg.style.display = 'none';
        if (avatarIcon) {
            avatarIcon.style.display = 'flex';
            avatarIcon.className = '';
            avatarIcon.textContent = initials;
            avatarIcon.style.fontSize = '1.5rem';
            avatarIcon.style.fontWeight = 'bold';
            avatarIcon.style.fontFamily = 'Poppins, sans-serif';
        }
    }
    
    // Re-init profile picture upload listener
    initProfilePictureUpload();
}

// Override openModal to update profile avatar when profile modal opens
const originalOpenModal = window.openModal;
window.openModal = function(modalId) {
    if (modalId === 'profileModal') {
        // Small delay to ensure modal is rendered
        setTimeout(updateProfileAvatar, 50);
    }
    originalOpenModal(modalId);
};

// ============================================
//  Reward System Functions
// ============================================

// Toggle reward fields visibility
function toggleRewardFields() {
    const checkbox = document.getElementById('offerReward');
    const fields = document.getElementById('rewardFields');
    
    if (checkbox && fields) {
        fields.style.display = checkbox.checked ? 'block' : 'none';
        
        // Focus on amount field when shown
        if (checkbox.checked) {
            setTimeout(() => {
                document.getElementById('rewardAmount')?.focus();
            }, 100);
        }
    }
}

// Claim reward for an item
async function claimReward(itemId) {
    if (!API.Auth.isLoggedIn()) {
        showToast('Please login to claim a reward', 'error');
        closeModal('itemModal');
        openModal('loginModal');
        return;
    }

    try {
        const response = await fetch(`/api/items/${itemId}/claim-reward`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('authToken')}`
            },
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to claim reward');
        }

        closeModal('itemModal');
        showToast(data.message || 'Reward claim submitted!', 'success');
        
        // Reload items
        await loadItems();
    } catch (error) {
        showToast(error.message || 'Failed to claim reward', 'error');
    }
}

// Make reward functions globally available
window.toggleRewardFields = toggleRewardFields;
window.claimReward = claimReward;
