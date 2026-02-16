import { Injectable } from '@nestjs/common';
import { Environment } from 'src/common/config/config-factory';
import { AuthEnv } from './auth.env';

@Injectable()
export class AuthConfigService {
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

	constructor(env: AuthEnv) {
		this.sessionLifespanInDays = env.AUTH_SESSION_LIFESPAN_IN_DAYS ?? 30;
		this.cacheLifespanInSeconds = env.AUTH_CACHE_LIFESPAN_SECONDS ?? 60 * 60 * 4; // 4 hours
		this.sessionTokenTTLInHours = env.AUTH_SESSION_TOKEN_TTL_IN_HOURS ?? 24;
		this.authSessionCacheTTLAterTokenRefreshInSeconds = env.AUTH_SESSION_CACHE_TTL_AFTER_TOKEN_REFRESH_IN_SECONDS ?? 60;
		this.authSessionTokenRefreshedCacheTTLInSeconds = 60;
		this.cookie = {
			name: env.AUTH_COOKIE_NAME ?? 'id', // generic name as recomended by OWASP
			maxAge: this.sessionLifespanInDays * 24 * 60 * 60 * 1000, // in milliseconds
			httpOnly: true,
			secure: env.NODE_ENV === Environment.Production,
			sameSite: 'lax',
		};
	}
}
