import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { SignUpDto } from './dto/sign-up.dto';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SignInDto } from './dto/sign-in.dto';
import { AuthConfig, authConfigRegistration } from 'src/config/auth.config';

@Controller('auth')
export class AuthController {
	constructor(
		private readonly authenticationService: AuthService,
		@Inject(authConfigRegistration.KEY) private readonly authConfig: AuthConfig,
	) {}

	@Post('sign-up')
	public async signUp(@Res({ passthrough: true }) res: Response, @Body() body: SignUpDto) {
		const sessionToken = await this.authenticationService.signUp(body);
		this.addSessionTokenToResponseCookie(res, sessionToken);
	}

	@Post('sign-in')
	public async signIn(@Res({ passthrough: true }) res: Response, @Body() body: SignInDto) {
		const sessionToken = await this.authenticationService.signIn(body.username, body.password);
		this.addSessionTokenToResponseCookie(res, sessionToken);
	}

	@Post('sign-out')
	public async signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
		const sessionToken = req.cookies?.[this.authConfig.cookie.name];
		if (!sessionToken) {
			return;
		}
		await this.authenticationService.signOut(sessionToken);
		res.clearCookie(this.authConfig.cookie.name);
	}

	private addSessionTokenToResponseCookie(res: Response, sessionToken: string) {
		res.cookie(this.authConfig.cookie.name, sessionToken, this.authConfig.cookie);
	}
}
