import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthConfigService } from 'src/features/auth/config/auth-config.service';

@Injectable()
export class GuestGuard implements CanActivate {
	constructor(private authConfigService: AuthConfigService) {}

	canActivate(context: ExecutionContext): boolean {
		const req = context.switchToHttp().getRequest() as Request;
		const cookieName = this.authConfigService.cookie.name;
		const token = req.cookies?.[cookieName];
		if (token) {
			throw new BadRequestException('You are already authenticated. Please sign out first.');
		}
		return true;
	}
}
