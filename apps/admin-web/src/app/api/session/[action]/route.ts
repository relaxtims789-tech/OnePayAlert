import { createSessionHandlers } from '@onepay/web-core/server';

export const dynamic = 'force-dynamic';

/** Staff sign-in only: no self-registration, no company switching, platform role required. */
export const { GET, POST } = createSessionHandlers({ requirePlatformRole: true, defaultLocale: 'en' });
