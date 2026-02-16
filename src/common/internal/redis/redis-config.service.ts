import { Injectable } from '@nestjs/common';
import { IsNotEmpty, IsNumber, IsString, MinLength } from 'class-validator';

export class RedisEnv {
	@IsNotEmpty()
	@IsString()
	@MinLength(1)
	readonly REDIS_HOST!: string;

	@IsNotEmpty()
	@IsNumber()
	readonly REDIS_PORT!: number;
}

@Injectable()
export class RedisConfigService {
	public readonly host: string;
	public readonly port: number;

	constructor(config: RedisEnv) {
		this.host = config.REDIS_HOST;
		this.port = config.REDIS_PORT;
	}
}
