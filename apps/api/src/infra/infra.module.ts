import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { IngestQueue } from './ingest-queue.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [CryptoService, RedisService, IngestQueue],
  exports: [CryptoService, RedisService, IngestQueue],
})
export class InfraModule {}
