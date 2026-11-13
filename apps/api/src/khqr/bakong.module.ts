import { Module } from '@nestjs/common';
import { BakongHealthService } from './bakong-health.service';
import { bakongClientProvider } from './bakong.client';

/** The one Bakong Open API client, shared by bank connections (account checks) and KHQR charges, and its health record. */
@Module({ providers: [bakongClientProvider, BakongHealthService], exports: [bakongClientProvider, BakongHealthService] })
export class BakongModule {}
