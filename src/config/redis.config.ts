import { createConfigRegistration } from './config-factory';
import { IsNumber, IsString, MinLength } from 'class-validator';

export const REDIS_CONFIG_KEY = 'redis';

class RedisConfigEnvironmentVariables {
	@IsString()
	@MinLength(1)
	readonly REDIS_HOST: string;

	@IsNumber()
	readonly REDIS_PORT: number;
}

export class RedisConfig {
	public readonly host: string;
	public readonly port: number;

	constructor(config: RedisConfigEnvironmentVariables) {
		this.host = config.REDIS_HOST;
		this.port = config.REDIS_PORT;
	}
}

export const redisConfigRegistration = createConfigRegistration(REDIS_CONFIG_KEY, RedisConfig, RedisConfigEnvironmentVariables);

export default redisConfigRegistration;
