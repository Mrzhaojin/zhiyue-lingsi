import { NavLink } from 'react-router-dom'
import { BooksIcon, ForumIcon, HomeIcon, NoteIcon, UserIcon, SettingsIcon, HistoryIcon, CollectionIcon, MessageIcon, SearchIcon, CategoryIcon, LearningIcon } from '../../../ui/NavIcons'

function SidebarItem(props: { to: string; label: string; icon: React.ReactNode }) {
  return (
    <NavLink
      to={props.to}
      className={({ isActive }) =>
        `sidebar-item ${isActive ? 'active' : ''}`.trim()
      }
    >
      <span className="sidebar-icon" aria-hidden="true">
        {props.icon}
      </span>
      <span className="sidebar-label">{props.label}</span>
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <nav className="sidebar" aria-label="侧边导航">
      <div className="sidebar-section">
        <SidebarItem to="/" label="首页" icon={<HomeIcon size={20} />} />
        <SidebarItem to="/shelf" label="书架" icon={<BooksIcon size={20} />} />
        <SidebarItem to="/forum" label="社区" icon={<ForumIcon size={20} />} />
        <SidebarItem to="/notes" label="笔记" icon={<NoteIcon size={20} />} />
        <SidebarItem to="/search" label="搜索" icon={<SearchIcon size={20} />} />
        <SidebarItem to="/categories" label="分类" icon={<CategoryIcon size={20} />} />
      </div>
      
      <div className="sidebar-section">
        <h3 className="sidebar-section-title">个人中心</h3>
        <SidebarItem to="/me" label="我的" icon={<UserIcon size={20} />} />
        <SidebarItem to="/me/history" label="阅读历史" icon={<HistoryIcon size={20} />} />
        <SidebarItem to="/me/collections" label="我的收藏" icon={<CollectionIcon size={20} />} />
        <SidebarItem to="/me/messages" label="消息" icon={<MessageIcon size={20} />} />
        <SidebarItem to="/me/learning" label="学习中心" icon={<LearningIcon size={20} />} />
        <SidebarItem to="/me/settings" label="设置" icon={<SettingsIcon size={20} />} />
      </div>
    </nav>
  )
}
