import { Test } from '@nestjs/testing';
import { mock } from 'jest-mock-extended';
import { ExecutionContext, HttpArgumentsHost } from '@nestjs/common/interfaces';
import { AuthConfigService } from 'src/features/auth/config/auth-config.service';
import { GuestGuard } from './guest.guard';
import { Request } from 'express';
import { BadRequestException } from '@nestjs/common';

describe('GuestGuard', () => {
	let guestGuard: GuestGuard;
	const authConfigService = mock<AuthConfigService>({
		sessionLifespanInDays: 10,
		cacheLifespanInSeconds: 30,
		sessionTokenTTLInHours: 24,
		authSessionCacheTTLAterTokenRefreshInSeconds: 60,
		authSessionTokenRefreshedCacheTTLInSeconds: 60,
		cookie: {
			name: 'id',
			httpOnly: true,
			maxAge: 10 * 24 * 60 * 60 * 1000, // 10 days
			sameSite: 'lax',
			secure: false,
		},
	});
	const request = mock<Request>();
	const httpArgumentsHost = mock<HttpArgumentsHost>();
	const context = mock<ExecutionContext>();

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [GuestGuard, { provide: AuthConfigService, useValue: authConfigService }],
		}).compile();
		httpArgumentsHost.getRequest.mockReturnValue(request);
		context.switchToHttp.mockReturnValue(httpArgumentsHost);
		guestGuard = module.get(GuestGuard);
	});

	it('should be defined', () => {
		expect(guestGuard).toBeDefined();
		expect(authConfigService).toBeDefined();
	});

	describe('canActivate', () => {
		it('should return true when the call is made by a unautenticated user', async () => {
			// Arrange
			request.cookies = {};

			// Act
			const result = guestGuard.canActivate(context);

			// Assert
			expect(result).toBe(true);
		});

		it('should throw BadRequestException  when the call is made by an autenticated user', async () => {
			// Arrange
			request.cookies = {
				[authConfigService.cookie.name]: 'sessionToken',
			};

			// Act && Assert
			expect(() => {
				guestGuard.canActivate(context);
			}).toThrow(BadRequestException);
		});
	});
});
