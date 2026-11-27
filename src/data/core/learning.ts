import { nanoid } from 'nanoid'
import type { VocabItem } from '../../domain/models'
import { mutate } from '../db/store'
import { now, data } from './shared'

export function addVocabItem(item: Omit<VocabItem, 'id' | 'createdAt'>): VocabItem {
  return mutate((db, ctx) => {
    const v: VocabItem = { ...item, id: nanoid(), createdAt: now() }
    db.vocab[v.id] = v
    ctx.put('vocab', v)
    return v
  })
}

export function listVocab(userId: string, type?: VocabItem['type']): VocabItem[] {
  return Object.values(data().vocab)
    .filter((v) => v.userId === userId && (type ? v.type === type : true))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function deleteVocabItem(id: string) {
  if (!data().vocab[id]) return
  mutate((db, ctx) => {
    delete db.vocab[id]
    ctx.del('vocab', id)
  })
}
