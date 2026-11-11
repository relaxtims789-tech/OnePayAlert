import { createProxyHandler } from '@onepay/web-core/server';

export const dynamic = 'force-dynamic';

/** Browser → API proxy. Token endpoints and webhooks are always blocked (see web-core). */
const handle = createProxyHandler();

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
