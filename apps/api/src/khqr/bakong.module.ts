import { Module } from '@nestjs/common';
import { bakongClientProvider } from './bakong.client';

/** The one Bakong Open API client, shared by bank connections (account checks) and KHQR charges. */
@Module({ providers: [bakongClientProvider], exports: [bakongClientProvider] })
export class BakongModule {}
