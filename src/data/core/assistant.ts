import { nanoid } from 'nanoid'
import type { AIAnalysisRecord, AIChatMessage, AIChatThread } from '../../domain/models'
import { mutate } from '../db/store'
import { now, data } from './shared'

export function createAIChatThread(userId: string, title?: string): AIChatThread {
  return mutate((db, ctx) => {
    const thread: AIChatThread = {
      id: nanoid(),
      userId,
      title: title ?? '阅读AI对话',
      createdAt: now(),
      updatedAt: now(),
    }
    db.aiChatThreads[thread.id] = thread
    ctx.put('aiChatThreads', thread)
    return thread
  })
}

export function listAIChatThreads(userId: string): AIChatThread[] {
  return Object.values(data().aiChatThreads)
    .filter((t) => t.userId === userId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function deleteAIChatThread(threadId: string) {
  const thread = data().aiChatThreads[threadId]
  if (!thread) return
  const messages = Object.values(data().aiChatMessages).filter((m) => m.threadId === threadId)
  mutate((db, ctx) => {
    delete db.aiChatThreads[threadId]
    ctx.del('aiChatThreads', threadId)
    for (const message of messages) {
      delete db.aiChatMessages[message.id]
      ctx.del('aiChatMessages', message.id)
    }
  })
}

export function addAIChatMessage(
  input: Omit<AIChatMessage, 'createdAt'> & { id?: string; createdAt?: number },
): AIChatMessage {
  return mutate((db, ctx) => {
    const message: AIChatMessage = { ...input, id: input.id ?? nanoid(), createdAt: input.createdAt ?? now() }
    db.aiChatMessages[message.id] = message
    ctx.put('aiChatMessages', message)
    const thread = db.aiChatThreads[message.threadId]
    if (thread) {
      const next: AIChatThread = { ...thread, updatedAt: message.createdAt }
      db.aiChatThreads[thread.id] = next
      ctx.put('aiChatThreads', next)
    }
    return message
  })
}

export function listAIChatMessages(threadId: string): AIChatMessage[] {
  return Object.values(data().aiChatMessages)
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function addAIAnalysisRecord(
  input: Omit<AIAnalysisRecord, 'id' | 'createdAt'> & { id?: string; createdAt?: number },
): AIAnalysisRecord {
  return mutate((db, ctx) => {
    const id = input.id ?? nanoid()
    const record: AIAnalysisRecord = {
      id,
      userId: input.userId,
      bookId: input.bookId,
      chapterId: input.chapterId,
      createdAt: input.createdAt ?? now(),
      analysis: input.analysis,
    }
    db.aiAnalysisRecords[id] = record
    ctx.put('aiAnalysisRecords', record)
    return record
  })
}

export function listAIAnalysisRecords(userId: string): AIAnalysisRecord[] {
  return Object.values(data().aiAnalysisRecords)
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function deleteAIAnalysisRecord(id: string) {
  if (!data().aiAnalysisRecords[id]) return
  mutate((db, ctx) => {
    delete db.aiAnalysisRecords[id]
    ctx.del('aiAnalysisRecords', id)
  })
}
