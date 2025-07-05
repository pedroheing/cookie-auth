import { createConfigRegistration } from './config-factory';
import { IsNumber, IsOptional, Min } from 'class-validator';

export const DISTRIBUTED_LOCK_CONFIG_KEY = 'distributed-lock';

class DistributedLockConfigEnvironmentVariables {
	@IsOptional()
	@IsNumber()
	@Min(1)
	readonly EXPIRATION_TIME_IN_SECONDS: number;
}

export class DistributedLockConfig {
	public readonly expirationTimeInSeconds: number;

	constructor(config: DistributedLockConfigEnvironmentVariables) {
		this.expirationTimeInSeconds = config.EXPIRATION_TIME_IN_SECONDS ?? 30;
	}
}

export const distributedLockConfigRegistration = createConfigRegistration(
	DISTRIBUTED_LOCK_CONFIG_KEY,
	DistributedLockConfig,
	DistributedLockConfigEnvironmentVariables,
);
