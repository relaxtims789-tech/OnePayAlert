import { createSessionHandlers } from '@onepay/web-core/server';

export const dynamic = 'force-dynamic';

export const { GET, POST } = createSessionHandlers({ allowRegister: true });
