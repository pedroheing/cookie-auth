import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext, HttpArgumentsHost } from '@nestjs/common/interfaces';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Response } from 'express';
import { mock } from 'jest-mock-extended';
import { IS_PUBLIC_KEY } from 'src/core/decorators/public-route.decorator';
import { AuthConfigService } from 'src/features/auth/config/auth-config.service';
import { SessionService } from 'src/features/auth/session/session.service';
import { AutenticatedRequest, AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
	let authGuard: AuthGuard;
	const sessionService = mock<SessionService>();
	const authConfigService = mock<AuthConfigService>({
		sessionLifespanInDays: 10,
		cacheLifespanInSeconds: 30,
		sessionTokenTTLInHours: 24,
		authSessionCacheTTLAfterTokenRefreshInSeconds: 60,
		authSessionTokenRefreshedCacheTTLInSeconds: 60,
		cookie: {
			name: 'id',
			httpOnly: true,
			maxAge: 10 * 24 * 60 * 60 * 1000, // 10 days
			sameSite: 'lax',
			secure: false,
		},
	});
	const reflector = mock<Reflector>();
	const request = mock<AutenticatedRequest>();
	const response = mock<Response>();
	const httpArgumentsHost = mock<HttpArgumentsHost>();
	const context = mock<ExecutionContext>();

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				AuthGuard,
				{ provide: SessionService, useValue: sessionService },
				{ provide: AuthConfigService, useValue: authConfigService },
				{ provide: Reflector, useValue: reflector },
			],
		}).compile();
		authGuard = module.get(AuthGuard);
		httpArgumentsHost.getRequest.mockReturnValue(request);
		httpArgumentsHost.getResponse.mockReturnValue(response);
		context.switchToHttp.mockReturnValue(httpArgumentsHost);
		// by default routes should be private
		reflector.getAllAndOverride.mockReturnValue(false);
	});

	it('should be defined', () => {
		expect(authGuard).toBeDefined();
		expect(sessionService).toBeDefined();
		expect(authConfigService).toBeDefined();
		expect(reflector).toBeDefined();
	});

	describe('canActivate', () => {
		it('should set the user on the request and return true with a valid token', async () => {
			// Arrange
			const sessionToken = 'sessionToken';
			const userId = 1;
			request.cookies = {
				[authConfigService.cookie.name]: sessionToken,
			};
			sessionService.validateAndRefreshSession.mockResolvedValue({ isValid: true, userId: userId });

			// Act
			const result = await authGuard.canActivate(context);

			// Assert
			expect(result).toBe(true);
			expect(request.user).toBeDefined();
		});

		it('should return true when the route is public', async () => {
			// Arrange
			const publicHandler = () => {};
			Reflect.defineMetadata(IS_PUBLIC_KEY, true, publicHandler);
			context.getHandler.mockReturnValue(publicHandler);
			context.getClass.mockReturnValue(class {});
			// Act
			const result = await authGuard.canActivate(context);
			// Assert
			expect(result).toBe(true);
		});

		it('should throw UnauthorizedException when the cookie is not found', async () => {
			// Arrange
			request.cookies = {};
			// Act && Assert
			await expect(authGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
		});

		test.each([undefined, null, ''])("should throw UnauthorizedException when there is falsy value '%s' on the cookie", async (tokenValue) => {
			// Arrange
			request.cookies = {
				[authConfigService.cookie.name]: tokenValue,
			};
			// Act && Assert
			await expect(authGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
			expect(response.clearCookie).toHaveBeenCalledWith(authConfigService.cookie.name);
		});

		it('should throw UnauthorizedException and clear the cookie when the session is invalid', async () => {
			// Arrange
			const sessionToken = 'token';
			request.cookies = {
				[authConfigService.cookie.name]: sessionToken,
			};
			sessionService.validateAndRefreshSession.mockResolvedValue({ isValid: false });
			// Act && Assert
			await expect(authGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
			expect(response.clearCookie).toHaveBeenCalledWith(authConfigService.cookie.name);
		});

		it('should renew the token and return true when the token is expired but the session is active', async () => {
			// Arrange
			const sessionToken = 'sessionToken';
			const newSessionToken = 'newSessionToken';
			const userId = 1;
			request.cookies = {
				[authConfigService.cookie.name]: sessionToken,
			};
			sessionService.validateAndRefreshSession.mockResolvedValue({ isValid: true, userId: userId, newSessionToken: newSessionToken });

			// Act
			const result = await authGuard.canActivate(context);

			// Assert
			expect(result).toBe(true);
			expect(response.cookie).toHaveBeenCalledWith(authConfigService.cookie.name, newSessionToken, authConfigService.cookie);
			expect(request.user).toBeDefined();
		});
	});
});
