export type MicNightSlug = 'brampton-open-mic' | 'toronto-open-mic'

export type MicNightData = {
  slug: MicNightSlug
  title: string
  shortTitle: string
  day: string
  city: string
  time: string
  venue: string
  address: string
  description: string
  languages: string[]
  ticketUrl?: string
  accentColor: string
}

export const MIC_NIGHTS: Record<MicNightSlug, MicNightData> = {
  'brampton-open-mic': {
    slug: 'brampton-open-mic',
    title: 'Brampton Open Mic',
    shortTitle: 'Wednesday Mic in Brampton',
    day: 'Every Wednesday',
    city: 'Brampton',
    time: '7:00 PM',
    venue: "Ryan's Chai",
    address: 'Brampton, ON',
    description:
      "Brampton's weekly home for multilingual comedy. Comedians take the stage in Punjabi, Hindi, Urdu, English — or all four in the same set. A warm, welcoming room that celebrates South Asian voices.",
    languages: ['Punjabi', 'Hindi', 'Urdu', 'English'],
    accentColor: '#c41e3a',
  },
  'toronto-open-mic': {
    slug: 'toronto-open-mic',
    title: 'Toronto Open Mic',
    shortTitle: 'Thursday Mic in Toronto',
    day: 'Every Thursday',
    city: 'Toronto',
    time: '7:30 PM',
    venue: 'SoCap',
    address: 'Toronto, ON',
    description:
      "Toronto's weekly multilingual comedy open mic at SoCap — where South Asian performers and comedy-curious newcomers mix it up every Thursday. Bring a tight five, or just bring yourself.",
    languages: ['Punjabi', 'Hindi', 'English', 'More'],
    accentColor: '#f5a623',
  },
}

export const MULTILINGUAL_SUB_LINKS = [
  { label: 'Brampton Open Mic', href: '/laalbutton/multilingual-comedy/brampton-open-mic' as const },
  { label: 'Toronto Open Mic', href: '/laalbutton/multilingual-comedy/toronto-open-mic' as const },
]

export function getMicNight(slug: MicNightSlug): MicNightData {
  return MIC_NIGHTS[slug]
}
