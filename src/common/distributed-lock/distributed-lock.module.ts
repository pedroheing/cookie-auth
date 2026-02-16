import { Module } from '@nestjs/common';
import { DistributedLockService } from './distributed-lock.service';
import { createEnvProvider } from 'src/common/config/config-factory';
import { DistributedLockConfigService, DistributedLockEnv } from './distributed-lock-config.service';
import { LockService } from './lock/lock.interface';
import { RedisService } from '../internal/redis/redis.service';
import { RedisModule } from '../internal/redis/redis.module';

@Module({
	imports: [RedisModule],
	providers: [
		DistributedLockService,
		createEnvProvider(DistributedLockEnv),
		DistributedLockConfigService,
		{
			provide: LockService,
			useExisting: RedisService,
		},
	],
	exports: [DistributedLockService],
})
export class DistributedLockModule {}
