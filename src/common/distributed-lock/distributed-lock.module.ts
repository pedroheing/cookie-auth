import { Module } from '@nestjs/common';
import { createEnvProvider } from 'src/common/config/config-factory';
import { RedisModule } from '../internal/redis/redis.module';
import { RedisService } from '../internal/redis/redis.service';
import { DistributedLockConfigService, DistributedLockEnv } from './distributed-lock-config.service';
import { DistributedLockService } from './distributed-lock.service';
import { LockService } from './lock/lock.interface';

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
