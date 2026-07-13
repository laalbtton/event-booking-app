import { LB_MEDIA } from '@/lib/laalbutton/media'

export type MicStoryChapter = {
  id: string
  title: string
  era?: string
  body: string
  /** Add image paths here as photos become available */
  imageSrc?: string
  imageAlt?: string
}

export type MicStoryIntro = {
  heading: string
  subheading: string
}

const VARIETY_ARTS: MicStoryChapter = {
  id: 'variety-arts',
  title: 'Variety Arts across Brampton',
  era: '2018',
  body:
    'Multilingual open mics started in Brampton with Laal Button in 2018 as Variety Arts events for South Asian artists. We began performing at a variety of venues across the city for a monthly gathering — comedy, music, poetry, and everything in between.',
  imageSrc: LB_MEDIA.firstVarietyMic.src,
  imageAlt: LB_MEDIA.firstVarietyMic.alt,
}

const STATION_ON_BLOOR: MicStoryChapter = {
  id: 'station-on-bloor',
  title: 'Station on Bloor',
  era: '2019',
  body:
    'In 2019 we expanded into Toronto with weekly open mics at Station on Bloor — our first regular Thursday home in the city, and the start of a Toronto chapter that has kept going ever since.',
}

const CIVIC_CENTRE: MicStoryChapter = {
  id: 'civic-centre',
  title: 'The Music Room at the Civic Centre',
  era: '2022',
  body:
    'We found a dedicated home at the Music Room in the Civic Centre. Monthly gatherings became a hit — a room that felt like ours. It did not last long: the entire building was repurposed when the City of Brampton gave it over for a medical school coming to Brampton.',
}

const URBAN_THEKA: MicStoryChapter = {
  id: 'urban-theka',
  title: 'Urban Theka',
  era: '2023',
  body:
    'We moved to a local restaurant called Urban Theka, where we hosted a weekly gathering every Friday — something everyone looked forward to each week. That chapter ended abruptly when the restaurant closed down. In fact, we had a show planned for the day it shut its doors, and it took us weeks to even recover our equipment.',
  imageSrc: LB_MEDIA.urbanTheka.src,
  imageAlt: LB_MEDIA.urbanTheka.alt,
}

const HERITAGE_INDIA: MicStoryChapter = {
  id: 'heritage-india',
  title: 'Heritage India Restaurant',
  era: '2024',
  body:
    'After another short break, we came back with weekly comedy open mics every Thursday at Heritage India Restaurant. We ran a weekly comedy show there for six months — until this place eventually closed down as well.',
  imageSrc: LB_MEDIA.heritageIndia.src,
  imageAlt: LB_MEDIA.heritageIndia.alt,
}

const DESI_FOOD_JUNCTION: MicStoryChapter = {
  id: 'desi-food-junction',
  title: 'Desi Food Junction — Toronto',
  era: '2025',
  body:
    'We moved the weekly Thursday show to Desi Food Junction in Toronto and said goodbye to Brampton — for a while.',
}

const RYANS_CHAI_TODAY: MicStoryChapter = {
  id: 'ryans-chai',
  title: "Ryan's Chai — today",
  body:
    "After a few months, we started a weekly comedy open mic in Brampton at Ryan's Chai — which is what is running at the moment, and we hope to see you there. Every week we have a different host, and entry is free.",
  imageSrc: LB_MEDIA.ryansChaiVibe2.src,
  imageAlt: LB_MEDIA.ryansChaiVibe2.alt,
}

const RYANS_CHAI_HISTORICAL: MicStoryChapter = {
  id: 'ryans-chai',
  title: "Ryan's Chai — Brampton returns",
  body:
    "While our Thursday show continued in Toronto, we also brought a weekly comedy open mic back to Brampton at Ryan's Chai — every Wednesday, a different host, and free entry.",
  imageSrc: LB_MEDIA.ryansChaiVibe.src,
  imageAlt: LB_MEDIA.ryansChaiVibe.alt,
}

const SOCAP_TODAY: MicStoryChapter = {
  id: 'socap',
  title: 'SoCap — today',
  body:
    'Today our weekly Toronto open mic runs at SoCap — the current home for Thursday multilingual comedy. We hope to see you in the room.',
  imageSrc: LB_MEDIA.torontoOpenMicSunny.src,
  imageAlt: LB_MEDIA.torontoOpenMicSunny.alt,
}

const SHARED_MIDDLE: MicStoryChapter[] = [
  VARIETY_ARTS,
  STATION_ON_BLOOR,
  CIVIC_CENTRE,
  URBAN_THEKA,
  HERITAGE_INDIA,
  DESI_FOOD_JUNCTION,
]

export const BRAMPTON_OPEN_MIC_STORY: MicStoryChapter[] = [...SHARED_MIDDLE, RYANS_CHAI_TODAY]

export const TORONTO_OPEN_MIC_STORY: MicStoryChapter[] = [
  ...SHARED_MIDDLE,
  RYANS_CHAI_HISTORICAL,
  SOCAP_TODAY,
]

export const BRAMPTON_STORY_INTRO: MicStoryIntro = {
  heading: 'Eight years of stages across the GTA',
  subheading:
    "From monthly variety nights in Brampton to a weekly home at Ryan's Chai — this mic has moved with the community.",
}

export const TORONTO_STORY_INTRO: MicStoryIntro = {
  heading: 'Eight years of stages across the GTA',
  subheading:
    'From Station on Bloor in 2019 to weekly open mics at SoCap today — Toronto has been part of the story all along.',
}
