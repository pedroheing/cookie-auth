import { createConfigRegistration } from './config-factory';
import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export const REDIS_CONFIG_KEY = 'redis';

class RedisConfigEnvironmentVariables {
	@IsOptional()
	@IsString()
	@MinLength(1)
	readonly REDIS_HOST: string;

	@IsOptional()
	@IsNumber()
	readonly REDIS_PORT: number;
}

export class RedisConfig {
	public readonly host: string;
	public readonly port: number;

	constructor(config: RedisConfigEnvironmentVariables) {
		this.host = config.REDIS_HOST ?? 'localhost';
		this.port = config.REDIS_PORT ?? 6379;
	}
}

export const redisConfigRegistration = createConfigRegistration(REDIS_CONFIG_KEY, RedisConfig, RedisConfigEnvironmentVariables);
