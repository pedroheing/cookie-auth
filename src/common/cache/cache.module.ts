import { Module } from '@nestjs/common';
import { CacheService } from './cache.interface';
import { RedisService } from '../internal/redis/redis.service';
import { RedisModule } from '../internal/redis/redis.module';

@Module({
	imports: [RedisModule],
	providers: [
		{
			provide: CacheService,
			useExisting: RedisService,
		},
	],
	exports: [CacheService],
})
export class CacheModule {}
