import Link from 'next/link'

export function LBFooter() {
  return (
    <footer className="border-t border-[#2a1a0e] bg-[#07050302] text-[#8a6a4a]">
      {/* Decorative line */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#c41e3a]/40 to-transparent" />

      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
          {/* Brand */}
          <div className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/laalbutton-logo-white.png"
              alt="Laal Button Comedy"
              className="h-10 w-auto object-contain opacity-90"
            />
            <p className="text-sm leading-relaxed text-[#6b5030]">
              Toronto&apos;s South Asian comedy community. Open mics, showcases, and spaces where stories live.
            </p>
          </div>

          {/* Series */}
          <div>
            <p className="text-[#c8a882] text-xs font-bold uppercase tracking-widest mb-4">Our Series</p>
            <ul className="space-y-2 text-sm">
              <li><Link href="/laalbutton/punjabis-in-tech" className="hover:text-[#f5a623] transition-colors">Punjabis in Tech</Link></li>
              <li>
                <Link href="/laalbutton/multilingual-comedy" className="hover:text-[#f5a623] transition-colors">
                  Multilingual Comedy Open Mics
                </Link>
              </li>
              <li className="pl-3 space-y-1.5 border-l border-[#2a1a0e] ml-1">
                <Link href="/laalbutton/multilingual-comedy/brampton-open-mic" className="block hover:text-[#f5a623] transition-colors text-[#6b5030]">
                  Brampton Open Mic
                </Link>
                <Link href="/laalbutton/multilingual-comedy/toronto-open-mic" className="block hover:text-[#f5a623] transition-colors text-[#6b5030]">
                  Toronto Open Mic
                </Link>
              </li>
              <li><Link href="/laalbutton/roti-kapda-aur-comedy" className="hover:text-[#f5a623] transition-colors">Roti Kapda Aur Comedy</Link></li>
              <li><Link href="/laalbutton/immigrants-with-attitude" className="hover:text-[#f5a623] transition-colors">Immigrants With Attitude</Link></li>
              <li>
                <Link href="/laalbutton/workshops" className="hover:text-[#f5a623] transition-colors">
                  Workshops
                </Link>
              </li>
              <li className="pl-3 space-y-1.5 border-l border-[#2a1a0e] ml-1">
                <Link href="/laalbutton/workshops#creativity-improv" className="block hover:text-[#f5a623] transition-colors text-[#6b5030]">
                  Creativity Workshops (Improv)
                </Link>
                <Link href="/laalbutton/workshops#seniors-standup" className="block hover:text-[#f5a623] transition-colors text-[#6b5030]">
                  Seniors Stand up Workshops
                </Link>
              </li>
              <li>
                <a href="https://laalbutton.com/satrang" target="_blank" rel="noopener noreferrer" className="hover:text-[#f5a623] transition-colors">
                  Satrang ↗
                </a>
              </li>
            </ul>
          </div>

          {/* Links */}
          <div>
            <p className="text-[#c8a882] text-xs font-bold uppercase tracking-widest mb-4">The App</p>
            <ul className="space-y-2 text-sm">
              <li><Link href="/laalbutton/about" className="hover:text-[#f5a623] transition-colors">About</Link></li>
              <li><Link href="/signup" className="hover:text-[#f5a623] transition-colors">Create Account</Link></li>
              <li><Link href="/login" className="hover:text-[#f5a623] transition-colors">Sign In</Link></li>
              <li><Link href="/events" className="hover:text-[#f5a623] transition-colors">Browse All Events</Link></li>
              <li><Link href="/contact" className="hover:text-[#f5a623] transition-colors">Contact</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[#1a0e05] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#4a3520]">
          <p>© {new Date().getFullYear()} Laal Button Comedy. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-[#8a6a4a] transition-colors">Privacy Policy</Link>
            <Link href="/contact" className="hover:text-[#8a6a4a] transition-colors">Contact</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
