import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService, PrismaTx } from 'src/common/prisma/prisma.service';

interface UserInput {
	firstName: string;
	lastName: string;
	username: string;
	hashedPassword: string;
}
@Injectable()
export class UserService {
	constructor(private readonly prismaService: PrismaService) {}

	async create(input: UserInput, tx?: PrismaTx) {
		const prismaService = tx ?? this.prismaService;
		const user = await prismaService.user
			.create({
				data: {
					first_name: input.firstName,
					last_name: input.lastName,
					username: input.username,
					password: input.hashedPassword,
				},
			})
			.catch((err) => {
				if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
					throw new ConflictException('Username already in use.');
				}
				throw err;
			});
		return user;
	}

	async findByUsername(username: string) {
        return this.prismaService.user.findUnique({
            where: { username },
        });
    }

	async find(userId: number) {
        return this.prismaService.user.findUnique({
            where: { user_id: userId },
        });
    }

    async updatePassword(userId: number, newHash: string, tx?: PrismaTx) {
        const prismaService = tx ?? this.prismaService;
        return prismaService.user.update({
            where: { user_id: userId },
            data: { password: newHash },
        });
    }
}
