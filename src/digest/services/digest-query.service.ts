import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Digest, DigestStatus } from '../entities/digest.entity';

@Injectable()
export class DigestQueryService {
  constructor(
    @InjectRepository(Digest)
    private readonly digestRepo: Repository<Digest>,
  ) {}

  async findById(id: string): Promise<Digest> {
    const digest = await this.digestRepo.findOne({ where: { id } });
    if (!digest) {
      throw new NotFoundException(`Digest ${id} not found`);
    }
    return digest;
  }

  async findLatestBuiltOrSent(): Promise<Digest> {
    const digest = await this.digestRepo.findOne({
      where: { status: In([DigestStatus.DRAFT, DigestStatus.SENT]) },
      order: { createdAt: 'DESC' },
    });
    if (!digest) {
      throw new NotFoundException('No built or sent digest found');
    }
    return digest;
  }

  async markSent(digestId: string): Promise<void> {
    await this.digestRepo.update(digestId, {
      status: DigestStatus.SENT,
      sentAt: new Date(),
    });
  }

  async markFailed(digestId: string): Promise<void> {
    await this.digestRepo.update(digestId, { status: DigestStatus.FAILED });
  }
}
