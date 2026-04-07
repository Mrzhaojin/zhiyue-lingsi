import { NavLink } from 'react-router-dom'
import { BooksIcon, ForumIcon, HomeIcon, NoteIcon, UserIcon } from '../../../ui/NavIcons'

function Item(props: { to: string; label: string; icon: React.ReactNode }) {
  return (
    <NavLink
      to={props.to}
      className={({ isActive }) =>
        `nav-item ${isActive ? 'active' : ''}`.trim()
      }
    >
      <span className="nav-icon" aria-hidden="true">
        {props.icon}
      </span>
      <span className="nav-label">{props.label}</span>
    </NavLink>
  )
}

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="底部导航">
      <Item to="/" label="首页" icon={<HomeIcon size={22} />} />
      <Item to="/shelf" label="书架" icon={<BooksIcon size={22} />} />
      <Item to="/forum" label="社区" icon={<ForumIcon size={22} />} />
      <Item to="/notes" label="笔记" icon={<NoteIcon size={22} />} />
      <Item to="/me" label="我的" icon={<UserIcon size={22} />} />
    </nav>
  )
}
