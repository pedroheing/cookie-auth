import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { SignUpDto } from './dto/sign-up.dto';
import { PrismaService, PrismaTx } from 'src/common/prisma/prisma.service';
import { PasswordHashingService } from 'src/common/password-hashing/password-hashing.interface';
import { SessionService } from './session/session.service';
import { UserService } from '../user/user.service';

interface ChangePasswordInput {
	userId: number;
	sessionToken: string;
	currentPassword: string;
	newPassword: string;
}

@Injectable()
export class AuthService {
	constructor(
		private readonly prismaService: PrismaService,
		private readonly passwordHashService: PasswordHashingService,
		private readonly sessionService: SessionService,
		private readonly userService: UserService,
	) {}

	public async signUp(dto: SignUpDto): Promise<string> {
		const hashedPassword = await this.passwordHashService.hash(dto.password);
		const result = await this.prismaService.$transaction(async (tx: PrismaTx) => {
			const user = await this.userService.create({
				firstName: dto.firstName,
				lastName: dto.lastName,
				hashedPassword: hashedPassword,
				username: dto.username,
			});
			return this.sessionService.create(user.user_id, tx);
		});
		await this.sessionService.addSessionToCache(result.session);
		return result.sessionToken;
	}

	public async signIn(username: string, password: string) {
		const user = await this.prismaService.user.findUnique({
			where: {
				username: username,
			},
			select: {
				user_id: true,
				username: true,
				password: true,
			},
		});
		// creates dummy password as default to prevent timing attacks
		let userPassword = await this.passwordHashService.hash('a-very-long-and-very-secure-password');
		if (user) {
			userPassword = user.password;
		}
		const isValid = await this.passwordHashService.verify(userPassword, password);
		if (!isValid || !user) {
			throw new UnauthorizedException('Incorrect username or password');
		}
		const result = await this.sessionService.create(user.user_id);
		await this.sessionService.addSessionToCache(result.session);
		return result.sessionToken;
	}

	public async signOut(sessionToken: string): Promise<void> {
		await this.sessionService.revokeSession(sessionToken);
	}

	public async changePassword(input: ChangePasswordInput): Promise<void> {
		const user = await this.prismaService.user.findUnique({
			where: {
				user_id: input.userId,
			},
			select: {
				user_id: true,
				password: true,
			},
		});
		if (!user) {
			throw new NotFoundException('User not found');
		}
		const isCurrentPasswordValid = await this.passwordHashService.verify(user.password, input.currentPassword);
		if (!isCurrentPasswordValid) {
			throw new ForbiddenException('It was not possible to verify your current password');
		}
		const newPasswordHash = await this.passwordHashService.hash(input.newPassword);
		const hashes = await this.prismaService.$transaction(async (tx: PrismaTx) => {
			await tx.user.update({
				where: {
					user_id: user.user_id,
				},
				data: {
					password: newPasswordHash,
				},
			});
			return this.sessionService.revokeAllBut(user.user_id, input.sessionToken, tx);
		});
		if (hashes.length > 0) {
			await this.sessionService.removeSessionFromCache(hashes);
		}
	}
}
