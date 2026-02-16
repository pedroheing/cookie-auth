import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Environment } from 'src/common/config/config-factory';

export class AuthEnv {
	@IsOptional()
	@IsNumber()
	@Min(1)
	readonly AUTH_SESSION_LIFESPAN_IN_DAYS?: number;

	@IsOptional()
	@IsNumber()
	@Min(1)
	/**Time before refreshing the token for the session*/
	readonly AUTH_SESSION_TOKEN_TTL_IN_HOURS?: number;

	@IsOptional()
	@IsNumber()
	/**Time before cache of older session data is removed*/
	readonly AUTH_SESSION_CACHE_TTL_AFTER_TOKEN_REFRESH_IN_SECONDS?: number;

	@IsOptional()
	@IsNumber()
	@Min(1)
	readonly AUTH_CACHE_LIFESPAN_SECONDS?: number;

	@IsOptional()
	@IsString()
	@MinLength(1)
	readonly AUTH_COOKIE_NAME?: string;

	@IsEnum(Environment)
	readonly NODE_ENV!: Environment;
}
