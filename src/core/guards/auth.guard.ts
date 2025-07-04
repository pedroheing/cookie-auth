import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { AuthConfig, authConfigRegistration } from 'src/config/auth.config';
import { AuthService } from 'src/features/auth/auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public-route.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		private authService: AuthService,
		@Inject(authConfigRegistration.KEY) private readonly authConfig: AuthConfig,
		private reflector: Reflector,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
		if (isPublic) {
			return true;
		}
		const request = context.switchToHttp().getRequest() as Request;
		const response = context.switchToHttp().getResponse() as Response;
		const sessionToken = request.cookies?.[this.authConfig.cookie.name];
		if (!sessionToken) {
			throw new UnauthorizedException();
		}
		const validationResult = await this.authService.validateSession(sessionToken);
		if (!validationResult) {
			response.clearCookie(this.authConfig.cookie.name);
			throw new UnauthorizedException();
		}
		if (validationResult.newSessionToken) {
			response.cookie(this.authConfig.cookie.name, validationResult.newSessionToken, this.authConfig.cookie);
		}
		request['user'] = {
			userId: validationResult.userId,
		};
		return true;
	}
}
