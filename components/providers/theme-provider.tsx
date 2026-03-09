'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      defaultTheme="light"
      storageKey="laal-button-theme"
      enableSystem={false}
      attribute="class"
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
