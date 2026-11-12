import { createProxyHandler } from '@onepay/web-core/server';

export const dynamic = 'force-dynamic';

/**
 * Admin console proxy: allow-list only. Staff can reach platform endpoints and their own
 * profile/password — nothing tenant-scoped, nothing that mints tokens.
 */
const handle = createProxyHandler({
  allow: [/^platform\//, /^auth\/(me|change-password)$/],
  defaultLocale: 'en',
});

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
