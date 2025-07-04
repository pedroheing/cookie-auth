import { createConfigRegistration, Environment } from './config-factory';
import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export const AUTH_CONFIG_KEY = 'auth';

class AuthConfigEnvironmentVariables {
	@IsOptional()
	@IsNumber()
	@Min(1)
	readonly AUTH_SESSION_LIFESPAN_IN_DAYS: number;

	@IsOptional()
	@IsNumber()
	@Min(1)
	/**Time before refreshing the token for the session*/
	readonly AUTH_SESSION_TOKEN_TTL_IN_HOURS: number;

	@IsOptional()
	@IsNumber()
	/**Time before cache of older session data is removed*/
	readonly AUTH_SESSION_CACHE_TTL_AFTER_TOKEN_REFRESH_IN_SECONDS: number;

	@IsOptional()
	@IsNumber()
	@Min(1)
	readonly AUTH_CACHE_LIFESPAN_SECONDS: number;

	@IsOptional()
	@IsString()
	@MinLength(1)
	readonly AUTH_COOKIE_NAME: string;

	@IsEnum(Environment)
	readonly NODE_ENV: Environment;
}

export class AuthConfig {
	public readonly sessionLifespanInDays: number;
	public readonly cacheLifespanInSeconds: number;
	public readonly sessionTokenTTLInHours: number;
	public readonly authSessionCacheTTLAterTokenRefreshInSeconds: number;
	public readonly authSessionTokenRefreshedCacheTTLInSeconds: number;
	public readonly cookie: {
		readonly name: string;
		readonly maxAge: number;
		readonly httpOnly: boolean;
		readonly secure: boolean;
		readonly sameSite: 'lax' | 'strict';
	};

	constructor(config: AuthConfigEnvironmentVariables) {
		this.sessionLifespanInDays = config.AUTH_SESSION_LIFESPAN_IN_DAYS ?? 30;
		this.cacheLifespanInSeconds = config.AUTH_CACHE_LIFESPAN_SECONDS ?? 60 * 60 * 4; // 4 hours
		this.sessionTokenTTLInHours = config.AUTH_SESSION_TOKEN_TTL_IN_HOURS ?? 24;
		this.authSessionCacheTTLAterTokenRefreshInSeconds = config.AUTH_SESSION_CACHE_TTL_AFTER_TOKEN_REFRESH_IN_SECONDS ?? 60;
		this.authSessionTokenRefreshedCacheTTLInSeconds = 60;
		this.cookie = {
			name: config.AUTH_COOKIE_NAME ?? 'id', // generic name as recomended by OWASP
			maxAge: this.sessionLifespanInDays * 24 * 60 * 60 * 1000, // in milliseconds
			httpOnly: true,
			secure: config.NODE_ENV === Environment.Production,
			sameSite: 'lax',
		};
	}
}

export const authConfigRegistration = createConfigRegistration(AUTH_CONFIG_KEY, AuthConfig, AuthConfigEnvironmentVariables);
