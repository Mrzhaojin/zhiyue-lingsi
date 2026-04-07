export function getConfig() {
  const env = process.env.NODE_ENV ?? 'development'
  const port = Number(process.env.PORT ?? 8787)
  const databaseUrl = process.env.DATABASE_URL ?? ''
  const accessTokenSecret = process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret_change_me'
  const refreshTokenSecret = process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret_change_me'

  return {
    env,
    port,
    databaseUrl,
    accessTokenSecret,
    refreshTokenSecret,
    accessTokenTtlSeconds: 2 * 60 * 60,
    refreshTokenTtlSeconds: 7 * 24 * 60 * 60,
    cookie: {
      name: 'auth_refresh',
      secure: env === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth/',
    },
  }
}

