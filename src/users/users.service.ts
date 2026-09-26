import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthenticatedUser } from '../auth/jwt.strategy';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<User[]> {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  /**
   * Resolves the current seller. When Auth0 is enabled the JWT `sub` is stored
   * on User.auth0Id. Locally this still returns the seeded demo user.
   */
  async findCurrent(identity?: AuthenticatedUser): Promise<User> {
    if (identity?.sub) {
      const existing = await this.prisma.user.findUnique({ where: { auth0Id: identity.sub } });
      if (existing) return existing;
      if (identity.email) {
        const byEmail = await this.prisma.user.findUnique({ where: { email: identity.email } });
        if (byEmail) {
          return this.prisma.user.update({
            where: { id: byEmail.id },
            data: { auth0Id: identity.sub },
          });
        }
      }
      return this.prisma.user.create({
        data: {
          auth0Id: identity.sub,
          email: identity.email ?? `${identity.sub.replace(/[^a-z0-9]/gi, '')}@auth.local`,
          name: identity.email ?? 'Seller',
        },
      });
    }

    const user = await this.prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!user) {
      throw new NotFoundException('No user found. Run `npm run prisma:seed`.');
    }
    return user;
  }
}
