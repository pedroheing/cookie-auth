import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class SignInDto {
	@ApiProperty({
		example: 'testUser',
	})
	@IsNotEmpty()
	@IsString()
	@MinLength(5)
	@MaxLength(100)
	readonly username!: string;

	@ApiProperty({
		example: '123456',
	})
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	@MaxLength(255)
	readonly password!: string;
}
