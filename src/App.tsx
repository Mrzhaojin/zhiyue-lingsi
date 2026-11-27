import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { WebShell } from './app/shell/WebShell'
import { MobileShell } from './app/shell/MobileShell'
import { HomePage } from './pages/HomePage'
import { BookshelfPage } from './pages/BookshelfPage'
import { ReadSearchPage } from './pages/ReadSearchPage'
import { ReaderPage } from './pages/ReaderPage'
import { ForumPage } from './pages/ForumPage'
import { PostDetailPage } from './pages/PostDetailPage'
import { NewPostPage } from './pages/NewPostPage'
import { TopicDetailPage } from './pages/TopicDetailPage'
import { SearchPage } from './pages/SearchPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { NotesPage } from './pages/NotesPage'
import { NoteEditorPage } from './pages/NoteEditorPage'
import { MePage } from './pages/MePage'
import { ReadingHistoryPage } from './pages/ReadingHistoryPage'
import { MessagesPage } from './pages/MessagesPage'
import { SettingsPage } from './pages/SettingsPage'
import { LearningPage } from './pages/LearningPage'
import { CollectionsPage } from './pages/CollectionsPage'
import { AdminPage } from './pages/AdminPage'
import { MyPostsPage } from './pages/MyPostsPage'
import { MyNotesPage } from './pages/MyNotesPage'
import { FollowersPage } from './pages/FollowersPage'
import { ProfileEditPage } from './pages/ProfileEditPage'
import { AIChatHistoryPage } from './pages/AIChatHistoryPage'
import { AIAnalysisRecordsPage } from './pages/AIAnalysisRecordsPage'
import { ToastProvider } from './ui/ToastProvider'
import { useApplyTheme } from './app/theme'
import { GlobalAIAssistant } from './components/GlobalAIAssistant'
import {
  AuthProvider,
  ChangePasswordPage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  RequireAuth,
  RequirePermission,
} from './modules/auth/client'
import { initializeDatabase } from './data/db'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './app/queryClient'
import { DataInvalidator } from './app/DataInvalidator'
import { useEffect, useState, useCallback } from 'react'

function App() {
  useApplyTheme()
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const [ready, setReady] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)

  const checkScreenSize = useCallback(() => {
    setIsMobile(window.innerWidth < 768)
  }, [])

  useEffect(() => {
    let cancelled = false
    initializeDatabase()
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch((error: unknown) => {
        if (!cancelled) setBootError(error instanceof Error ? error.message : '数据初始化失败')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [checkScreenSize])

  if (bootError) {
    return (
      <div style={{ maxWidth: 560, margin: '80px auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>本地数据初始化失败</h1>
        <p style={{ color: '#b42318', fontSize: 14, lineHeight: 1.7 }}>{bootError}</p>
        <p style={{ color: '#666', fontSize: 13, lineHeight: 1.8 }}>
          旧数据仍保留在 localStorage 的 read_forum_db_v5 中，没有被删除。
          可以先在浏览器控制台执行 <code>copy(localStorage.getItem('read_forum_db_v5'))</code> 备份，再刷新重试。
        </p>
        <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: '8px 16px' }}>
          重新加载
        </button>
      </div>
    )
  }

  if (!ready) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: '#888', fontSize: 14 }}>
        正在载入本地数据…
      </div>
    )
  }

  const ShellComponent = isMobile ? MobileShell : WebShell

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DataInvalidator />
      <ToastProvider>
        <Routes>
          <Route path="/zhiyueling-si/login" element={<LoginPage />} />
          <Route path="/zhiyueling-si/register" element={<RegisterPage />} />
          <Route path="/zhiyueling-si/forgot" element={<ForgotPasswordPage />} />
          <Route path="/zhiyueling-si/password/change" element={<ChangePasswordPage />} />
          <Route path="/zhiyueling-si/password/reset" element={<ResetPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/login" element={<Navigate to="/zhiyueling-si/login" replace />} />
          <Route path="/auth/register" element={<Navigate to="/zhiyueling-si/register" replace />} />
          <Route path="/auth/forgot" element={<Navigate to="/zhiyueling-si/forgot" replace />} />
          <Route path="/auth/password/change" element={<Navigate to="/zhiyueling-si/password/change" replace />} />
          <Route element={<RequireAuth><ShellComponent /></RequireAuth>}>
            <Route path="/" element={<HomePage />} />
            <Route path="/shelf" element={<BookshelfPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/read" element={<ReadSearchPage />} />
            <Route path="/read/:bookId" element={<ReaderPage />} />
            <Route path="/forum" element={<ForumPage />} />
            <Route path="/forum/new" element={<NewPostPage />} />
            <Route path="/forum/:postId" element={<PostDetailPage />} />
            <Route path="/forum/topics/:tagName" element={<TopicDetailPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/notes/new" element={<NoteEditorPage mode="create" />} />
            <Route path="/notes/:noteId/edit" element={<NoteEditorPage mode="edit" />} />
            <Route path="/me" element={<MePage />} />
            <Route path="/me/profile" element={<ProfileEditPage />} />
            <Route path="/me/history" element={<ReadingHistoryPage />} />
            <Route path="/me/stats/posts" element={<MyPostsPage />} />
            <Route path="/me/stats/notes" element={<MyNotesPage />} />
            <Route path="/me/stats/followers" element={<FollowersPage />} />
            <Route path="/me/messages" element={<MessagesPage />} />
            <Route path="/me/ai-chats" element={<AIChatHistoryPage />} />
            <Route path="/me/analysis-records" element={<AIAnalysisRecordsPage />} />
            <Route path="/me/settings" element={<SettingsPage />} />
            <Route path="/me/learning" element={<LearningPage />} />
            <Route path="/me/collections" element={<CollectionsPage />} />
            <Route
              path="/admin"
              element={
                <RequirePermission permission="auth:admin:users:read">
                  <AdminPage />
                </RequirePermission>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <GlobalAIAssistant />
      </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App