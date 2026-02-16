import { Injectable } from '@nestjs/common';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class DistributedLockEnv {
	@IsOptional()
	@IsNumber()
	@Min(1)
	readonly EXPIRATION_TIME_IN_SECONDS?: number;
}

@Injectable()
export class DistributedLockConfigService {
	public readonly expirationTimeInSeconds: number;

	constructor(config: DistributedLockEnv) {
		this.expirationTimeInSeconds = config.EXPIRATION_TIME_IN_SECONDS ?? 30;
	}
}
