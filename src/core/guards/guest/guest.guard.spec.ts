import { BadRequestException } from '@nestjs/common';
import { ExecutionContext, INestApplication } from '@nestjs/common/interfaces';
import { Test, TestingModule } from '@nestjs/testing';
import { createEnvProvider } from 'src/common/config/config-factory';
import { AuthConfigService } from 'src/features/auth/config/auth-config.service';
import { AuthEnv } from 'src/features/auth/config/auth.env';
import { GuestGuard } from './guest.guard';

describe('GuestGuard', () => {
	let app: INestApplication;
	let guard: GuestGuard;
	let authConfigService: AuthConfigService;

	beforeAll(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [GuestGuard, AuthConfigService, createEnvProvider(AuthEnv)],
		}).compile();

		app = module.createNestApplication();
		guard = module.get(GuestGuard);
		authConfigService = module.get(AuthConfigService);
		await app.init();
	});

	function contextWithCookies(cookies: Record<string, string>): ExecutionContext {
		return {
			switchToHttp: () => ({ getRequest: () => ({ cookies }) }),
		} as ExecutionContext;
	}

	it('should allow when no session cookie is present', () => {
		expect(guard.canActivate(contextWithCookies({}))).toBe(true);
	});

	it('should throw BadRequestException when session cookie is present', () => {
		expect(() => guard.canActivate(contextWithCookies({ [authConfigService.cookie.name]: 'whatever' }))).toThrow(BadRequestException);
	});

	it('should ignore cookies with other names', () => {
		expect(guard.canActivate(contextWithCookies({ other: 'value' }))).toBe(true);
	});
});
