import { supabase } from '../lib/supabase'
import type {
  Comment,
  Interaction,
  Note,
  Post,
  TopicTag,
  User,
} from './models'

class DbService {
  // 用户相关操作
  async getUserById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      console.error('Error getting user:', error)
      return null
    }
    
    return data
  }

  async createUser(user: User): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .insert(user)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating user:', error)
      return null
    }
    
    return data
  }

  // 帖子相关操作
  async getPosts(): Promise<Post[]> {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error getting posts:', error)
      return []
    }
    
    return data
  }

  async createPost(post: Post): Promise<Post | null> {
    const { data, error } = await supabase
      .from('posts')
      .insert(post)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating post:', error)
      return null
    }
    
    return data
  }

  // 笔记相关操作
  async getNotes(): Promise<Note[]> {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('updated_at', { ascending: false })
    
    if (error) {
      console.error('Error getting notes:', error)
      return []
    }
    
    return data
  }

  async createNote(note: Note): Promise<Note | null> {
    const { data, error } = await supabase
      .from('notes')
      .insert(note)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating note:', error)
      return null
    }
    
    return data
  }

  // 评论相关操作
  async getComments(postId: string): Promise<Comment[]> {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
    
    if (error) {
      console.error('Error getting comments:', error)
      return []
    }
    
    return data
  }

  async createComment(comment: Comment): Promise<Comment | null> {
    const { data, error } = await supabase
      .from('comments')
      .insert(comment)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating comment:', error)
      return null
    }
    
    return data
  }

  // 标签相关操作
  async getTags(): Promise<TopicTag[]> {
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error getting tags:', error)
      return []
    }
    
    return data
  }

  async createTag(tag: TopicTag): Promise<TopicTag | null> {
    const { data, error } = await supabase
      .from('tags')
      .insert(tag)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating tag:', error)
      return null
    }
    
    return data
  }

  // 互动相关操作
  async createInteraction(interaction: Interaction): Promise<Interaction | null> {
    const { data, error } = await supabase
      .from('interactions')
      .insert(interaction)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating interaction:', error)
      return null
    }
    
    return data
  }

  async deleteInteraction(userId: string, targetType: string, targetId: string, kind: string): Promise<boolean> {
    const { error } = await supabase
      .from('interactions')
      .delete()
      .eq('user_id', userId)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .eq('kind', kind)
    
    if (error) {
      console.error('Error deleting interaction:', error)
      return false
    }
    
    return true
  }

  // 健康检查
  async healthCheck(): Promise<boolean> {
    try {
      const { error } = await supabase.from('users').select('id').limit(1)
      return !error
    } catch (error) {
      console.error('Health check failed:', error)
      return false
    }
  }
}

export const dbService = new DbService()
