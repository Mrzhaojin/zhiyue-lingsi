import { defaultAdminConfig, type Database } from '../db/schema'
import { mutate } from '../db/store'
import { data } from './shared'

export function getAdminConfig() {
  return data().admin ?? defaultAdminConfig()
}

export function updateAdminConfig(partial: Partial<Database['admin']>) {
  mutate((db, ctx) => {
    const admin = { ...db.admin, ...partial }
    db.admin = admin
    ctx.meta('admin', admin)
  })
}
