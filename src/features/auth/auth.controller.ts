import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { SignUpDto } from './dto/sign-up.dto';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { SignInDto } from './dto/sign-in.dto';
import { Public } from 'src/core/decorators/public-route.decorator';
import { AutenticatedRequest } from 'src/core/guards/auth.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthConfigService } from './config/auth-config.service';

@Controller('auth')
export class AuthController {
	constructor(
		private readonly authenticationService: AuthService,
		private readonly authConfigService: AuthConfigService,
	) {}

	@Public()
	@Post('sign-up')
	public async signUp(@Res({ passthrough: true }) res: Response, @Body() body: SignUpDto) {
		const sessionToken = await this.authenticationService.signUp(body);
		this.addSessionTokenToResponseCookie(res, sessionToken);
	}

	@Public()
	@HttpCode(HttpStatus.OK)
	@Post('sign-in')
	public async signIn(@Res({ passthrough: true }) res: Response, @Body() body: SignInDto) {
		const sessionToken = await this.authenticationService.signIn(body.username, body.password);
		this.addSessionTokenToResponseCookie(res, sessionToken);
	}

	@HttpCode(HttpStatus.OK)
	@Post('sign-out')
	public async signOut(@Req() req: AutenticatedRequest, @Res({ passthrough: true }) res: Response) {
		await this.authenticationService.signOut(req.user.sessionToken);
		res.clearCookie(this.authConfigService.cookie.name);
	}

	@HttpCode(HttpStatus.OK)
	@Post('change-password')
	public async changePassword(@Req() req: AutenticatedRequest, @Body() dto: ChangePasswordDto) {
		const user = req.user;
		return this.authenticationService.changePassword({
			currentPassword: dto.currentPassword,
			newPassword: dto.newPassword,
			sessionToken: user.sessionToken,
			userId: user.userId,
		});
	}

	private addSessionTokenToResponseCookie(res: Response, sessionToken: string) {
		res.cookie(this.authConfigService.cookie.name, sessionToken, this.authConfigService.cookie);
	}
}
