import { Module } from '@nestjs/common';
import { RedisModule } from '../internal/redis/redis.module';
import { RedisService } from '../internal/redis/redis.service';
import { CacheService } from './cache.interface';

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
