import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../platform/database/database.service';
import { Public } from '../platform/auth/request-context';

@ApiTags('platform')
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Public()
  @Get()
  async health(): Promise<{ status: 'ok' | 'degraded'; database: 'up' | 'down'; version: string }> {
    let database: 'up' | 'down' = 'up';
    try {
      const client = await this.database.connect();
      try {
        await this.database.bind(client).execute(sql`SELECT 1`);
      } finally {
        client.release();
      }
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      version: process.env.npm_package_version ?? '0.1.0',
    };
  }
}
