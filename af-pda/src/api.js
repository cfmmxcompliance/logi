import axios from 'axios';

// During development, assume the API is at localhost:5000 if not served by same origin
// In production (served from same domain), it's just /api
const isDev = import.meta.env.DEV;
const API_BASE = isDev ? 'http://127.0.0.1:5001/logimaster-cfmoto/us-central1/api' : '/api';

const api = axios.create({
    baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
    const token = sessionStorage.getItem('wms_jwt');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            // Auto logout if token is missing, invalid, or expired
            sessionStorage.removeItem('wms_jwt');
            localStorage.removeItem('logimaster_user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    return res.data;
};

export const getUnit = async (vin) => {
    const res = await api.get(`/units/${vin}`);
    return res.data;
};

export const registerUnit = async (vin, operator_id, location) => {
    const user = JSON.parse(localStorage.getItem('logimaster_user') || '{}');
    const res = await api.post('/units/register', { vin, operator_id, location: location || user.location });
    return res.data;
};

export const transferUnit = async (vin, operator_id, observations, location) => {
    const user = JSON.parse(localStorage.getItem('logimaster_user') || '{}');
    const res = await api.post('/transfer', { vin, operator_id, observations, location: location || user.location });
    return res.data;
};

export const authorizeQA = async (vin, operator_id, is_approved, observations, action) => {
    const res = await api.post('/qa/authorize', { vin, operator_id, is_approved, observations, action });
    return res.data;
};

export const getLocationCount = async (code) => {
    const res = await api.get(`/location/${code}/count`);
    return res.data;
};

export const getDashboardCounts = async () => {
    const res = await api.get('/dashboard');
    return res.data;
};

export default api;
