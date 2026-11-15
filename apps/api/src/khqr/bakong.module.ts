import { Module } from '@nestjs/common';
import { bakongClientProvider, bakongLiveFactoryProvider } from './bakong.client';

/** The one Bakong Open API client, shared by bank connections (account checks) and KHQR charges. */
@Module({ providers: [bakongLiveFactoryProvider, bakongClientProvider], exports: [bakongLiveFactoryProvider, bakongClientProvider] })
export class BakongModule {}
