import { Test } from '@nestjs/testing';
import { AuthConfig, authConfigRegistration } from 'src/config/auth.config';
import { AutenticatedRequest, AuthGuard } from './auth.guard';
import { AuthService } from 'src/features/auth/auth.service';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public-route.decorator';
import { UnauthorizedException } from '@nestjs/common';
import { Environment } from 'src/config/config-factory';
import { mock, MockProxy } from 'jest-mock-extended';
import { Response } from 'express';
import { ExecutionContext, HttpArgumentsHost } from '@nestjs/common/interfaces';

const authConfig = new AuthConfig({
	AUTH_SESSION_LIFESPAN_IN_DAYS: 10,
	AUTH_CACHE_LIFESPAN_SECONDS: 30,
	AUTH_SESSION_TOKEN_TTL_IN_HOURS: 24,
	AUTH_SESSION_CACHE_TTL_AFTER_TOKEN_REFRESH_IN_SECONDS: 60,
	AUTH_COOKIE_NAME: 'id',
	NODE_ENV: Environment.Development,
});

describe('AuthGuard', () => {
	let authGuard: AuthGuard;
	let authService: MockProxy<AuthService>;
	let reflector: MockProxy<Reflector>;
	let request: MockProxy<AutenticatedRequest>;
	let response: MockProxy<Response>;
	let httpArgumentsHost: MockProxy<HttpArgumentsHost>;
	let context: MockProxy<ExecutionContext>;

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				AuthGuard,
				{ provide: AuthService, useValue: mock<AuthService>() },
				{ provide: authConfigRegistration.KEY, useValue: authConfig },
				{ provide: Reflector, useValue: mock<Reflector>() },
			],
		}).compile();
		authGuard = module.get(AuthGuard);
		authService = module.get(AuthService);
		reflector = module.get(Reflector);

		request = mock<AutenticatedRequest>();
		response = mock<Response>();
		httpArgumentsHost = mock<HttpArgumentsHost>();
		context = mock<ExecutionContext>();

		httpArgumentsHost.getRequest.mockReturnValue(request);
		httpArgumentsHost.getResponse.mockReturnValue(response);
		context.switchToHttp.mockReturnValue(httpArgumentsHost);
	});

	it('should be defined', () => {
		expect(authGuard).toBeDefined();
		expect(authService).toBeDefined();
		expect(authConfigRegistration.KEY).toBeDefined();
		expect(reflector).toBeDefined();
	});

	describe('canActivate', () => {
		it('should set the user on the request and return true with a valid token', async () => {
			// Arrange
			const sessionToken = 'sessionToken';
			const userId = 1;
			request.cookies = {
				[authConfig.cookie.name]: sessionToken,
			};
			reflector.getAllAndOverride.mockReturnValue(false); // route is not public
			authService.validateSession.mockResolvedValue({ userId: userId });

			// Act
			const result = await authGuard.canActivate(context);

			// Assert
			expect(result).toBe(true);
			expect(authService.validateSession).toHaveBeenCalledWith(sessionToken);
			expect(request.user).toEqual({
				userId: userId,
				sessionToken: sessionToken,
			});
		});

		it('should return true when the route is public', async () => {
			// Arrange
			reflector.getAllAndOverride.mockReturnValue(true);
			// Act
			const result = await authGuard.canActivate(context);
			// Assert
			expect(result).toBe(true);
			expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
			expect(authService.validateSession).not.toHaveBeenCalled(); // it should not call the validation, the route is public
		});

		it('should throw UnauthorizedException when the cookie is not found', async () => {
			// Arrange
			reflector.getAllAndOverride.mockReturnValue(false); // route is not public
			request.cookies = {};
			// Act && Assert
			await expect(authGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
			expect(authService.validateSession).not.toHaveBeenCalled(); // it should throw the error before it reaches the validation
		});

		test.each([undefined, null, ''])("should throw UnauthorizedException when there is falsy value '%s' on the cookie", async (tokenValue) => {
			// Arrange
			reflector.getAllAndOverride.mockReturnValue(false); // route is not public
			request.cookies = {
				[authConfig.cookie.name]: tokenValue,
			};
			// Act && Assert
			await expect(authGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
			expect(authService.validateSession).not.toHaveBeenCalled(); // it should throw the error before it reaches the validation
		});

		it('should throw UnauthorizedException and clear the cookie when the session is invalid', async () => {
			// Arrange
			reflector.getAllAndOverride.mockReturnValue(false); // route is not public
			const sessionToken = 'token';
			request.cookies = {
				[authConfig.cookie.name]: sessionToken,
			};
			authService.validateSession.mockResolvedValue(null);
			// Act && Assert
			await expect(authGuard.canActivate(context)).rejects.toThrow(UnauthorizedException);
			expect(authService.validateSession).toHaveBeenCalledWith(sessionToken);
			expect(response.clearCookie).toHaveBeenCalledWith(authConfig.cookie.name);
		});

		it('should renew the token, set the user on the request and return true when the token is expired but the session is active', async () => {
			// Arrange
			const sessionToken = 'sessionToken';
			const newSessionToken = 'newSessionToken';
			const userId = 1;
			request.cookies = {
				[authConfig.cookie.name]: sessionToken,
			};
			reflector.getAllAndOverride.mockReturnValue(false); // route is not public
			authService.validateSession.mockResolvedValue({ userId: userId, newSessionToken: newSessionToken });

			// Act
			const result = await authGuard.canActivate(context);

			// Assert
			expect(result).toBe(true);
			expect(authService.validateSession).toHaveBeenCalledWith(sessionToken);
			expect(response.cookie).toHaveBeenCalledWith(authConfig.cookie.name, newSessionToken, authConfig.cookie);
			expect(request.user).toEqual({
				userId: userId,
				sessionToken: newSessionToken,
			});
		});
	});
});
