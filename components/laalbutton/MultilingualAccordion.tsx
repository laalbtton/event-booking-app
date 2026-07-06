'use client'

import * as Accordion from '@radix-ui/react-accordion'
import { ChevronDown } from 'lucide-react'

type MicNight = {
  id: string
  title: string
  day: string
  city: string
  time: string
  venue: string
  address: string
  description: string
  languages: string[]
  ticketUrl?: string
}

const MIC_NIGHTS: MicNight[] = [
  {
    id: 'wednesday-brampton',
    title: 'Wednesday Mic in Brampton',
    day: 'Every Wednesday',
    city: 'Brampton',
    time: '7:00 PM',
    venue: "Ryan's Chai",
    address: 'Brampton, ON',
    description:
      "Brampton's weekly home for multilingual comedy. Comedians take the stage in Punjabi, Hindi, Urdu, English — or all four in the same set. A warm, welcoming room that celebrates South Asian voices.",
    languages: ['Punjabi', 'Hindi', 'Urdu', 'English'],
  },
  {
    id: 'thursday-toronto',
    title: 'Thursday Mic in Toronto',
    day: 'Every Thursday',
    city: 'Toronto',
    time: '7:30 PM',
    venue: 'TBA — Toronto venue',
    address: 'Toronto, ON',
    description:
      "Toronto's midweek comedy meetup — an open mic where South Asian performers and comedy curious newcomers mix it up. Bring a tight five, or just bring yourself.",
    languages: ['Punjabi', 'Hindi', 'English', 'More'],
  },
]

const serif = { fontFamily: "'DM Serif Display', Georgia, serif" } as const

export function MultilingualAccordion() {
  return (
    <Accordion.Root type="multiple" defaultValue={['wednesday-brampton']} className="space-y-3">
      {MIC_NIGHTS.map((mic) => (
        <Accordion.Item
          key={mic.id}
          value={mic.id}
          className="rounded-xl border border-[#2a1a0e] bg-[#120c06] overflow-hidden data-[state=open]:border-[#c41e3a]/40"
        >
          <Accordion.Trigger className="w-full flex items-center justify-between px-6 py-5 text-left group">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-[#e8d9c4] group-data-[state=open]:text-[#f5a623] transition-colors" style={serif}>
                  {mic.title}
                </span>
              </div>
              <p className="text-xs text-[#6b5030]">
                {mic.day} · {mic.city} · {mic.time}
              </p>
            </div>
            <ChevronDown
              className="h-4 w-4 text-[#6b5030] shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180 group-data-[state=open]:text-[#c41e3a]"
            />
          </Accordion.Trigger>

          <Accordion.Content className="overflow-hidden data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp">
            <div className="px-6 pb-6 pt-1 space-y-5 border-t border-[#1a0e05]">
              <p className="text-[#8a6a4a] text-sm leading-relaxed">{mic.description}</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-[#1a0e05] bg-[#0d0a07] px-4 py-3">
                  <p className="text-[10px] font-bold text-[#4a3520] uppercase tracking-widest mb-1">Venue</p>
                  <p className="text-[#c8a882] text-sm font-medium">{mic.venue}</p>
                  <p className="text-[#4a3520] text-xs">{mic.address}</p>
                </div>
                <div className="rounded-lg border border-[#1a0e05] bg-[#0d0a07] px-4 py-3">
                  <p className="text-[10px] font-bold text-[#4a3520] uppercase tracking-widest mb-1">Time</p>
                  <p className="text-[#c8a882] text-sm font-medium">{mic.day}</p>
                  <p className="text-[#4a3520] text-xs">{mic.time}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-[#4a3520] uppercase tracking-widest mb-2">Languages</p>
                <div className="flex flex-wrap gap-2">
                  {mic.languages.map((lang) => (
                    <span
                      key={lang}
                      className="px-2.5 py-1 rounded-full border border-[#2a1a0e] text-[#8a6a4a] text-[11px] font-medium"
                    >
                      {lang}
                    </span>
                  ))}
                </div>
              </div>

              {mic.ticketUrl && (
                <a
                  href={mic.ticketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#c41e3a] text-white text-sm font-bold hover:bg-[#a01830] transition-colors"
                >
                  Get Tickets ↗
                </a>
              )}
            </div>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  )
}
