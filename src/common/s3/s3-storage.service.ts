import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { LoggingService } from '../logging/logging.service';

@Injectable()
export class S3StorageService {
  private readonly s3Client: S3Client | null;
  private readonly bucket: string;
  private readonly isConfigured: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggingService,
  ) {
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    const region = this.configService.get<string>('S3_REGION', 'us-east-1');
    const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.configService.get<string>('S3_SECRET_KEY');
    const forcePathStyle = this.configService.get<string>('S3_FORCE_PATH_STYLE') === 'true';

    this.bucket = this.configService.get<string>('S3_BUCKET', 'myapp');

    if (!accessKeyId || !secretAccessKey || !endpoint) {
      this.logger.info('S3 credentials or endpoint are missing. S3 functionality will be unavailable.');
      this.s3Client = null;
      this.isConfigured = false;
      return;
    }

    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle,
    });

    this.isConfigured = true;
    this.logger.info('S3 client initialized', { endpoint, region, bucket: this.bucket });
  }

  async uploadFile(params: {
    key: string;
    body: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    this.assertConfigured();

    const { key, body, contentType, metadata } = params;

    try {
      await this.s3Client!.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          Metadata: metadata,
        }),
      );
      this.logger.info('File uploaded to S3', { key, bucket: this.bucket });
    } catch (error) {
      this.logger.error(`S3 upload failed for key: ${key}`, error);
      throw new InternalServerErrorException({ message: `S3 upload failed for key: ${key}`, errorCode: 'S3_ERROR' });
    }
  }

  async deleteFile(key: string): Promise<void> {
    this.assertConfigured();

    try {
      await this.s3Client!.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      this.logger.info('File deleted from S3', { key, bucket: this.bucket });
    } catch (error) {
      this.logger.error(`S3 delete failed for key: ${key}`, error);
      throw new InternalServerErrorException({ message: `S3 delete failed for key: ${key}`, errorCode: 'S3_ERROR' });
    }
  }

  private assertConfigured() {
    if (!this.isConfigured || !this.s3Client) {
      this.logger.error('S3 is not configured.');
      throw new InternalServerErrorException({ message: 'S3 storage is not configured.', errorCode: 'S3_ERROR' });
    }
  }
}