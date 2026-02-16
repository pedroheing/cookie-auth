import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { mock } from 'jest-mock-extended';
import { Response } from 'express';
import { AutenticatedRequest } from 'src/core/guards/auth.guard';
import { AuthConfigService } from './config/auth-config.service';

describe('AuthController', () => {
	let authController: AuthController;
	const authService = mock<AuthService>();
	const response = mock<Response>();
	const request = mock<AutenticatedRequest>();
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

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [AuthController, { provide: AuthService, useValue: authService }, { provide: AuthConfigService, useValue: authConfigService }],
		}).compile();
		authController = module.get(AuthController);
	});

	it('should be defined', () => {
		expect(authController).toBeDefined();
		expect(authService).toBeDefined();
		expect(authConfigService).toBeDefined();
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
			expect(response.cookie).toHaveBeenCalledWith(authConfigService.cookie.name, newToken, authConfigService.cookie);
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
			expect(response.cookie).toHaveBeenCalledWith(authConfigService.cookie.name, newToken, authConfigService.cookie);
		});
	});

	describe('signOut', () => {
		it('should call the signOut method and clear the cookie', async () => {
			// Arrange
			request.user = {
				userId: 1,
				sessionToken: 'session-token',
			};

			// Act
			await authController.signOut(request, response);

			// Assert
			expect(authService.signOut).toHaveBeenCalledWith(request.user.sessionToken);
			expect(response.clearCookie).toHaveBeenCalledWith(authConfigService.cookie.name);
		});
	});
});
