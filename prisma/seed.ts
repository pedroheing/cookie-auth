import { PrismaClient, User } from '@prisma/client';
import { fakerPT_BR as faker } from '@faker-js/faker';
import * as dotenv from 'dotenv';
import * as argon2 from 'argon2';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
	if (process.env.NODE_ENV != 'development') {
		console.log("NODE_ENV env not on 'development' - stopping seed");
		return;
	}
	console.log('Start seeding...');
	await seedFakeUsers();
	console.log('Finished seeding!');
}

async function seedFakeUsers() {
	if (!process.env.SEED_DEFAULT_USER_PASSWORD) {
		console.log(
			'SEED_DEFAULT_USER_PASSWORD is not defined - ignoring seedFakeUsers',
		);
		return;
	}
	const hashedPassword = await argon2.hash(
		process.env.SEED_DEFAULT_USER_PASSWORD!,
	);
	for (let i = 0; i < 10; i++) {
		const user = {
			first_name: faker.person.firstName(),
			last_name: faker.person.lastName(),
			username: faker.internet.username(),
			password: hashedPassword,
		} as User;
		await prisma.user.upsert({
			where: {
				user_id: i + 1,
			},
			create: user,
			update: user,
		});
	}
	console.log('Fake users seeded...');
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
