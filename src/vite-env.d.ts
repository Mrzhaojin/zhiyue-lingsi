/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase 项目地址；与 ANON_KEY 同时存在时进入云端模式 */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase anon key（公开密钥，真正的权限由 RLS 决定） */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** 强制本地演示模式：true 时即使配置了 Supabase 也走本地账号 */
  readonly VITE_LOCAL_MODE?: string
  /** AI 代理地址，例如 /api/ai；为空时 AI 功能明确不可用 */
  readonly VITE_AI_PROXY_URL?: string
}

type SpeechRecognitionResultList = {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

type SpeechRecognitionResult = {
  isFinal: boolean
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

type SpeechRecognitionAlternative = {
  transcript: string
  confidence: number
}

type SpeechRecognitionEvent = Event & {
  results: SpeechRecognitionResultList
}

type SpeechRecognition = EventTarget & {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}