/** Test-only staff accounts, created in the *_test database by global setup. */
export const SUPER_ADMIN = { email: 'e2e.superadmin@mysoftkh.onepay.local', password: 'SuperAdm1nPass', name: 'E2E Super Admin', role: 'SUPER_ADMIN' };
export const SUPPORT = { email: 'e2e.support@mysoftkh.onepay.local', password: 'Supp0rtPassword', name: 'E2E Support', role: 'SUPPORT' };
export const WEB_PORT = 3201;
export const API_PORT = 4102;
export const API = `http://localhost:${API_PORT}/api/v1`;
