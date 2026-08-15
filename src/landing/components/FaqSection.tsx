import { useState } from 'react';
import { FAQS } from '../data/landingData';
import { ChevronDownIcon, SparklesIcon } from './LandingIcons';

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-24 bg-[#F5EFE6] relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-100 border border-orange-300 text-xs font-bold text-orange-950 mb-3 shadow-xs">
            <SparklesIcon className="w-4 h-4 text-primary" />
            <span>解疑答惑</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#261C14] tracking-tight mb-4">
            常见问题解答 (FAQ)
          </h2>
          <p className="text-base sm:text-lg text-[#615145] leading-relaxed">
            关于文言文背诵系统的使用方式、设备支持及记忆机制。
          </p>
        </div>

        {/* Accordions */}
        <div className="space-y-4">
          {FAQS.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="glass-card rounded-2xl border border-[#DECFC0] bg-white/95 overflow-hidden transition-all duration-200"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-6 py-5 text-left flex items-center justify-between gap-4 cursor-pointer hover:bg-orange-50/40 transition-colors"
                >
                  <span className="font-extrabold text-[#261C14] text-base sm:text-lg flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-orange-100 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                      Q
                    </span>
                    {faq.q}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-full bg-[#FAF4ED] text-[#8C7A6E] flex items-center justify-center shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 bg-primary/10 text-primary' : ''
                    }`}
                  >
                    <ChevronDownIcon className="w-4 h-4" />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-6 pb-6 pt-1 text-sm sm:text-base text-[#5C4D43] leading-relaxed border-t border-[#F0E5D8]">
                    <p className="pt-2">{faq.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
