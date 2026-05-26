import { BadRequestException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common/interfaces';
import { Environment } from 'src/common/config/config-factory';
import { AuthConfigService } from 'src/features/auth/config/auth-config.service';
import { GuestGuard } from './guest.guard';

describe('GuestGuard', () => {
	const authConfigService = new AuthConfigService({
		NODE_ENV: Environment.Development,
		AUTH_CACHE_LIFESPAN_SECONDS: 10,
		AUTH_COOKIE_NAME: 'test',
		AUTH_SESSION_CACHE_TTL_AFTER_TOKEN_REFRESH_IN_SECONDS: 10,
		AUTH_SESSION_LIFESPAN_IN_DAYS: 10,
		AUTH_SESSION_TOKEN_TTL_IN_HOURS: 10,
	});
	const guard = new GuestGuard(authConfigService);

	function contextWithCookies(cookies: Record<string, string>): ExecutionContext {
		return {
			switchToHttp: () => ({ getRequest: () => ({ cookies }) }),
		} as ExecutionContext;
	}

	it('should allow when no session cookie is present', () => {
		expect(guard.canActivate(contextWithCookies({}))).toBe(true);
	});

	it('should throw BadRequestException when session cookie is present', () => {
		expect(() => guard.canActivate(contextWithCookies({ [authConfigService.cookie.name]: 'value' }))).toThrow(BadRequestException);
	});

	it('should ignore cookies with other names', () => {
		expect(guard.canActivate(contextWithCookies({ other: 'value' }))).toBe(true);
	});
});
