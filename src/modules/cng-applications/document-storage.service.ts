import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';
import { access, mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, resolve, sep } from 'path';
import { Readable } from 'stream';

@Injectable()
export class DocumentStorageService {
  private readonly bucket?: string;
  private readonly client?: S3Client;
  private readonly localRoot: string;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('R2_SECRET_ACCESS_KEY');
    this.bucket = this.configService.get<string>('R2_BUCKET');
    this.localRoot = resolve(
      this.configService.get<string>(
        'CNG_DOCUMENT_STORAGE_PATH',
        'private-uploads/cng-applications',
      ),
    );

    if (accountId && accessKeyId && secretAccessKey && this.bucket) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.client && this.bucket) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return;
    }

    const path = this.resolveLocalPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body, { mode: 0o600 });
  }

  async getObject(key: string): Promise<Readable> {
    if (this.client && this.bucket) {
      try {
        const result = await this.client.send(
          new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        );
        if (!result.Body) throw new NotFoundException('Stored document is unavailable');
        return result.Body as Readable;
      } catch (error) {
        if (error instanceof NotFoundException) throw error;
        const statusCode = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode;
        if (statusCode === 404) {
          throw new NotFoundException('Stored document is unavailable');
        }
        throw error;
      }
    }

    try {
      const path = this.resolveLocalPath(key);
      await access(path);
      return createReadStream(path);
    } catch {
      throw new NotFoundException('Stored document is unavailable');
    }
  }

  async deleteObject(key: string): Promise<void> {
    if (this.client && this.bucket) {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return;
    }

    try {
      await unlink(this.resolveLocalPath(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private resolveLocalPath(key: string): string {
    const path = resolve(this.localRoot, key);
    if (path !== this.localRoot && !path.startsWith(`${this.localRoot}${sep}`)) {
      throw new Error('Invalid document storage key');
    }
    return path;
  }
}
