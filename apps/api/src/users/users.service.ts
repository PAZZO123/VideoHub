import { Injectable } from '@nestjs/common';
import { ErrorCode, type PublicUser } from '@videohub/types';
import { AppException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { toPublicUser } from './users.mapper';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw AppException.notFound(ErrorCode.USER_NOT_FOUND, 'That account could not be found.');
    }
    return toPublicUser(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<PublicUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.preferredLanguage !== undefined
          ? { preferredLanguage: dto.preferredLanguage }
          : {}),
        ...(dto.kidsMode !== undefined ? { kidsMode: dto.kidsMode } : {}),
      },
    });
    return toPublicUser(user);
  }
}
