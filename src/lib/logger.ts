type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type Sink = (level: LogLevel, scope: string, args: unknown[]) => void

const sinks: Sink[] = []
const isDev = import.meta.env.DEV

/**
 * 轻量日志门面：页面与数据层只依赖它，不直接 console.*。
 * - 开发环境输出到 console；生产环境只保留 warn/error。
 * - 支持挂接 sink（未来接 Sentry / 自建采集），业务代码不需要改。
 */
function emit(level: LogLevel, scope: string, args: unknown[]) {
  for (const sink of sinks) {
    try {
      sink(level, scope, args)
    } catch {
      // sink 自身的错误不能影响调用方
    }
  }
  if (level === 'debug' && !isDev) return
  const prefix = `[${scope}]`
  if (level === 'error') console.error(prefix, ...args)
  else if (level === 'warn') console.warn(prefix, ...args)
  else if (isDev) console.info(prefix, ...args)
}

export function createLogger(scope: string) {
  return {
    debug: (...args: unknown[]) => emit('debug', scope, args),
    info: (...args: unknown[]) => emit('info', scope, args),
    warn: (...args: unknown[]) => emit('warn', scope, args),
    error: (...args: unknown[]) => emit('error', scope, args),
  }
}

export function addLogSink(sink: Sink): () => void {
  sinks.push(sink)
  return () => {
    const index = sinks.indexOf(sink)
    if (index >= 0) sinks.splice(index, 1)
  }
}

export const logger = createLogger('app')