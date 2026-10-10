import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Componere v2', description: 'Ephemeral settlement mandates on Tempo.' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}