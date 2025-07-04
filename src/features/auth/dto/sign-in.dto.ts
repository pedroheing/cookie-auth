import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class SignInDto {
	@IsNotEmpty()
	@IsString()
	@MinLength(5)
	@MaxLength(100)
	username: string;

	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	@MaxLength(255)
	password: string;
}
