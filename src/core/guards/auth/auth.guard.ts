import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { IS_PUBLIC_KEY } from '../../decorators/public-route.decorator';
import { AuthConfigService } from 'src/features/auth/config/auth-config.service';
import { SessionService } from 'src/features/auth/session/session.service';

export interface AutenticatedRequest extends Request {
	user: {
		userId: number;
		sessionToken: string;
	};
}

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		private sessionService: SessionService,
		private readonly authConfigService: AuthConfigService,
		private reflector: Reflector,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
		if (isPublic) {
			return true;
		}
		const request = context.switchToHttp().getRequest() as Request;
		const response = context.switchToHttp().getResponse() as Response;
		let sessionToken = request.cookies?.[this.authConfigService.cookie.name];
		if (!sessionToken) {
			throw new UnauthorizedException();
		}
		const validationResult = await this.sessionService.validateAndRefreshSession(sessionToken);
		if (!validationResult.isValid) {
			response.clearCookie(this.authConfigService.cookie.name);
			throw new UnauthorizedException();
		}
		if (validationResult.newSessionToken) {
			sessionToken = validationResult.newSessionToken;
			response.cookie(this.authConfigService.cookie.name, sessionToken, this.authConfigService.cookie);
		}
		request['user'] = {
			userId: validationResult.userId,
			sessionToken: sessionToken,
		};
		return true;
	}
}
