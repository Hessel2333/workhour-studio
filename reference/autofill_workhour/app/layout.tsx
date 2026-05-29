import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '工时表生成器',
  description: '自动生成工时统计表的工具',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  )
}
