import Image from 'next/image'

type Props = {
  size?: 'md' | 'lg'
  className?: string
}

const SIZE = {
  md: 'h-20 sm:h-24',
  lg: 'h-32 sm:h-44',
} as const

export function BramptonMicStoolLogo({ size = 'lg', className = '' }: Props) {
  return (
    <Image
      src="/images/mic_stool_logo_cutout_preview_large.png"
      alt="Mic stand and stool"
      width={400}
      height={614}
      priority
      className={`mx-auto w-auto ${SIZE[size]} invert hue-rotate-180 ${className}`}
    />
  )
}
