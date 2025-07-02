import { createConfigRegistration, Environment } from './config-factory';
import { IsEnum, IsNumber, IsString, Min, MinLength } from 'class-validator';

export const AUTH_CONFIG_KEY = 'auth';

class AuthConfigEnvironmentVariables {
	@IsNumber()
	@Min(1)
	readonly AUTH_SESSION_LIFESPAN_DAYS: number;

	@IsNumber()
	readonly AUTH_CACHE_LIFESPAN_SECONDS: number;

	@IsString()
	@MinLength(1)
	readonly AUTH_COOKIE_NAME: string;

	@IsEnum(Environment)
	readonly NODE_ENV: Environment;
}

export class AuthConfig {
	public readonly sessionLifespanInDays: number;
	public readonly cacheLifespanInSeconds: number;
	public readonly cookie: {
		readonly name: string;
		readonly maxAge: number;
		readonly httpOnly: boolean;
		readonly secure: boolean;
		readonly sameSite: 'lax' | 'strict';
	};

	constructor(config: AuthConfigEnvironmentVariables) {
		this.sessionLifespanInDays = config.AUTH_SESSION_LIFESPAN_DAYS;
		this.cacheLifespanInSeconds = config.AUTH_CACHE_LIFESPAN_SECONDS;
		this.cookie = {
			name: config.AUTH_COOKIE_NAME,
			maxAge: this.sessionLifespanInDays * 24 * 60 * 60 * 1000,
			httpOnly: true,
			secure: config.NODE_ENV === Environment.Production,
			sameSite: 'lax',
		};
	}
}

export const authConfigRegistration = createConfigRegistration(AUTH_CONFIG_KEY, AuthConfig, AuthConfigEnvironmentVariables);

export default authConfigRegistration;
