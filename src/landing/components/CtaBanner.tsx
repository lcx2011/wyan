import { useNavigate } from 'react-router-dom';
import { ZapIcon, ArrowRightIcon, TrophyIcon } from './LandingIcons';

export function CtaBanner() {
  const navigate = useNavigate();

  return (
    <section className="py-20 parchment-bg relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="relative rounded-3xl overflow-hidden p-8 sm:p-14 bg-gradient-to-br from-[#261C14] via-[#35271D] to-[#1F1710] text-white shadow-2xl border border-amber-900/40">
          {/* Ambient Glows Inside Banner */}
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-teal-500/20 blur-3xl pointer-events-none" />

          <div className="relative z-10 text-center max-w-3xl mx-auto flex flex-col items-center">
            {/* Stamp Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-bold text-amber-300 mb-6 backdrop-blur-xs">
              <TrophyIcon className="w-4 h-4 text-amber-400" />
              <span>今日启程 · 攻克你的第一篇文言名作</span>
            </div>

            {/* Main Headline */}
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight mb-6">
              准备好在指尖
              <br />
              <span className="text-gradient-primary">点亮千古文脉</span>
              了吗？
            </h2>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-stone-300 leading-relaxed mb-8 max-w-xl">
              立即进入系统，开启智能卡片三连与双层滚雪球。零死角攻克中高考必背古诗文，让背诵充满成就感！
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
              <button
                onClick={() => navigate('/')}
                className="w-full sm:w-auto px-9 py-4 rounded-2xl bg-gradient-to-r from-primary via-[#FF8A65] to-primary-dark text-white font-black text-base sm:text-lg shadow-lg hover:shadow-primary/40 hover:scale-105 transition-all flex items-center justify-center gap-3 cursor-pointer"
              >
                <ZapIcon className="w-5 h-5 text-amber-200" />
                <span>免费进入应用 · 开始背诵</span>
                <ArrowRightIcon className="w-5 h-5" />
              </button>

              <button
                onClick={() => navigate('/login')}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-base border border-white/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>登录已有存档</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
