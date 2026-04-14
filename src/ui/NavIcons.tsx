export function HomeIcon(props: { size?: number }) {
  const size = props.size ?? 22
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V20a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 20v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.05"
      />
      <path d="M9.5 21V14.5h5V21" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function BooksIcon(props: { size?: number }) {
  const size = props.size ?? 22
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M6 4.5h10.5A1.5 1.5 0 0 1 18 6v14.5H6A2 2 0 0 1 4 18.5V6.5A2 2 0 0 1 6 4.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.05"
      />
      <path d="M6 20.5V4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 8h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function ForumIcon(props: { size?: number }) {
  const size = props.size ?? 22
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H11l-4 3v-3H7.5A2.5 2.5 0 0 1 5 12.5v-6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.05"
      />
      <path d="M8.2 8.4h7.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8.2 11.1h5.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function NoteIcon(props: { size?: number }) {
  const size = props.size ?? 22
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M7 3.8h7.8L19.8 8.8V20a1.8 1.8 0 0 1-1.8 1.8H7A1.8 1.8 0 0 1 5.2 20V5.6A1.8 1.8 0 0 1 7 3.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.05"
      />
      <path d="M14.8 3.8V9h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8.2 12h7.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8.2 15.2h6.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function UserIcon(props: { size?: number }) {
  const size = props.size ?? 22
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M12 12.2a4.2 4.2 0 1 0-4.2-4.2 4.2 4.2 0 0 0 4.2 4.2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="currentColor"
        fillOpacity="0.05"
      />
      <path
        d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function SettingsIcon(props: { size?: number }) {
  const size = props.size ?? 22
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="currentColor"
        fillOpacity="0.05"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function HistoryIcon(props: { size?: number }) {
  const size = props.size ?? 22
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M8 3v4l3 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="currentColor"
        fillOpacity="0.05"
      />
      <path
        d="M12 2v2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M12 20v2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M4.93 4.93l1.41 1.41"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M17.66 17.66l1.41 1.41"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M2 12h2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M20 12h2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M6.34 17.66l-1.41 1.41"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M19.07 4.93l-1.41 1.41"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function CollectionIcon(props: { size?: number }) {
  const size = props.size ?? 22
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="currentColor"
        fillOpacity="0.05"
      />
    </svg>
  )
}

export function MessageIcon(props: { size?: number }) {
  const size = props.size ?? 22
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.05"
      />
    </svg>
  )
}

export function SearchIcon(props: { size?: number }) {
  const size = props.size ?? 22
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m21 21-4.3-4.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CategoryIcon(props: { size?: number }) {
  const size = props.size ?? 22
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M3 6h18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M3 12h18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M3 18h18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function LearningIcon(props: { size?: number }) {
  const size = props.size ?? 22
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M22 10v6M2 10l10-5 10 5-10 5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.05"
      />
      <path
        d="M6 12v5c3 3 9 3 12 0v-5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

