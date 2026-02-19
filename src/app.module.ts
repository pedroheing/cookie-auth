import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthGuard } from './core/guards/auth/auth.guard';
import { GuestGuard } from './core/guards/guest/guest.guard';
import { AuthModule } from './features/auth/auth.module';

@Module({
	imports: [ConfigModule.forRoot(), AuthModule],
	controllers: [AppController],
	providers: [
		AppService,
		{
			provide: APP_GUARD,
			useClass: AuthGuard,
		},
		GuestGuard,
	],
})
export class AppModule {}
