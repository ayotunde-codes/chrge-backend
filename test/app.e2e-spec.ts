import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Check', () => {
    it('/api/v1/health (GET) - should return health status', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200)
        .expect((res: request.Response) => {
          expect(res.body.data.status).toBeDefined();
          expect(res.body.data.services).toBeDefined();
        });
    });

    it('/api/v1/health/live (GET) - should return liveness', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200)
        .expect((res: request.Response) => {
          expect(res.body.data.status).toBe('ok');
        });
    });
  });

  describe('Authentication', () => {
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'TestPassword123!';
    let accessToken: string;
    let refreshToken: string;

    it('/api/v1/auth/register (POST) - should register a new user', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: testEmail,
          password: testPassword,
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(201)
        .expect((res: request.Response) => {
          expect(res.body.data.user.email).toBe(testEmail);
          expect(res.body.data.accessToken).toBeDefined();
          expect(res.body.data.refreshToken).toBeDefined();
          accessToken = res.body.data.accessToken;
          refreshToken = res.body.data.refreshToken;
        });
    });

    it('/api/v1/auth/login (POST) - should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        })
        .expect(200)
        .expect((res: request.Response) => {
          expect(res.body.data.user.email).toBe(testEmail);
          expect(res.body.data.accessToken).toBeDefined();
          accessToken = res.body.data.accessToken;
          refreshToken = res.body.data.refreshToken;
        });
    });

    it('/api/v1/auth/me (GET) - should get current user', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res: request.Response) => {
          expect(res.body.data.email).toBe(testEmail);
        });
    });

    it('/api/v1/auth/refresh (POST) - should refresh tokens', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200)
        .expect((res: request.Response) => {
          expect(res.body.data.accessToken).toBeDefined();
          expect(res.body.data.refreshToken).toBeDefined();
        });
    });
  });
});
