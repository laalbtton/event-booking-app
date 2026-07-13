import type { MicStoryChapter, MicStoryIntro } from '@/lib/laalbutton/micOpenMicStory'

const serif = { fontFamily: "'DM Serif Display', Georgia, serif" } as const

type Props = {
  chapters: MicStoryChapter[]
  accentColor: string
  intro: MicStoryIntro
}

function StoryImage({ chapter }: { chapter: MicStoryChapter }) {
  if (chapter.imageSrc) {
    return (
      <div className="mt-5 overflow-hidden rounded-xl border border-[#2a1a0e] bg-[#0d0a07]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={chapter.imageSrc}
          alt={chapter.imageAlt ?? chapter.title}
          className="w-full h-auto block"
        />
      </div>
    )
  }

  return (
    <div
      className="mt-5 flex min-h-[140px] items-center justify-center rounded-xl border border-dashed border-[#2a1a0e] bg-[#0d0a07]/60 px-6 py-8 text-center"
      aria-label={`Photo placeholder for ${chapter.title}`}
    >
      <p className="text-[#4a3520] text-xs font-medium uppercase tracking-widest">Photo coming soon</p>
    </div>
  )
}

export function MicNightStoryTimeline({ chapters, accentColor, intro }: Props) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-14 border-t border-[#2a1a0e]">
      <div className="mb-10 max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] mb-2" style={{ color: accentColor }}>
          Our Story
        </p>
        <h2 className="text-3xl md:text-4xl font-black text-[#e8d9c4]" style={serif}>
          {intro.heading}
        </h2>
        <p className="text-[#6b5030] text-sm leading-relaxed mt-3">{intro.subheading}</p>
      </div>

      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-[#2a1a0e] hidden sm:block" />
        <div className="space-y-8">
          {chapters.map((chapter) => (
            <article key={chapter.id} className="sm:pl-12 relative">
              <div
                className="hidden sm:block absolute left-0 top-2 h-4 w-4 rounded-full border-2 bg-[#0d0a07]"
                style={{ borderColor: accentColor }}
              />
              <div className="rounded-xl border border-[#2a1a0e] bg-[#120c06] p-6 md:p-7">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
                  <h3 className="text-lg font-black text-[#e8d9c4]" style={serif}>
                    {chapter.title}
                  </h3>
                  {chapter.era && (
                    <>
                      <span className="text-[#3a2a18] text-xs hidden sm:inline">·</span>
                      <span className="text-[#6b5030] text-xs font-bold uppercase tracking-widest">
                        {chapter.era}
                      </span>
                    </>
                  )}
                </div>
                <p className="text-[#6b5030] text-sm leading-relaxed">{chapter.body}</p>
                <StoryImage chapter={chapter} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
