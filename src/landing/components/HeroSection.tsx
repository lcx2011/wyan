import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  SparklesIcon,
  ZapIcon,
  ArrowRightIcon,
  PlayIcon,
  TrophyIcon,
  CheckCircleIcon,
  FlameIcon,
} from './LandingIcons';
import { STATS_HIGHLIGHTS } from '../data/landingData';

export function HeroSection() {
  const navigate = useNavigate();
  const [typedIndex, setTypedIndex] = useState(0);

  // Simulated live typing demonstration in Hero visual card
  const demoPinyin = ['l', 'x', 'y', 'g', 'w', 'q', 'f', 'q', 's', 'g', 'c', 't', 'y', 's'];
  const demoChars = ['落', '霞', '与', '孤', '鹜', '齐', '飞', '秋', '水', '共', '长', '天', '一', '色'];

  useEffect(() => {
    const timer = setInterval(() => {
      setTypedIndex((prev) => (prev >= demoChars.length ? 0 : prev + 1));
    }, 600);
    return () => clearInterval(timer);
  }, [demoChars.length]);

  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden parchment-bg">
      {/* Classical Oriental Ambient Halos */}
      <div className="ambient-glow-orange -top-20 -left-20" />
      <div className="ambient-glow-teal top-1/3 -right-24" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Core Value Proposition */}
          <div className="lg:col-span-7 flex flex-col items-start text-left">
            {/* Top Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-100/90 border border-orange-300/80 shadow-xs mb-6 backdrop-blur-xs">
              <span className="chinese-seal px-1.5 py-0.2 text-xs">国风新课标</span>
              <span className="text-xs sm:text-sm font-bold text-orange-950 flex items-center gap-1">
                <FlameIcon className="w-4 h-4 text-primary" />
                中小学 & 中高考文言文科学背诵神器
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[#261C14] tracking-tight leading-[1.15] mb-6">
              告别死记硬背
              <br />
              <span className="text-gradient-primary">像玩闯关游戏一样</span>
              <br />
              征服千古名篇
            </h1>

            {/* Sub-headline */}
            <p className="text-lg sm:text-xl text-[#5C4D43] leading-relaxed mb-8 max-w-2xl">
              首创<strong className="text-[#261C14] font-bold">「单卡三连强化」</strong>与
              <strong className="text-[#261C14] font-bold">「双层滚雪球串联」</strong>
              记忆体系。从挖空感知、声母盲打，到全文 Boss 战与即时句对复习，
              让《岳阳楼记》《赤壁赋》《出师表》在指尖流畅流淌。
            </p>

            {/* CTA Buttons */}
            <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-10">
              <button
                onClick={() => navigate('/')}
                className="group px-8 py-4 rounded-2xl bg-gradient-to-r from-primary via-[#FF8A65] to-primary-dark text-white text-base sm:text-lg font-extrabold shadow-soft hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:scale-[1.02] flex items-center justify-center gap-3 cursor-pointer"
              >
                <ZapIcon className="w-5 h-5 text-amber-200" />
                <span>免费进入背诵系统</span>
                <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={() => {
                  const el = document.getElementById('playground');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-7 py-4 rounded-2xl bg-white/90 hover:bg-white text-[#4A3B31] hover:text-primary text-base sm:text-lg font-bold border border-[#E6D7C8] shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <PlayIcon className="w-4 h-4 text-primary" />
                <span>体验 30 秒在线试玩</span>
              </button>
            </div>

            {/* Feature Highlights Pills */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm font-medium text-[#705E53]">
              <div className="flex items-center gap-1.5">
                <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
                <span>拼音首字母盲打判定</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
                <span>全文无提示 Boss 战</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
                <span>独立 SQLite 专属云存档</span>
              </div>
            </div>
          </div>

          {/* Right Column: High-End Live Interactive Visual Showcase */}
          <div className="lg:col-span-5 relative">
            {/* Floating Decorative Badges */}
            <div className="absolute -top-6 -left-6 z-20 hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/95 border border-amber-200/80 shadow-md animate-float-slow">
              <TrophyIcon className="w-5 h-5 text-amber-500" />
              <div className="text-left">
                <div className="text-[11px] font-bold text-amber-900">Boss 战已通关</div>
                <div className="text-[10px] text-[#8C7A6E]">《滕王阁序》0 错误通关</div>
              </div>
            </div>

            <div className="absolute -bottom-6 -right-4 z-20 hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-700/20">
              <SparklesIcon className="w-4 h-4 text-emerald-200" />
              <div className="text-left">
                <div className="text-xs font-bold">艾宾浩斯复习已匹配</div>
                <div className="text-[10px] text-emerald-100">今日待巩固 6 个易错句对</div>
              </div>
            </div>

            {/* Central Simulator Card */}
            <div className="glass-card rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden border border-[#E6D7C8]">
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-[#EEDFCF] pb-4 mb-5">
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-1 text-xs font-extrabold bg-primary/10 text-primary rounded-md">
                    第 1 段 · 卡片 01
                  </span>
                  <span className="text-sm font-bold text-[#2A2018]">《滕王阁序》</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  整卡盲打中 (零错模式)
                </div>
              </div>

              {/* Card Body: Live Typing Simulation */}
              <div className="mb-6">
                <div className="text-xs font-semibold text-[#8C7A6E] mb-3 flex items-center justify-between">
                  <span>输入汉字拼音首字母 (a-z)：</span>
                  <span className="font-mono text-primary font-bold">
                    {typedIndex} / {demoChars.length} 字
                  </span>
                </div>

                {/* Character Slots Grid */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {demoChars.map((char, idx) => {
                    const isPassed = idx < typedIndex;
                    const isCurrent = idx === typedIndex;
                    const pinyinKey = demoPinyin[idx];

                    return (
                      <div
                        key={idx}
                        className={`w-10 h-12 sm:w-11 sm:h-13 rounded-xl border flex flex-col items-center justify-center transition-all duration-200 ${
                          isPassed
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-800 font-bold shadow-xs'
                            : isCurrent
                            ? 'bg-orange-50 border-primary shadow-md scale-105 ring-2 ring-primary/20'
                            : 'bg-[#FAF6F0] border-[#E0D0C0] text-[#B0A090]'
                        }`}
                      >
                        <span className="text-[10px] font-mono text-[#8C7A6E] uppercase">
                          {pinyinKey}
                        </span>
                        <span className="text-base sm:text-lg font-serif font-bold">
                          {isPassed ? char : isCurrent ? '?' : '·'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Translation / Meaning preview */}
                <div className="p-3 rounded-xl bg-[#F5EDE2] border border-[#E8DACB] text-xs text-[#5C4D43] leading-relaxed">
                  <span className="font-bold text-[#2A2018]">译文释义：</span>
                  远方的落霞与孤雁一同展翅高飞，秋天江水与辽阔天空连成一片青色。
                </div>
              </div>

              {/* Card Footer: Progress and status bar */}
              <div className="pt-4 border-t border-[#EEDFCF] flex items-center justify-between text-xs text-[#7A6A5E]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span>实时停顿监测：极佳 (0.28s/字)</span>
                </div>
                <div className="font-bold text-primary">双层滚雪球就绪 →</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Stats Ribbon */}
        <div className="mt-16 sm:mt-20 pt-10 border-t border-[#E8DCCE] grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {STATS_HIGHLIGHTS.map((item, idx) => (
            <div key={idx} className="flex flex-col items-center justify-center p-4">
              <div className="text-3xl sm:text-4xl font-black text-[#261C14] tracking-tight mb-1">
                {item.value}
              </div>
              <div className="text-sm font-bold text-primary mb-0.5">{item.label}</div>
              <div className="text-xs text-[#8C7A6E]">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
