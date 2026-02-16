import { Module } from '@nestjs/common';
import { createEnvProvider } from 'src/common/config/config-factory';
import { RedisConfigService, RedisEnv } from './redis-config.service';
import { RedisService } from './redis.service';

@Module({
	providers: [RedisService, createEnvProvider(RedisEnv), RedisConfigService],
	exports: [RedisService],
})
export class RedisModule {}
