import { type Database } from '../db/schema'
import { store } from '../db/store'

export function now() {
  return Date.now()
}

export function data(): Database {
  return store.getSnapshot()
}
