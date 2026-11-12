import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

/** The one Socket.IO gateway, shared by payment notifications and soundbox status updates. */
@Module({ providers: [RealtimeGateway], exports: [RealtimeGateway] })
export class RealtimeModule {}
