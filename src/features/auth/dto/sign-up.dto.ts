import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class SignUpDto {
	@IsNotEmpty()
	@IsString()
	@MinLength(5)
	@MaxLength(100)
	readonly username!: string;

	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	@MaxLength(255)
	readonly password!: string;

	@IsNotEmpty()
	@IsString()
	@MinLength(3)
	@MaxLength(255)
	readonly firstName!: string;

	@IsNotEmpty()
	@IsString()
	@MinLength(3)
	@MaxLength(255)
	readonly lastName!: string;
}
