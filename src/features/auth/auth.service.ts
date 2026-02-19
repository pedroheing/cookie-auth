import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PasswordHashingService } from 'src/common/password-hashing/password-hashing.interface';
import { PrismaService, PrismaTx } from 'src/common/prisma/prisma.service';
import { UserService } from '../user/user.service';
import { SignUpDto } from './dto/sign-up.dto';
import { SessionService } from './session/session.service';

interface ChangePasswordInput {
	userId: number;
	sessionToken: string;
	currentPassword: string;
	newPassword: string;
}

@Injectable()
export class AuthService {
	private dummyPassword?: string;

	constructor(
		private readonly prismaService: PrismaService,
		private readonly passwordHashService: PasswordHashingService,
		private readonly sessionService: SessionService,
		private readonly userService: UserService,
	) {}

	public async signUp(dto: SignUpDto): Promise<string> {
		const hashedPassword = await this.passwordHashService.hash(dto.password);
		const result = await this.prismaService.$transaction(async (tx: PrismaTx) => {
			const user = await this.userService.create(
				{
					firstName: dto.firstName,
					lastName: dto.lastName,
					hashedPassword: hashedPassword,
					username: dto.username,
				},
				tx,
			);
			return this.sessionService.create(user.user_id, tx);
		});
		return result.sessionToken;
	}

	public async signIn(username: string, password: string): Promise<string> {
		const user = await this.userService.findByUsername(username);
		// uses dummy password as default to prevent timing attacks
		const userPassword = user?.password ?? (await this.getDummyPassword());
		const isValid = await this.passwordHashService.verify(userPassword, password);
		if (!isValid || !user) {
			throw new UnauthorizedException('Incorrect username or password');
		}
		const result = await this.sessionService.create(user.user_id);
		return result.sessionToken;
	}

	private async getDummyPassword(): Promise<string> {
		if (!this.dummyPassword) {
			this.dummyPassword = await this.passwordHashService.hash('a-very-long-and-very-secure-password');
		}
		return this.dummyPassword;
	}

	public async signOut(sessionToken: string): Promise<void> {
		await this.sessionService.revokeSession(sessionToken);
	}

	public async changePassword(input: ChangePasswordInput): Promise<void> {
		const user = await this.userService.find(input.userId);
		if (!user) {
			throw new NotFoundException('User not found');
		}
		const isCurrentPasswordValid = await this.passwordHashService.verify(user.password, input.currentPassword);
		if (!isCurrentPasswordValid) {
			throw new ForbiddenException('It was not possible to verify your current password');
		}
		const newPasswordHash = await this.passwordHashService.hash(input.newPassword);
		await this.prismaService.$transaction(async (tx: PrismaTx) => {
			await this.userService.updatePassword(input.userId, newPasswordHash, tx);
			await this.sessionService.revokeAllBut(user.user_id, input.sessionToken, tx);
		});
	}
}
