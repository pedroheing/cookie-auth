import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { authConfigRegistration } from 'src/config/auth.config';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { mock } from 'jest-mock-extended';
import { Response } from 'express';

const authServiceMock = {
	signUp: jest.fn(),
	signIn: jest.fn(),
	signOut: jest.fn(),
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

describe('AuthController', () => {
	let authController: AuthController;
	let authService: typeof authServiceMock;
	const request = {
		user: {
			userId: 1,
			sessionToken: 'session-token',
		},
	};
	let response: Response;

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [AuthController, { provide: AuthService, useValue: authServiceMock }, { provide: authConfigRegistration.KEY, useValue: authConfigMock }],
		}).compile();
		authController = module.get(AuthController);
		authService = module.get(AuthService);
		response = mock<Response>();

		jest.clearAllMocks();
	});

	it('should be defined', () => {
		expect(authController).toBeDefined();
		expect(authService).toBeDefined();
	});

	describe('signUp', () => {
		it('should call the signUp method and add the token to the cookie', async () => {
			// Arrange
			const singUpDto: SignUpDto = {
				firstName: 'name',
				lastName: '123',
				password: 'password',
				username: 'name123',
			};
			const newToken = 'newToken';
			authService.signUp.mockResolvedValue(newToken);

			// Act
			await authController.signUp(response, singUpDto);

			// Assert
			expect(authService.signUp).toHaveBeenCalledWith(singUpDto);
			expect(response.cookie).toHaveBeenCalledWith(authConfigMock.cookie.name, newToken, authConfigMock.cookie);
		});
	});

	describe('signIn', () => {
		it('should call the signIn method and add the session token to the cookie', async () => {
			// Arrange
			const singInDto: SignInDto = {
				password: 'password',
				username: 'username',
			};
			const newToken = 'newToken';
			authService.signIn.mockResolvedValue(newToken);

			// Act
			await authController.signIn(response, singInDto);

			// Assert
			expect(authService.signIn).toHaveBeenCalledWith(singInDto.username, singInDto.password);
			expect(response.cookie).toHaveBeenCalledWith(authConfigMock.cookie.name, newToken, authConfigMock.cookie);
		});
	});

	describe('signOut', () => {
		it('should call the signOut method and clear the cookie', async () => {
			// Arrange
			authService.signOut.mockResolvedValue(null);

			// Act
			await authController.signOut(request as any, response);

			// Assert
			expect(authService.signOut).toHaveBeenCalledWith(request.user.sessionToken);
			expect(response.clearCookie).toHaveBeenCalledWith(authConfigMock.cookie.name);
		});
	});
});
