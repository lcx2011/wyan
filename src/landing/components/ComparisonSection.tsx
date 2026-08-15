import { COMPARISON_DATA } from '../data/landingData';
import { SparklesIcon, ZapIcon } from './LandingIcons';

export function ComparisonSection() {
  return (
    <section id="comparison" className="py-24 bg-[#F2ECE3] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-100 border border-orange-300 text-xs font-bold text-orange-950 mb-3 shadow-xs">
            <ZapIcon className="w-4 h-4 text-primary" />
            <span>为什么比传统死记硬背强 10 倍？</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#261C14] tracking-tight mb-4">
            认知科学维度 <span className="text-gradient-primary">深度对比</span>
          </h2>
          <p className="text-base sm:text-lg text-[#615145] leading-relaxed">
            把枯燥的反复读诵升级为心流拉满的主动检索，背得快、记得牢、考场秒提取。
          </p>
        </div>

        {/* Comparison Table / Cards Matrix */}
        <div className="max-w-5xl mx-auto space-y-4">
          {/* Header Row (Desktop) */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-[#8C7A6E]">
            <div className="col-span-3">对比维度</div>
            <div className="col-span-4 text-red-900/80">传统死记硬背 / 纸质默写</div>
            <div className="col-span-5 text-emerald-800">文言文背诵 PWA 渐进闯关</div>
          </div>

          {/* Matrix Rows */}
          {COMPARISON_DATA.map((row, idx) => (
            <div
              key={idx}
              className="glass-card rounded-2xl p-5 md:p-6 border border-[#E0D0C0] bg-white/90 shadow-sm hover:shadow-md transition-all grid grid-cols-1 md:grid-cols-12 gap-4 items-center"
            >
              {/* Dimension Label */}
              <div className="md:col-span-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="font-extrabold text-[#261C14] text-base">
                  {row.dimension}
                </span>
              </div>

              {/* Traditional Approach */}
              <div className="md:col-span-4 p-3.5 rounded-xl bg-red-50/60 border border-red-200/50 text-xs sm:text-sm text-[#7F2D2D] flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  ✕
                </div>
                <p className="leading-relaxed">{row.traditional}</p>
              </div>

              {/* Wenyan Approach */}
              <div className="md:col-span-5 p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-300/70 text-xs sm:text-sm text-emerald-950 font-medium flex items-start gap-2.5 shadow-xs">
                <div className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  ✓
                </div>
                <p className="leading-relaxed font-semibold">{row.wenyan}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Highlight Summary Card */}
        <div className="mt-12 max-w-5xl mx-auto p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-[#FFF9F2] to-[#FFF0E0] border border-orange-200 shadow-md flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
              <SparklesIcon className="w-7 h-7" />
            </div>
            <div>
              <h4 className="text-lg font-black text-[#261C14]">
                “主动提取（Active Recall）”是长期记忆形成的黄金法则
              </h4>
              <p className="text-xs sm:text-sm text-[#665549] mt-1">
                文言文背诵系统让大脑每一次按键都在进行检索练习，记忆牢固度提升 300% 以上。
              </p>
            </div>
          </div>
          <div className="shrink-0 px-4 py-2 rounded-xl bg-white text-primary font-bold text-xs sm:text-sm border border-primary/20 shadow-xs">
            经千名学子亲测验证
          </div>
        </div>
      </div>
    </section>
  );
}
