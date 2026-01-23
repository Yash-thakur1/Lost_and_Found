// ============================================
//  Admin Portal JavaScript
// ============================================

const ADMIN_API_BASE = '/api/admin';

// State
let currentSection = 'dashboard';
let adminToken = null;
let adminUser = null;

// ============================================
//  Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
    setupEventListeners();
});

function checkAdminAuth() {
    adminToken = sessionStorage.getItem('adminToken');
    adminUser = JSON.parse(sessionStorage.getItem('adminUser') || 'null');

    if (adminToken && adminUser) {
        showDashboard();
        loadDashboardData();
    } else {
        showLoginPage();
    }
}

function showLoginPage() {
    document.getElementById('adminLoginPage').style.display = 'flex';
    document.getElementById('adminDashboard').style.display = 'none';
}

function showDashboard() {
    document.getElementById('adminLoginPage').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'flex';
    document.getElementById('adminName').textContent = adminUser?.name || 'Admin';
}

// ============================================
//  Event Listeners
// ============================================

function setupEventListeners() {
    // Admin Login Form
    document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            navigateToSection(section);
        });
    });

    // Toggle Sidebar
    document.getElementById('toggleSidebar').addEventListener('click', toggleSidebar);

    // Search inputs
    document.getElementById('itemSearch')?.addEventListener('input', debounce(loadItems, 300));
    document.getElementById('userSearch')?.addEventListener('input', debounce(loadUsers, 300));
    document.getElementById('claimSearch')?.addEventListener('input', debounce(loadClaims, 300));
    document.getElementById('messageSearch')?.addEventListener('input', debounce(loadMessages, 300));
    document.getElementById('activitySearch')?.addEventListener('input', debounce(loadActivityLog, 300));

    // Filters
    document.getElementById('itemStatusFilter')?.addEventListener('change', loadItems);
    document.getElementById('itemCategoryFilter')?.addEventListener('change', loadItems);
    document.getElementById('claimStatusFilter')?.addEventListener('change', loadClaims);
    document.getElementById('activityTypeFilter')?.addEventListener('change', loadActivityLog);

    // Forms
    document.getElementById('editItemForm')?.addEventListener('submit', handleEditItem);
    document.getElementById('userForm')?.addEventListener('submit', handleUserForm);
    document.getElementById('adminProfileForm')?.addEventListener('submit', handleAdminProfile);
    document.getElementById('adminPasswordForm')?.addEventListener('submit', handleAdminPassword);
    document.getElementById('archiveSettingsForm')?.addEventListener('submit', saveArchiveSettings);
    document.getElementById('emailSettingsForm')?.addEventListener('submit', saveEmailSettings);
    document.getElementById('newsletterForm')?.addEventListener('submit', sendNewsletter);
    
    // Archive search
    document.getElementById('archiveSearch')?.addEventListener('input', debounce(loadArchivedItemsAdmin, 300));
    
    // Avatar upload listener
    setupAvatarUploadListener();
}

// ============================================
//  Authentication
// ============================================

async function handleAdminLogin(e) {
    e.preventDefault();

    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;

    try {
        const response = await fetch(`${ADMIN_API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        adminToken = data.token;
        adminUser = data.admin;
        sessionStorage.setItem('adminToken', adminToken);
        sessionStorage.setItem('adminUser', JSON.stringify(adminUser));

        showDashboard();
        loadDashboardData();
        showToast('Welcome back, ' + adminUser.name, 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function adminLogout() {
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminUser');
    adminToken = null;
    adminUser = null;
    showLoginPage();
    showToast('Logged out successfully', 'success');
}

// ============================================
//  API Helpers
// ============================================

async function adminFetch(endpoint, options = {}) {
    const headers = {
        'Authorization': `Bearer ${adminToken}`,
        ...options.headers
    };

    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${ADMIN_API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

// ============================================
//  Navigation
// ============================================

function navigateToSection(section) {
    currentSection = section;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === section);
    });

    // Update sections
    document.querySelectorAll('.admin-section').forEach(s => {
        s.classList.toggle('active', s.id === `section-${section}`);
    });

    // Update page title
    const titles = {
        dashboard: 'Dashboard',
        items: 'Manage Items',
        users: 'Manage Users',
        claims: 'Claims',
        messages: 'Messages',
        activity: 'Activity Log',
        email: 'Email Settings',
        settings: 'Settings'
    };
    document.getElementById('pageTitle').textContent = titles[section] || 'Dashboard';

    // Load section data
    loadSectionData(section);

    // Close mobile sidebar
    document.querySelector('.admin-sidebar').classList.remove('mobile-open');
}

function loadSectionData(section) {
    switch (section) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'items':
            loadItems();
            break;
        case 'archive':
            loadArchiveSection();
            break;
        case 'users':
            loadUsers();
            break;
        case 'claims':
            loadClaims();
            break;
        case 'messages':
            loadMessages();
            break;
        case 'activity':
            loadActivityLog();
            break;
        case 'email':
            loadEmailSettings();
            break;
        case 'settings':
            loadAdminSettings();
            break;
    }
}

function toggleSidebar() {
    const sidebar = document.querySelector('.admin-sidebar');
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');
    } else {
        sidebar.classList.toggle('collapsed');
    }
}

// ============================================
//  Dashboard
// ============================================

async function loadDashboardData() {
    try {
        const data = await adminFetch('/stats');

        document.getElementById('totalItems').textContent = data.totalItems || 0;
        document.getElementById('totalUsers').textContent = data.totalUsers || 0;
        document.getElementById('lostItems').textContent = data.lostItems || 0;
        document.getElementById('foundItems').textContent = data.foundItems || 0;
        document.getElementById('claimedItems').textContent = data.claimedItems || 0;
        document.getElementById('totalMessages').textContent = data.totalMessages || 0;

        // Load recent activity
        loadRecentActivity();
        loadNewUsers();
    } catch (error) {
        console.error('Failed to load dashboard:', error);
    }
}

async function loadRecentActivity() {
    const container = document.getElementById('recentActivity');

    try {
        const data = await adminFetch('/activity?limit=5');

        if (!data.activities || data.activities.length === 0) {
            container.innerHTML = '<p class="no-data">No recent activity</p>';
            return;
        }

        container.innerHTML = data.activities.map(activity => `
            <div class="activity-item">
                <div class="activity-icon ${activity.type}">
                    <i class="fas ${getActivityIcon(activity.type)}"></i>
                </div>
                <div class="activity-content">
                    <p>${activity.message}</p>
                    <span>${formatTimeAgo(activity.createdAt)}</span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = '<p class="error">Failed to load activity</p>';
    }
}

async function loadNewUsers() {
    const container = document.getElementById('newUsers');

    try {
        const data = await adminFetch('/users?limit=5');

        if (!data.users || data.users.length === 0) {
            container.innerHTML = '<p class="no-data">No users yet</p>';
            return;
        }

        container.innerHTML = data.users.map(user => `
            <div class="user-item">
                <div class="user-avatar">${getInitials(user.name)}</div>
                <div class="user-info">
                    <h4>${user.name}</h4>
                    <p>${user.email}</p>
                </div>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = '<p class="error">Failed to load users</p>';
    }
}

// ============================================
//  Items Management
// ============================================

async function loadItems() {
    const tbody = document.getElementById('itemsTableBody');
    const search = document.getElementById('itemSearch')?.value || '';
    const status = document.getElementById('itemStatusFilter')?.value || '';
    const category = document.getElementById('itemCategoryFilter')?.value || '';

    tbody.innerHTML = '<tr><td colspan="9" class="loading"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (status) params.append('status', status);
        if (category) params.append('category', category);

        const data = await adminFetch(`/items?${params.toString()}`);

        if (!data.items || data.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="loading">No items found</td></tr>';
            return;
        }

        tbody.innerHTML = data.items.map(item => {
            const imagePath = item.image ? (item.image.startsWith('/uploads') ? item.image : `/uploads/${item.image}`) : null;
            return `
            <tr>
                <td>${item.id}</td>
                <td>
                    ${imagePath 
                        ? `<img src="${imagePath}" class="item-image" alt="${escapeHtml(item.name)}">` 
                        : '<div class="item-image-placeholder"><i class="fas fa-image"></i></div>'}
                </td>
                <td>${escapeHtml(item.name)}</td>
                <td>${capitalize(item.category)}</td>
                <td><span class="status-badge ${item.status}">${capitalize(item.status)}</span></td>
                <td>${capitalize(item.location)}</td>
                <td>${item.reporterName || 'Unknown'}</td>
                <td>${formatDate(item.created_at)}</td>
                <td>
                    <div class="action-btns">
                        <button class="btn-action edit" onclick="openEditItemModal(${item.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-action delete" onclick="confirmDeleteItem(${item.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `}).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading">Failed to load items</td></tr>';
        showToast(error.message, 'error');
    }
}

async function openEditItemModal(itemId) {
    try {
        const data = await adminFetch(`/items/${itemId}`);
        const item = data.item;

        document.getElementById('editItemId').value = item.id;
        document.getElementById('editItemName').value = item.name;
        document.getElementById('editItemCategory').value = item.category;
        document.getElementById('editItemStatus').value = item.status;
        document.getElementById('editItemLocation').value = item.location;
        document.getElementById('editItemDescription').value = item.description || '';

        openAdminModal('editItemModal');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function handleEditItem(e) {
    e.preventDefault();

    const itemId = document.getElementById('editItemId').value;
    const formData = {
        name: document.getElementById('editItemName').value,
        category: document.getElementById('editItemCategory').value,
        status: document.getElementById('editItemStatus').value,
        location: document.getElementById('editItemLocation').value,
        description: document.getElementById('editItemDescription').value
    };

    try {
        await adminFetch(`/items/${itemId}`, {
            method: 'PUT',
            body: JSON.stringify(formData)
        });

        closeAdminModal('editItemModal');
        loadItems();
        showToast('Item updated successfully', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function confirmDeleteItem(itemId) {
    document.getElementById('confirmMessage').textContent = 'Are you sure you want to delete this item? This action cannot be undone.';
    document.getElementById('confirmBtn').onclick = () => deleteItem(itemId);
    openAdminModal('confirmModal');
}

async function deleteItem(itemId) {
    try {
        await adminFetch(`/items/${itemId}`, { method: 'DELETE' });
        closeAdminModal('confirmModal');
        loadItems();
        showToast('Item deleted successfully', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ============================================
//  Users Management
// ============================================

async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    const search = document.getElementById('userSearch')?.value || '';

    tbody.innerHTML = '<tr><td colspan="9" class="loading"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const params = new URLSearchParams();
        if (search) params.append('search', search);

        const data = await adminFetch(`/users?${params.toString()}`);

        if (!data.users || data.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="loading">No users found</td></tr>';
            return;
        }

        tbody.innerHTML = data.users.map(user => {
            const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U';
            const avatarContent = user.avatar 
                ? `<img src="${user.avatar.startsWith('/uploads') ? user.avatar : '/uploads/' + user.avatar}" alt="${escapeHtml(user.name)}">`
                : initials;
            
            return `
                <tr>
                    <td>${user.id}</td>
                    <td>
                        <div class="user-avatar-cell">
                            ${avatarContent}
                        </div>
                    </td>
                    <td>${escapeHtml(user.name)}</td>
                    <td>${escapeHtml(user.email)}</td>
                    <td>${user.studentId || '-'}</td>
                    <td>${user.phone || '-'}</td>
                    <td>${user.itemCount || 0}</td>
                    <td>${formatDate(user.createdAt)}</td>
                    <td>
                        <div class="action-btns">
                            <button class="btn-action edit" onclick="openEditUserModal(${user.id})" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-action delete" onclick="confirmDeleteUser(${user.id})" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading">Failed to load users</td></tr>';
        showToast(error.message, 'error');
    }
}

function openAddUserModal() {
    document.getElementById('userModalTitle').innerHTML = '<i class="fas fa-user-plus"></i> Add User';
    document.getElementById('userFormSubmitBtn').textContent = 'Add User';
    document.getElementById('editUserId').value = '';
    document.getElementById('userFormName').value = '';
    document.getElementById('userFormEmail').value = '';
    document.getElementById('userFormStudentId').value = '';
    document.getElementById('userFormPhone').value = '';
    document.getElementById('userFormPassword').value = '';
    document.getElementById('passwordGroup').style.display = 'block';
    document.getElementById('userFormEmail').removeAttribute('readonly');
    
    // Reset avatar preview
    resetAvatarPreview();
    
    openAdminModal('userModal');
}

async function openEditUserModal(userId) {
    try {
        const data = await adminFetch(`/users/${userId}`);
        const user = data.user;

        document.getElementById('userModalTitle').innerHTML = '<i class="fas fa-user-edit"></i> Edit User';
        document.getElementById('userFormSubmitBtn').textContent = 'Save Changes';
        document.getElementById('editUserId').value = user.id;
        document.getElementById('userFormName').value = user.name;
        document.getElementById('userFormEmail').value = user.email;
        document.getElementById('userFormStudentId').value = user.studentId || '';
        document.getElementById('userFormPhone').value = user.phone || '';
        document.getElementById('userFormPassword').value = '';
        document.getElementById('passwordGroup').style.display = 'none';
        document.getElementById('userFormEmail').setAttribute('readonly', true);

        // Update avatar preview
        updateAvatarPreview(user);

        openAdminModal('userModal');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Avatar preview functions
function resetAvatarPreview() {
    const preview = document.getElementById('userAvatarPreview');
    const removeBtn = document.getElementById('removeAvatarBtn');
    const fileInput = document.getElementById('userFormAvatar');
    
    if (preview) {
        preview.innerHTML = '<i class="fas fa-user"></i>';
    }
    if (removeBtn) {
        removeBtn.style.display = 'none';
    }
    if (fileInput) {
        fileInput.value = '';
    }
    
    // Store current avatar state
    window.currentUserAvatar = null;
    window.removeUserAvatarFlag = false;
}

function updateAvatarPreview(user) {
    const preview = document.getElementById('userAvatarPreview');
    const removeBtn = document.getElementById('removeAvatarBtn');
    
    if (user.avatar) {
        const avatarUrl = user.avatar.startsWith('/uploads') ? user.avatar : '/uploads/' + user.avatar;
        if (preview) {
            preview.innerHTML = `<img src="${avatarUrl}" alt="${escapeHtml(user.name)}">`;
        }
        if (removeBtn) {
            removeBtn.style.display = 'inline-flex';
        }
        window.currentUserAvatar = user.avatar;
    } else {
        const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U';
        if (preview) {
            preview.innerHTML = initials;
        }
        if (removeBtn) {
            removeBtn.style.display = 'none';
        }
        window.currentUserAvatar = null;
    }
    
    window.removeUserAvatarFlag = false;
}

function removeUserAvatar() {
    const preview = document.getElementById('userAvatarPreview');
    const removeBtn = document.getElementById('removeAvatarBtn');
    const fileInput = document.getElementById('userFormAvatar');
    
    if (preview) {
        preview.innerHTML = '<i class="fas fa-user"></i>';
    }
    if (removeBtn) {
        removeBtn.style.display = 'none';
    }
    if (fileInput) {
        fileInput.value = '';
    }
    
    window.removeUserAvatarFlag = true;
    showToast('Avatar will be removed on save', 'info');
}

// Setup avatar file input listener
function setupAvatarUploadListener() {
    const fileInput = document.getElementById('userFormAvatar');
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                if (!file.type.startsWith('image/')) {
                    showToast('Please select an image file', 'error');
                    return;
                }
                if (file.size > 5 * 1024 * 1024) {
                    showToast('Image size should be less than 5MB', 'error');
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    const preview = document.getElementById('userAvatarPreview');
                    const removeBtn = document.getElementById('removeAvatarBtn');
                    if (preview) {
                        preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
                    }
                    if (removeBtn) {
                        removeBtn.style.display = 'inline-flex';
                    }
                    window.removeUserAvatarFlag = false;
                };
                reader.readAsDataURL(file);
            }
        });
    }
}

async function handleUserForm(e) {
    e.preventDefault();

    const userId = document.getElementById('editUserId').value;
    const avatarFile = document.getElementById('userFormAvatar')?.files[0];
    
    // Prepare form data
    const name = document.getElementById('userFormName').value;
    const email = document.getElementById('userFormEmail').value;
    const studentId = document.getElementById('userFormStudentId').value;
    const phone = document.getElementById('userFormPhone').value;

    if (!userId) {
        const password = document.getElementById('userFormPassword').value;
        if (!password) {
            showToast('Password is required for new users', 'error');
            return;
        }
        
        // Create new user (without avatar for now)
        try {
            await adminFetch('/users', {
                method: 'POST',
                body: JSON.stringify({ name, email, studentId, phone, password })
            });
            showToast('User created successfully', 'success');
            closeAdminModal('userModal');
            loadUsers();
        } catch (error) {
            showToast(error.message, 'error');
        }
        return;
    }

    try {
        // Update user with FormData for avatar support
        const formData = new FormData();
        formData.append('name', name);
        formData.append('email', email);
        formData.append('studentId', studentId);
        formData.append('phone', phone);
        
        if (avatarFile) {
            formData.append('avatar', avatarFile);
        }
        
        if (window.removeUserAvatarFlag) {
            formData.append('removeAvatar', 'true');
        }

        const response = await fetch(`${ADMIN_API_BASE}/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${adminToken}`
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to update user');
        }

        showToast('User updated successfully', 'success');
        closeAdminModal('userModal');
        loadUsers();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function confirmDeleteUser(userId) {
    document.getElementById('confirmMessage').textContent = 'Are you sure you want to delete this user? All their items and claims will also be deleted.';
    document.getElementById('confirmBtn').onclick = () => deleteUser(userId);
    openAdminModal('confirmModal');
}

async function deleteUser(userId) {
    try {
        await adminFetch(`/users/${userId}`, { method: 'DELETE' });
        closeAdminModal('confirmModal');
        loadUsers();
        showToast('User deleted successfully', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ============================================
//  Claims Management
// ============================================

async function loadClaims() {
    const tbody = document.getElementById('claimsTableBody');
    const search = document.getElementById('claimSearch')?.value || '';
    const status = document.getElementById('claimStatusFilter')?.value || '';

    tbody.innerHTML = '<tr><td colspan="8" class="loading"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (status) params.append('status', status);

        const data = await adminFetch(`/claims?${params.toString()}`);

        if (!data.claims || data.claims.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading">No claims found</td></tr>';
            return;
        }

        tbody.innerHTML = data.claims.map(claim => `
            <tr>
                <td>${claim.id}</td>
                <td>${escapeHtml(claim.itemName)}</td>
                <td>${escapeHtml(claim.claimerName)}</td>
                <td>${escapeHtml(claim.ownerName)}</td>
                <td>${escapeHtml(claim.message?.substring(0, 50) || '')}${claim.message?.length > 50 ? '...' : ''}</td>
                <td><span class="status-badge ${claim.status}">${capitalize(claim.status)}</span></td>
                <td>${formatDate(claim.createdAt)}</td>
                <td>
                    <div class="action-btns">
                        ${claim.status === 'pending' ? `
                            <button class="btn-action approve" onclick="updateClaimStatus(${claim.id}, 'approved')" title="Approve">
                                <i class="fas fa-check"></i>
                            </button>
                            <button class="btn-action reject" onclick="updateClaimStatus(${claim.id}, 'rejected')" title="Reject">
                                <i class="fas fa-times"></i>
                            </button>
                        ` : ''}
                        <button class="btn-action delete" onclick="confirmDeleteClaim(${claim.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Failed to load claims</td></tr>';
        showToast(error.message, 'error');
    }
}

async function updateClaimStatus(claimId, status) {
    try {
        await adminFetch(`/claims/${claimId}`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
        loadClaims();
        showToast(`Claim ${status} successfully`, 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function confirmDeleteClaim(claimId) {
    document.getElementById('confirmMessage').textContent = 'Are you sure you want to delete this claim?';
    document.getElementById('confirmBtn').onclick = () => deleteClaim(claimId);
    openAdminModal('confirmModal');
}

async function deleteClaim(claimId) {
    try {
        await adminFetch(`/claims/${claimId}`, { method: 'DELETE' });
        closeAdminModal('confirmModal');
        loadClaims();
        showToast('Claim deleted successfully', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ============================================
//  Messages
// ============================================

async function loadMessages() {
    const tbody = document.getElementById('messagesTableBody');
    const search = document.getElementById('messageSearch')?.value || '';

    tbody.innerHTML = '<tr><td colspan="7" class="loading"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const params = new URLSearchParams();
        if (search) params.append('search', search);

        const data = await adminFetch(`/messages?${params.toString()}`);

        if (!data.messages || data.messages.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading">No messages found</td></tr>';
            return;
        }

        tbody.innerHTML = data.messages.map(msg => `
            <tr>
                <td>${msg.id}</td>
                <td>${escapeHtml(msg.name)}</td>
                <td>${escapeHtml(msg.email)}</td>
                <td>${escapeHtml(msg.subject)}</td>
                <td>${escapeHtml(msg.message?.substring(0, 50) || '')}${msg.message?.length > 50 ? '...' : ''}</td>
                <td>${formatDate(msg.createdAt)}</td>
                <td>
                    <div class="action-btns">
                        <button class="btn-action view" onclick="viewMessage(${msg.id})" title="View">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn-action delete" onclick="confirmDeleteMessage(${msg.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Failed to load messages</td></tr>';
        showToast(error.message, 'error');
    }
}

async function viewMessage(messageId) {
    try {
        const data = await adminFetch(`/messages/${messageId}`);
        const msg = data.message;

        document.getElementById('messageName').textContent = msg.name;
        document.getElementById('messageEmail').textContent = msg.email;
        document.getElementById('messageSubject').textContent = msg.subject;
        document.getElementById('messageDate').textContent = formatDate(msg.createdAt);
        document.getElementById('messageBody').textContent = msg.message;
        document.getElementById('replyEmailLink').href = `mailto:${msg.email}?subject=Re: ${msg.subject}`;

        openAdminModal('viewMessageModal');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function confirmDeleteMessage(messageId) {
    document.getElementById('confirmMessage').textContent = 'Are you sure you want to delete this message?';
    document.getElementById('confirmBtn').onclick = () => deleteMessage(messageId);
    openAdminModal('confirmModal');
}

async function deleteMessage(messageId) {
    try {
        await adminFetch(`/messages/${messageId}`, { method: 'DELETE' });
        closeAdminModal('confirmModal');
        loadMessages();
        showToast('Message deleted successfully', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ============================================
//  Activity Log
// ============================================

async function loadActivityLog() {
    const tbody = document.getElementById('activityTableBody');
    const search = document.getElementById('activitySearch')?.value || '';
    const type = document.getElementById('activityTypeFilter')?.value || '';

    tbody.innerHTML = '<tr><td colspan="6" class="loading"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';

    try {
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (type) params.append('type', type);

        const data = await adminFetch(`/activity?${params.toString()}`);

        if (!data.activities || data.activities.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">No activity found</td></tr>';
            return;
        }

        tbody.innerHTML = data.activities.map(activity => `
            <tr>
                <td>${activity.id}</td>
                <td><span class="status-badge ${activity.type}">${capitalize(activity.type)}</span></td>
                <td>${escapeHtml(activity.message)}</td>
                <td>${activity.userName || '-'}</td>
                <td>${activity.itemName || '-'}</td>
                <td>${formatDate(activity.createdAt)}</td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Failed to load activity</td></tr>';
        showToast(error.message, 'error');
    }
}

// ============================================
//  Settings
// ============================================
//  Email Settings
// ============================================

async function loadEmailSettings() {
    try {
        const data = await adminFetch('/email-settings');
        const settings = data.settings;
        
        document.getElementById('smtpHost').value = settings.smtp_host || '';
        document.getElementById('smtpPort').value = settings.smtp_port || 587;
        document.getElementById('smtpUser').value = settings.smtp_user || '';
        document.getElementById('smtpPass').value = settings.smtp_pass || '';
        document.getElementById('smtpSecure').checked = settings.smtp_secure === true;
        document.getElementById('fromEmail').value = settings.from_email || '';
        document.getElementById('fromName').value = settings.from_name || '';
        document.getElementById('emailEnabled').checked = settings.email_enabled === true;
        
        // Load subscriber stats
        loadSubscriberStats();
    } catch (error) {
        console.error('Failed to load email settings:', error);
    }
}

async function saveEmailSettings(e) {
    e.preventDefault();
    
    const settings = {
        smtp_host: document.getElementById('smtpHost').value,
        smtp_port: parseInt(document.getElementById('smtpPort').value),
        smtp_user: document.getElementById('smtpUser').value,
        smtp_pass: document.getElementById('smtpPass').value,
        smtp_secure: document.getElementById('smtpSecure').checked,
        from_email: document.getElementById('fromEmail').value,
        from_name: document.getElementById('fromName').value,
        email_enabled: document.getElementById('emailEnabled').checked
    };
    
    try {
        await adminFetch('/email-settings', {
            method: 'PUT',
            body: JSON.stringify(settings)
        });
        showToast('Email settings saved successfully', 'success');
    } catch (error) {
        showToast(error.message || 'Failed to save email settings', 'error');
    }
}

async function testEmailConnection() {
    try {
        showToast('Testing email connection...', 'info');
        const data = await adminFetch('/test-email', { method: 'POST' });
        showToast(data.message || 'Test email sent successfully!', 'success');
    } catch (error) {
        showToast(error.details || error.message || 'Email test failed', 'error');
    }
}

async function loadSubscriberStats() {
    try {
        const data = await adminFetch('/subscriber-stats');
        const stats = data.stats;
        
        const container = document.getElementById('subscriberStats');
        container.innerHTML = `
            <div class="stat-item">
                <span class="stat-value">${stats.newsletter_subscribers || 0}</span>
                <span class="stat-label">Newsletter</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${stats.claims_subscribers || 0}</span>
                <span class="stat-label">Claims</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${stats.matches_subscribers || 0}</span>
                <span class="stat-label">Matches</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${stats.expiry_subscribers || 0}</span>
                <span class="stat-label">Expiry</span>
            </div>
        `;
    } catch (error) {
        console.error('Failed to load subscriber stats:', error);
    }
}

async function sendNewsletter(e) {
    e.preventDefault();
    
    const subject = document.getElementById('newsletterSubject').value;
    const content = document.getElementById('newsletterContent').value;
    
    if (!subject || !content) {
        showToast('Please fill in both subject and content', 'error');
        return;
    }
    
    if (!confirm('Are you sure you want to send this newsletter to all subscribers?')) {
        return;
    }
    
    try {
        showToast('Sending newsletter...', 'info');
        const data = await adminFetch('/send-newsletter', {
            method: 'POST',
            body: JSON.stringify({ subject, content })
        });
        
        showToast(`Newsletter sent to ${data.sent} subscribers`, 'success');
        document.getElementById('newsletterSubject').value = '';
        document.getElementById('newsletterContent').value = '';
    } catch (error) {
        showToast(error.message || 'Failed to send newsletter', 'error');
    }
}

// ============================================
//  Admin Settings
// ============================================

function loadAdminSettings() {
    if (adminUser) {
        document.getElementById('settingsAdminName').value = adminUser.name || '';
        document.getElementById('settingsAdminEmail').value = adminUser.email || '';
    }
}

async function handleAdminProfile(e) {
    e.preventDefault();

    const name = document.getElementById('settingsAdminName').value;

    try {
        const data = await adminFetch('/profile', {
            method: 'PUT',
            body: JSON.stringify({ name })
        });

        adminUser.name = name;
        sessionStorage.setItem('adminUser', JSON.stringify(adminUser));
        document.getElementById('adminName').textContent = name;

        showToast('Profile updated successfully', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function handleAdminPassword(e) {
    e.preventDefault();

    const currentPassword = document.getElementById('currentAdminPassword').value;
    const newPassword = document.getElementById('newAdminPassword').value;
    const confirmPassword = document.getElementById('confirmAdminPassword').value;

    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }

    try {
        await adminFetch('/password', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword, newPassword })
        });

        document.getElementById('currentAdminPassword').value = '';
        document.getElementById('newAdminPassword').value = '';
        document.getElementById('confirmAdminPassword').value = '';

        showToast('Password changed successfully', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function exportData() {
    try {
        const data = await adminFetch('/export');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `campus-lf-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Data exported successfully', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function clearOldData() {
    document.getElementById('confirmMessage').textContent = 'This will delete all items and claims older than 6 months. Continue?';
    document.getElementById('confirmBtn').textContent = 'Clear Data';
    document.getElementById('confirmBtn').onclick = async () => {
        try {
            await adminFetch('/clear-old', { method: 'DELETE' });
            closeAdminModal('confirmModal');
            loadDashboardData();
            showToast('Old data cleared successfully', 'success');
        } catch (error) {
            showToast(error.message, 'error');
        }
    };
    openAdminModal('confirmModal');
}

// ============================================
//  Modal Functions
// ============================================

function openAdminModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeAdminModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// ============================================
//  Utility Functions
// ============================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <p>${message}</p>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatTimeAgo(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return formatDate(dateString);
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

function getActivityIcon(type) {
    const icons = {
        lost: 'fa-search',
        found: 'fa-hand-holding-heart',
        claimed: 'fa-handshake',
        returned: 'fa-check-circle'
    };
    return icons[type] || 'fa-info-circle';
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================
//  Archive Management Functions
// ============================================

let selectedArchivedItems = [];

async function loadArchiveSection() {
    await Promise.all([
        loadArchiveStats(),
        loadArchiveSettings(),
        loadArchivedItemsAdmin()
    ]);
}

async function loadArchiveStats() {
    try {
        const stats = await adminFetch('/archive-stats');
        
        document.getElementById('archivedCount').textContent = stats.archived || 0;
        document.getElementById('activeCount').textContent = stats.active || 0;
        document.getElementById('expiringCount').textContent = stats.expiringSoon || 0;
        document.getElementById('old30Count').textContent = stats.oldItems?.over30Days || 0;
        document.getElementById('old60Count').textContent = stats.oldItems?.over60Days || 0;
        document.getElementById('old90Count').textContent = stats.oldItems?.over90Days || 0;
    } catch (error) {
        console.error('Error loading archive stats:', error);
    }
}

async function loadArchiveSettings() {
    try {
        const data = await adminFetch('/archive-settings');
        const settings = data.settings || {};
        
        document.getElementById('autoArchiveDays').value = settings.auto_archive_days || 30;
        document.getElementById('expiryWarningDays').value = settings.expiry_warning_days || 7;
        document.getElementById('maxExtensions').value = settings.max_extensions || 2;
        document.getElementById('extensionDays').value = settings.extension_days || 30;
    } catch (error) {
        console.error('Error loading archive settings:', error);
    }
}

async function saveArchiveSettings(e) {
    e.preventDefault();
    
    try {
        await adminFetch('/archive-settings', {
            method: 'PUT',
            body: JSON.stringify({
                auto_archive_days: parseInt(document.getElementById('autoArchiveDays').value),
                expiry_warning_days: parseInt(document.getElementById('expiryWarningDays').value),
                max_extensions: parseInt(document.getElementById('maxExtensions').value),
                extension_days: parseInt(document.getElementById('extensionDays').value)
            })
        });
        
        showToast('Archive settings saved successfully', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function loadArchivedItemsAdmin() {
    const tbody = document.getElementById('archivedTableBody');
    const search = document.getElementById('archiveSearch')?.value || '';
    
    try {
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        
        const data = await adminFetch(`/archived-items?${params}`);
        
        if (!data.items || data.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty">No archived items found</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.items.map(item => `
            <tr data-id="${item.id}">
                <td><input type="checkbox" class="archived-checkbox" value="${item.id}" onchange="updateArchivedSelection()"></td>
                <td>
                    <div class="item-cell">
                        ${item.image ? `<img src="/uploads/${item.image}" alt="${escapeHtml(item.name)}" class="item-thumb">` : '<div class="item-thumb no-image"><i class="fas fa-image"></i></div>'}
                        <span>${escapeHtml(item.name)}</span>
                    </div>
                </td>
                <td><span class="badge">${capitalize(item.category)}</span></td>
                <td>${escapeHtml(item.reporterName) || 'Unknown'}</td>
                <td>${formatDate(item.created_at)}</td>
                <td>${formatDate(item.archived_at)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon success" onclick="restoreSingleItem(${item.id})" title="Restore">
                            <i class="fas fa-undo"></i>
                        </button>
                        <button class="btn-icon danger" onclick="deleteArchivedItem(${item.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7" class="error">Error loading archived items</td></tr>`;
        console.error('Error loading archived items:', error);
    }
}

function toggleSelectAllArchived() {
    const selectAll = document.getElementById('selectAllArchived');
    const checkboxes = document.querySelectorAll('.archived-checkbox');
    
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
    updateArchivedSelection();
}

function updateArchivedSelection() {
    const checkboxes = document.querySelectorAll('.archived-checkbox:checked');
    selectedArchivedItems = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    const bulkActions = document.getElementById('archiveBulkActions');
    const countSpan = document.getElementById('selectedArchivedCount');
    
    if (selectedArchivedItems.length > 0) {
        bulkActions.style.display = 'flex';
        countSpan.textContent = `${selectedArchivedItems.length} item${selectedArchivedItems.length > 1 ? 's' : ''} selected`;
    } else {
        bulkActions.style.display = 'none';
    }
}

async function restoreSingleItem(itemId) {
    try {
        await adminFetch('/bulk-archive', {
            method: 'POST',
            body: JSON.stringify({
                itemIds: [itemId],
                action: 'unarchive'
            })
        });
        
        showToast('Item restored successfully', 'success');
        loadArchiveStats();
        loadArchivedItemsAdmin();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function bulkRestoreItems() {
    if (selectedArchivedItems.length === 0) return;
    
    try {
        await adminFetch('/bulk-archive', {
            method: 'POST',
            body: JSON.stringify({
                itemIds: selectedArchivedItems,
                action: 'unarchive'
            })
        });
        
        showToast(`${selectedArchivedItems.length} items restored successfully`, 'success');
        selectedArchivedItems = [];
        loadArchiveStats();
        loadArchivedItemsAdmin();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function deleteArchivedItem(itemId) {
    document.getElementById('confirmMessage').textContent = 'Are you sure you want to permanently delete this archived item?';
    document.getElementById('confirmBtn').textContent = 'Delete';
    document.getElementById('confirmBtn').onclick = async () => {
        try {
            await adminFetch(`/items/${itemId}`, { method: 'DELETE' });
            closeAdminModal('confirmModal');
            showToast('Item deleted successfully', 'success');
            loadArchiveStats();
            loadArchivedItemsAdmin();
        } catch (error) {
            showToast(error.message, 'error');
        }
    };
    openAdminModal('confirmModal');
}

async function bulkDeleteArchivedItems() {
    if (selectedArchivedItems.length === 0) return;
    
    document.getElementById('confirmMessage').textContent = `Are you sure you want to permanently delete ${selectedArchivedItems.length} archived item(s)?`;
    document.getElementById('confirmBtn').textContent = 'Delete All';
    document.getElementById('confirmBtn').onclick = async () => {
        try {
            for (const itemId of selectedArchivedItems) {
                await adminFetch(`/items/${itemId}`, { method: 'DELETE' });
            }
            closeAdminModal('confirmModal');
            showToast(`${selectedArchivedItems.length} items deleted successfully`, 'success');
            selectedArchivedItems = [];
            loadArchiveStats();
            loadArchivedItemsAdmin();
        } catch (error) {
            showToast(error.message, 'error');
        }
    };
    openAdminModal('confirmModal');
}

async function bulkArchiveByAge(days) {
    document.getElementById('confirmMessage').textContent = `This will archive all items older than ${days} days. Continue?`;
    document.getElementById('confirmBtn').textContent = 'Archive';
    document.getElementById('confirmBtn').onclick = async () => {
        try {
            const result = await adminFetch('/auto-archive', {
                method: 'POST',
                body: JSON.stringify({ days })
            });
            closeAdminModal('confirmModal');
            showToast(result.message, 'success');
            loadArchiveStats();
            loadArchivedItemsAdmin();
            loadDashboardData();
        } catch (error) {
            showToast(error.message, 'error');
        }
    };
    openAdminModal('confirmModal');
}
