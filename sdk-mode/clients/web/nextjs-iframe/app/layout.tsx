import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AvatarKit Next.js (iframe) Demo',
  description: 'AvatarKit SDK iframe isolation approach with Next.js',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
