import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { SignUpDto } from './dto/sign-up.dto';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { SignInDto } from './dto/sign-in.dto';
import { Public } from 'src/core/decorators/public-route.decorator';
import { AutenticatedRequest } from 'src/core/guards/auth/auth.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthConfigService } from './config/auth-config.service';
import { ApiResponse } from '@nestjs/swagger';
import { GuestGuard } from 'src/core/guards/guest/guest.guard';

@Controller('auth')
export class AuthController {
	constructor(
		private readonly authenticationService: AuthService,
		private readonly authConfigService: AuthConfigService,
	) {}

	@ApiResponse({ status: HttpStatus.CREATED, description: 'The user has been successfully registered.' })
	@Public()
	@UseGuards(GuestGuard)
	@Post('sign-up')
	public async signUp(@Res({ passthrough: true }) res: Response, @Body() body: SignUpDto) {
		const sessionToken = await this.authenticationService.signUp(body);
		this.addSessionTokenToResponseCookie(res, sessionToken);
	}

	@ApiResponse({ status: HttpStatus.OK, description: 'The sign in was successful and the cookie was set on the client.' })
	@ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'The sign in failed. Incorrect username or password' })
	@Public()
	@UseGuards(GuestGuard)
	@HttpCode(HttpStatus.OK)
	@Post('sign-in')
	public async signIn(@Res({ passthrough: true }) res: Response, @Body() body: SignInDto) {
		const sessionToken = await this.authenticationService.signIn(body.username, body.password);
		this.addSessionTokenToResponseCookie(res, sessionToken);
	}

	@ApiResponse({ status: HttpStatus.OK, description: 'The sign out was successful and the cookie was removed from the client' })
	@HttpCode(HttpStatus.OK)
	@Post('sign-out')
	public async signOut(@Req() req: AutenticatedRequest, @Res({ passthrough: true }) res: Response) {
		await this.authenticationService.signOut(req.user.sessionToken);
		res.clearCookie(this.authConfigService.cookie.name);
	}

	@ApiResponse({ status: HttpStatus.OK, description: 'The password was changed successfully' })
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
