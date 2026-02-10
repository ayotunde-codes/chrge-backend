import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a user by ID
   */
  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Find a user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase(), deletedAt: null },
    });
  }

  /**
   * Update user profile
   */
  async update(id: string, dto: UpdateUserDto): Promise<User> {
    // First verify user exists
    await this.findById(id);

    return this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        avatarUrl: dto.avatarUrl,
      },
    });
  }

  /**
   * Soft delete a user
   */
  async softDelete(id: string): Promise<void> {
    await this.findById(id);

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}




