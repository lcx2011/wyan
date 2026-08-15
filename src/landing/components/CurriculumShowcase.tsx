import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CURRICULUM_CATALOG, CurriculumItem } from '../data/landingData';
import {
  BookOpenIcon,
  SearchIcon,
  SparklesIcon,
  ArrowRightIcon,
} from './LandingIcons';

type StageFilter = 'all' | '初中' | '高中';

export function CurriculumShowcase() {
  const navigate = useNavigate();
  const [selectedStage, setSelectedStage] = useState<StageFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredList = useMemo(() => {
    return CURRICULUM_CATALOG.filter((item: CurriculumItem) => {
      const matchStage = selectedStage === 'all' || item.stage === selectedStage;
      const matchQuery =
        !searchQuery ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.featuredQuote.includes(searchQuery) ||
        item.tags.some((t) => t.includes(searchQuery));
      return matchStage && matchQuery;
    });
  }, [selectedStage, searchQuery]);

  return (
    <section id="curriculum" className="py-24 parchment-bg relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-100 border border-orange-300 text-xs font-bold text-orange-950 mb-3 shadow-xs">
            <BookOpenIcon className="w-4 h-4 text-primary" />
            <span>教育部新课标 · 官方题库全覆盖</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#261C14] tracking-tight mb-4">
            中小学必背名篇 <span className="text-gradient-primary">一网打尽</span>
          </h2>
          <p className="text-base sm:text-lg text-[#615145] leading-relaxed">
            涵盖中考 61 篇、高考必背 72 篇及历代散文诗赋。支持在线题库海量检索与自适应智能切块。
          </p>
        </div>

        {/* Filter Controls & Search Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mb-10 max-w-4xl mx-auto">
          {/* Stage Filter Buttons */}
          <div className="flex items-center gap-2 p-1.5 bg-[#EFE6DB] rounded-2xl">
            <button
              onClick={() => setSelectedStage('all')}
              className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                selectedStage === 'all'
                  ? 'bg-[#261C14] text-white shadow-sm'
                  : 'text-[#665549] hover:text-[#261C14]'
              }`}
            >
              全部课标 ({CURRICULUM_CATALOG.length})
            </button>
            <button
              onClick={() => setSelectedStage('初中')}
              className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                selectedStage === '初中'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-[#665549] hover:text-[#261C14]'
              }`}
            >
              初中必背 (中考核心)
            </button>
            <button
              onClick={() => setSelectedStage('高中')}
              className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                selectedStage === '高中'
                  ? 'bg-teal-700 text-white shadow-sm'
                  : 'text-[#665549] hover:text-[#261C14]'
              }`}
            >
              高中必背 (高考 72 篇)
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="w-5 h-5 text-[#8C7A6E] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索篇名、作者或名句 (如 岳阳楼记 / 诸葛亮 / 忧而忧)..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-[#DECFC0] focus:border-primary focus:ring-2 focus:ring-primary/20 text-sm text-[#261C14] placeholder-[#A09083] outline-none shadow-xs transition-all"
            />
          </div>
        </div>

        {/* Catalog Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredList.map((item) => (
            <div
              key={item.id}
              onClick={() => navigate('/')}
              className="glass-card rounded-3xl p-6 sm:p-7 border border-[#DECFC0] hover:border-primary/40 bg-white/85 hover:bg-white transition-all duration-300 flex flex-col justify-between group cursor-pointer"
            >
              <div>
                {/* Header: Stage Badge + Dynasty/Author */}
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`px-2.5 py-0.5 rounded-md text-xs font-extrabold ${
                      item.stage === '高中'
                        ? 'bg-teal-100 text-teal-900 border border-teal-200'
                        : 'bg-orange-100 text-orange-950 border border-orange-200'
                    }`}
                  >
                    {item.stage} · {item.grade}
                  </span>
                  <span className="text-xs font-serif font-bold text-[#8C7A6E]">
                    {item.dynasty} · {item.author}
                  </span>
                </div>

                {/* Title & Length */}
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-xl font-black text-[#261C14] group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  <span className="text-xs font-mono text-[#8C7A6E]">
                    约 {item.charCount} 字
                  </span>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {item.tags.map((t, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded bg-[#F4ECE2] text-[#6E5D52] text-[11px] font-medium"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                {/* Featured Golden Quote */}
                <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#EDE0D2] mb-4">
                  <div className="text-[10px] font-bold text-amber-800 mb-1 flex items-center gap-1">
                    <SparklesIcon className="w-3 h-3 text-amber-600" />
                    <span>核心金句</span>
                  </div>
                  <p className="text-xs sm:text-sm font-serif text-[#3E2F23] italic leading-relaxed">
                    “{item.featuredQuote}”
                  </p>
                </div>
              </div>

              {/* Card Footer: Difficulty & Start CTA */}
              <div className="pt-4 border-t border-[#EFE5DA] flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-[#7A6A5E]">
                  <span>难度：</span>
                  <span className="text-amber-500 font-mono tracking-widest">
                    {item.difficulty}
                  </span>
                </div>
                <div className="text-xs font-bold text-primary flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                  <span>开始背诵</span>
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty Search Result */}
        {filteredList.length === 0 && (
          <div className="text-center py-16 bg-white/60 rounded-3xl border border-[#DECFC0] max-w-lg mx-auto">
            <p className="text-sm font-bold text-[#6E5D52] mb-3">
              未找到包含 “{searchQuery}” 的篇目
            </p>
            <p className="text-xs text-[#9E8E82] mb-4">
              文言文背诵系统内置百万级在线题库，登录后可直接输入任意关键词实时拉取！
            </p>
            <button
              onClick={() => setSearchQuery('')}
              className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold"
            >
              清除搜索词
            </button>
          </div>
        )}

        {/* Bottom Callout */}
        <div className="mt-14 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#2A2018] to-[#3D2E24] text-white flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <BookOpenIcon className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-lg font-bold">没有找到你的课本篇目？</h4>
              <p className="text-xs sm:text-sm text-[#D5C5B5] mt-0.5">
                系统内置强大诗词文言在线搜索引擎，输入标题即可智能标准化并生成闯关卡片！
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate('/')}
            className="shrink-0 px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-primary-light text-white font-extrabold text-sm shadow-md hover:scale-105 transition-all cursor-pointer flex items-center gap-2"
          >
            <span>在线搜索添加新篇目</span>
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
