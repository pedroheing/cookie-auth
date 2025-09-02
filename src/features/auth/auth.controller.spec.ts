import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthConfig, authConfigRegistration } from 'src/config/auth.config';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { mock } from 'jest-mock-extended';
import { Response } from 'express';
import { Environment } from 'src/config/config-factory';
import { AutenticatedRequest } from 'src/core/guards/auth.guard';

const authConfig = new AuthConfig({
	AUTH_SESSION_LIFESPAN_IN_DAYS: 10,
	AUTH_CACHE_LIFESPAN_SECONDS: 30,
	AUTH_SESSION_TOKEN_TTL_IN_HOURS: 24,
	AUTH_SESSION_CACHE_TTL_AFTER_TOKEN_REFRESH_IN_SECONDS: 60,
	AUTH_COOKIE_NAME: 'id',
	NODE_ENV: Environment.Development,
});

describe('AuthController', () => {
	let authController: AuthController;
	const authService = mock<AuthService>();
	const response = mock<Response>();
	const request = mock<AutenticatedRequest>();

	beforeEach(async () => {
		const module = await Test.createTestingModule({
			providers: [AuthController, { provide: AuthService, useValue: authService }, { provide: authConfigRegistration.KEY, useValue: authConfig }],
		}).compile();
		authController = module.get(AuthController);
	});

	it('should be defined', () => {
		expect(authController).toBeDefined();
		expect(authService).toBeDefined();
		expect(authConfigRegistration.KEY).toBeDefined();
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
			expect(response.cookie).toHaveBeenCalledWith(authConfig.cookie.name, newToken, authConfig.cookie);
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
			expect(response.cookie).toHaveBeenCalledWith(authConfig.cookie.name, newToken, authConfig.cookie);
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
			expect(response.clearCookie).toHaveBeenCalledWith(authConfig.cookie.name);
		});
	});
});
