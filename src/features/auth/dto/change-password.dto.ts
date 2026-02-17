import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
	@ApiProperty({
		example: '123456',
	})
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	@MaxLength(255)
	readonly currentPassword!: string;

	@ApiProperty({
		example: 'new123456',
	})
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	@MaxLength(255)
	readonly newPassword!: string;
}
