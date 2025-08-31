import { Test } from '@nestjs/testing';
import { authConfigRegistration } from 'src/config/auth.config';
import { AuthGuard } from './auth.guard';
import { AuthService } from 'src/features/auth/auth.service';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public-route.decorator';
import { UnauthorizedException } from '@nestjs/common';

const authServiceMock = {
	validateSession: jest.fn(),
};

const authConfigMock = {
	sessionLifespanInDays: 10,
	cacheLifespanInSeconds: 30,
	sessionTokenTTLInHours: 24,
	authSessionCacheTTLAterTokenRefreshInSeconds: 60,
	authSessionTokenRefreshedCacheTTLInSeconds: 60,
	cookie: {
		name: 'cookie',
		maxAge: 10000,
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
	},
};

const reflectorMock = {
	getAllAndOverride: jest.fn(),
};

describe('AuthGuard', () => {
	let authGuard: AuthGuard;
	let authService: typeof authServiceMock;
	let reflector: typeof reflectorMock;
	const request = {
		cookies: {},
	};
	const response = {
		cookie: jest.fn(),
		clearCookie: jest.fn(),
	};
	const httpArgumentsHost = {
		getRequest: jest.fn().mockReturnValue(request),
		getResponse: jest.fn().mockReturnValue(response),
	};
	const context = {
		switchToHttp: jest.fn().mockReturnValue(httpArgumentsHost),
		getHandler: jest.fn(),
		getClass: jest.fn(),
	};

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [
				AuthGuard,
				{ provide: AuthService, useValue: authServiceMock },
				{ provide: authConfigRegistration.KEY, useValue: authConfigMock },
				{ provide: Reflector, useValue: reflectorMock },
			],
		}).compile();
		authGuard = module.get(AuthGuard);
		authService = module.get(AuthService);
		reflector = module.get(Reflector);
		jest.clearAllMocks();
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
			const request = {
				cookies: {
					[authConfigMock.cookie.name]: sessionToken,
				},
			};
			reflector.getAllAndOverride.mockReturnValue(false); // route is not public
			httpArgumentsHost.getRequest.mockReturnValue(request);
			authService.validateSession.mockResolvedValue({ userId: userId });

			// Act
			const result = await authGuard.canActivate(context as any);

			// Assert
			expect(result).toBe(true);
			expect(authService.validateSession).toHaveBeenCalledWith(sessionToken);
			expect(request).toEqual(
				expect.objectContaining({
					user: {
						userId: userId,
						sessionToken: sessionToken,
					},
				}),
			);
		});

		it('should return true when the route is public', async () => {
			// Arrange
			reflector.getAllAndOverride.mockReturnValue(true);
			// Act
			const result = await authGuard.canActivate(context as any);
			// Assert
			expect(result).toBe(true);
			expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
			expect(authService.validateSession).not.toHaveBeenCalled(); // it should not call the validation, the route is public
		});

		it('should throw UnauthorizedException when the cookie is not found', async () => {
			// Arrange
			reflector.getAllAndOverride.mockReturnValue(false); // route is not public
			httpArgumentsHost.getRequest.mockReturnValue({
				cookies: {},
			});
			// Act && Assert
			await expect(authGuard.canActivate(context as any)).rejects.toThrow(UnauthorizedException);
			expect(authService.validateSession).not.toHaveBeenCalled(); // it should throw the error before it reaches the validation
		});

		test.each([undefined, null, ''])("should throw UnauthorizedException when there is falsy value '%s' on the cookie", async (tokenValue) => {
			// Arrange
			reflector.getAllAndOverride.mockReturnValue(false); // route is not public
			httpArgumentsHost.getRequest.mockReturnValue({
				cookies: {
					[authConfigMock.cookie.name]: tokenValue,
				},
			});
			// Act && Assert
			await expect(authGuard.canActivate(context as any)).rejects.toThrow(UnauthorizedException);
			expect(authService.validateSession).not.toHaveBeenCalled(); // it should throw the error before it reaches the validation
		});

		it('should throw UnauthorizedException and clear the cookie when the session is invalid', async () => {
			// Arrange
			reflector.getAllAndOverride.mockReturnValue(false); // route is not public
			const sessionToken = 'token';
			httpArgumentsHost.getRequest.mockReturnValue({
				cookies: {
					[authConfigMock.cookie.name]: sessionToken,
				},
			});
			authService.validateSession.mockResolvedValue(null);
			// Act && Assert
			await expect(authGuard.canActivate(context as any)).rejects.toThrow(UnauthorizedException);
			expect(authService.validateSession).toHaveBeenCalledWith(sessionToken);
			expect(response.clearCookie).toHaveBeenCalledWith(authConfigMock.cookie.name);
		});

		it('should renew the token, set the user on the request and return true when the token is expired but the session is active', async () => {
			// Arrange
			const sessionToken = 'sessionToken';
			const newSessionToken = 'newSessionToken';
			const userId = 1;
			const request = {
				cookies: {
					[authConfigMock.cookie.name]: sessionToken,
				},
			};
			reflector.getAllAndOverride.mockReturnValue(false); // route is not public
			httpArgumentsHost.getRequest.mockReturnValue(request);
			authService.validateSession.mockResolvedValue({ userId: userId, newSessionToken: newSessionToken });

			// Act
			const result = await authGuard.canActivate(context as any);

			// Assert
			expect(result).toBe(true);
			expect(authService.validateSession).toHaveBeenCalledWith(sessionToken);
			expect(response.cookie).toHaveBeenCalledWith(authConfigMock.cookie.name, newSessionToken, authConfigMock.cookie);
			expect(request).toEqual(
				expect.objectContaining({
					user: {
						userId: userId,
						sessionToken: newSessionToken,
					},
				}),
			);
		});
	});
});
