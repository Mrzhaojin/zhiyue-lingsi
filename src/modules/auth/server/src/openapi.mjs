export function buildOpenApiSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Auth API',
      version: '1.0.0',
      description: 'Enterprise-grade authentication & RBAC module',
    },
    servers: [{ url: '/' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        ApiError: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: {},
          },
          required: ['code', 'message'],
        },
      },
    },
    paths: {
      '/api/v1/auth/login': {
        post: {
          summary: 'Login by username/email + password',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    identifier: { type: 'string' },
                    password: { type: 'string' },
                    remember: { type: 'boolean' },
                  },
                  required: ['identifier', 'password'],
                },
              },
            },
          },
          responses: {
            200: { description: 'OK' },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          },
        },
      },
      '/api/v1/auth/token/refresh': {
        post: {
          summary: 'Refresh access token using refresh cookie',
          responses: {
            200: { description: 'OK' },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/api/v1/auth/logout': { post: { summary: 'Logout current device', responses: { 200: { description: 'OK' } } } },
      '/api/v1/auth/logout/all': { post: { summary: 'Logout all devices', responses: { 200: { description: 'OK' } } } },
      '/api/v1/auth/me': {
        get: {
          summary: 'Get current user profile with RBAC',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } },
        },
      },
      '/api/v1/auth/register': { post: { summary: 'Register (email verification required)', responses: { 200: { description: 'OK' } } } },
      '/api/v1/auth/register/verify': { post: { summary: 'Verify email activation', responses: { 200: { description: 'OK' } } } },
      '/api/v1/auth/password/forgot': { post: { summary: 'Request password reset email', responses: { 200: { description: 'OK' } } } },
      '/api/v1/auth/password/reset': { post: { summary: 'Reset password using token', responses: { 200: { description: 'OK' } } } },
      '/api/v1/auth/password/change': {
        post: { summary: 'Change password (auth required)', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } },
      },
      '/api/v1/auth/admin/users/{userId}/ban': {
        post: {
          summary: 'Ban user (admin)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'OK' }, 403: { description: 'Forbidden' } },
        },
      },
      '/api/v1/auth/admin/users/{userId}/unban': {
        post: {
          summary: 'Unban user (admin)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'OK' }, 403: { description: 'Forbidden' } },
        },
      },
      '/api/v1/auth/login/sms': { post: { summary: 'Phone + SMS login (reserved)', responses: { 501: { description: 'Not implemented' } } } },
      '/api/v1/auth/login/oauth/{provider}': {
        post: {
          summary: 'Third-party login (reserved)',
          parameters: [{ name: 'provider', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 501: { description: 'Not implemented' } },
        },
      },
    },
  }
}

