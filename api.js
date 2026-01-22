// ============================================
//  Campus Lost & Found - API Service
// ============================================

const API_BASE_URL = '/api';

// Token management - Using sessionStorage for per-tab sessions
// This allows different users to be logged in across different browser tabs/windows
function getToken() {
    return sessionStorage.getItem('authToken');
}

function setToken(token) {
    sessionStorage.setItem('authToken', token);
}

function removeToken() {
    sessionStorage.removeItem('authToken');
}

function getUser() {
    const user = sessionStorage.getItem('currentUser');
    return user ? JSON.parse(user) : null;
}

function setUser(user) {
    sessionStorage.setItem('currentUser', JSON.stringify(user));
}

function removeUser() {
    sessionStorage.removeItem('currentUser');
}

// API request helper
async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    
    const headers = {
        ...options.headers
    };

    // Don't set Content-Type for FormData (browser will set it with boundary)
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Something went wrong');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ============================================
//  Auth API
// ============================================

const AuthAPI = {
    async login(email, password) {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        setToken(data.token);
        setUser(data.user);
        return data;
    },

    async register(userData) {
        const data = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        setToken(data.token);
        setUser(data.user);
        return data;
    },

    async getProfile() {
        return await apiRequest('/auth/me');
    },

    async changePassword(currentPassword, newPassword) {
        return await apiRequest('/auth/password', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword, newPassword })
        });
    },

    logout() {
        removeToken();
        removeUser();
        window.location.reload();
    },

    isLoggedIn() {
        return !!getToken();
    },

    getCurrentUser() {
        return getUser();
    }
};

// ============================================
//  Items API
// ============================================

const ItemsAPI = {
    async getAll(filters = {}) {
        const params = new URLSearchParams();
        if (filters.category) params.append('category', filters.category);
        if (filters.status) params.append('status', filters.status);
        if (filters.search) params.append('search', filters.search);
        if (filters.location) params.append('location', filters.location);
        if (filters.page) params.append('page', filters.page);
        if (filters.limit) params.append('limit', filters.limit);

        const queryString = params.toString();
        return await apiRequest(`/items${queryString ? '?' + queryString : ''}`);
    },

    async getById(id) {
        return await apiRequest(`/items/${id}`);
    },

    async create(formData) {
        return await apiRequest('/items', {
            method: 'POST',
            body: formData
        });
    },

    async update(id, formData) {
        return await apiRequest(`/items/${id}`, {
            method: 'PUT',
            body: formData
        });
    },

    async delete(id) {
        return await apiRequest(`/items/${id}`, {
            method: 'DELETE'
        });
    },

    async claim(id, message) {
        return await apiRequest(`/items/${id}/claim`, {
            method: 'POST',
            body: JSON.stringify({ message })
        });
    },

    async updateClaim(claimId, status) {
        return await apiRequest(`/items/claims/${claimId}`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
    },

    async getMyItems() {
        return await apiRequest('/items/user/my-items');
    }
};

// ============================================
//  Users API
// ============================================

const UsersAPI = {
    async getProfile() {
        return await apiRequest('/users/profile');
    },

    async updateProfile(data) {
        return await apiRequest('/users/profile', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    async getItems() {
        return await apiRequest('/users/items');
    },

    async getClaims() {
        return await apiRequest('/users/claims');
    },

    async getMyClaims() {
        return await apiRequest('/users/claims');
    },

    async getItemClaims() {
        return await apiRequest('/users/item-claims');
    },

    async createAlert(keywords, category) {
        return await apiRequest('/users/alerts', {
            method: 'POST',
            body: JSON.stringify({ keywords, category })
        });
    },

    async getAlerts() {
        return await apiRequest('/users/alerts');
    },

    async deleteAlert(id) {
        return await apiRequest(`/users/alerts/${id}`, {
            method: 'DELETE'
        });
    }
};

// ============================================
//  Notifications API
// ============================================

const NotificationsAPI = {
    async getAll(unreadOnly = false) {
        return await apiRequest(`/notifications${unreadOnly ? '?unreadOnly=true' : ''}`);
    },

    async markAsRead(id) {
        return await apiRequest(`/notifications/${id}/read`, {
            method: 'PUT'
        });
    },

    async markAllAsRead() {
        return await apiRequest('/notifications/read-all', {
            method: 'PUT'
        });
    },

    async delete(id) {
        return await apiRequest(`/notifications/${id}`, {
            method: 'DELETE'
        });
    },

    async deleteAll() {
        return await apiRequest('/notifications', {
            method: 'DELETE'
        });
    }
};

// ============================================
//  Stats API
// ============================================

const StatsAPI = {
    async getOverview() {
        return await apiRequest('/stats');
    },

    async getActivity(limit = 20) {
        return await apiRequest(`/stats/activity?limit=${limit}`);
    },

    async getTrending() {
        return await apiRequest('/stats/trending');
    }
};

// ============================================
//  Contact API
// ============================================

const ContactAPI = {
    async sendMessage(data) {
        return await apiRequest('/contact', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async subscribeNewsletter(email) {
        return await apiRequest('/contact/newsletter', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    },

    async unsubscribeNewsletter(email) {
        return await apiRequest('/contact/newsletter', {
            method: 'DELETE',
            body: JSON.stringify({ email })
        });
    }
};

// Export all APIs
window.API = {
    Auth: AuthAPI,
    Items: ItemsAPI,
    Users: UsersAPI,
    Notifications: NotificationsAPI,
    Stats: StatsAPI,
    Contact: ContactAPI
};
