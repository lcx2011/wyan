import { TESTIMONIALS } from '../data/landingData';
import { StarFilledIcon, QuoteIcon, SparklesIcon } from './LandingIcons';

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-24 parchment-bg relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-100 border border-orange-300 text-xs font-bold text-orange-950 mb-3 shadow-xs">
            <SparklesIcon className="w-4 h-4 text-primary" />
            <span>名校学霸 · 家长与名师真实反馈</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#261C14] tracking-tight mb-4">
            他们都在用文言文背诵 <span className="text-gradient-primary">高分通关</span>
          </h2>
          <p className="text-base sm:text-lg text-[#615145] leading-relaxed">
            从全国多所重点中学到家庭书房，千名师生共同见证科学记忆法的提分奇迹。
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {TESTIMONIALS.map((item, idx) => (
            <div
              key={idx}
              className="glass-card rounded-3xl p-7 sm:p-8 border border-[#DECFC0] bg-white/90 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between relative overflow-hidden"
            >
              <div className="absolute top-4 right-4 text-[#F0E5D8] -z-0">
                <QuoteIcon className="w-16 h-16 opacity-40" />
              </div>

              <div className="relative z-10 mb-6">
                {/* Rating & Tag */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1">
                    {[...Array(item.rating)].map((_, rIdx) => (
                      <StarFilledIcon key={rIdx} className="w-4 h-4" />
                    ))}
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
                    {item.tag}
                  </span>
                </div>

                {/* Quote Text */}
                <p className="text-sm sm:text-base text-[#3E2F23] leading-relaxed font-sans font-medium">
                  “{item.quote}”
                </p>
              </div>

              {/* User Meta Row */}
              <div className="pt-4 border-t border-[#EFE5DA] flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-[#FAF0E6] border border-[#E0D0C0] flex items-center justify-center text-xl shadow-xs">
                    {item.avatar}
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-[#261C14]">{item.name}</div>
                    <div className="text-xs text-[#8C7A6E]">{item.school}</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    {item.stats}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
