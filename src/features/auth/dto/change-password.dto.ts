import { IsNotEmpty, IsNumber, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	@MaxLength(255)
	readonly currentPassword!: string;

	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	@MaxLength(255)
	readonly newPassword!: string;
}
