import { useNavigate } from 'react-router-dom';
import {
  TrophyIcon,
  SparklesIcon,
  FlameIcon,
  CheckCircleIcon,
  ArrowRightIcon,
} from './LandingIcons';

export function ExamReportMockup() {
  const navigate = useNavigate();

  return (
    <section className="py-20 bg-[#F4ECE2] relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Title */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-100 border border-amber-300 text-xs font-bold text-amber-900 mb-3 shadow-xs">
            <TrophyIcon className="w-4 h-4 text-amber-600" />
            <span>深度学情诊断体系</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#261C14] tracking-tight mb-4">
            全文 Boss 战与 <span className="text-gradient-gold">专属通关报告</span>
          </h2>
          <p className="text-base sm:text-lg text-[#665549] leading-relaxed">
            全篇脱稿盲打完成后，系统毫秒级定位易错字与卡顿句，输出雷达式诊断分析，让弱点无所遁形。
          </p>
        </div>

        {/* Mockup Container */}
        <div className="max-w-4xl mx-auto glass-card rounded-3xl p-6 sm:p-10 border border-[#DAC8B8] shadow-2xl bg-white/95">
          {/* Header Badge */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#EBDCCF]">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-white flex items-center justify-center shadow-md">
                <TrophyIcon className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-extrabold text-[#261C14]">
                    《岳阳楼记》全文 Boss 战通关报告
                  </h3>
                  <span className="chinese-seal px-1.5 py-0.2 text-xs">零错通关</span>
                </div>
                <div className="text-xs text-[#8C7A6E]">
                  用时评级：<strong className="text-emerald-700 font-bold">极速 S 级</strong> ·
                  流利度：99.2%
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-extrabold flex items-center gap-1.5">
                <SparklesIcon className="w-4 h-4 text-amber-600" />
                解锁「先忧后乐」荣耀勋章
              </span>
            </div>
          </div>

          {/* Stats Metrics 4-col */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-8">
            <div className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#EBE0D5] text-center">
              <div className="text-xs text-[#8C7A6E] mb-1 font-medium">总输入字数</div>
              <div className="text-2xl font-black text-[#261C14]">368 字</div>
              <div className="text-[11px] text-emerald-700 font-bold mt-0.5">无一遗漏</div>
            </div>
            <div className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#EBE0D5] text-center">
              <div className="text-xs text-[#8C7A6E] mb-1 font-medium">挑战总用时</div>
              <div className="text-2xl font-black text-[#261C14]">1分42秒</div>
              <div className="text-[11px] text-emerald-700 font-bold mt-0.5">平均 0.27s/字</div>
            </div>
            <div className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#EBE0D5] text-center">
              <div className="text-xs text-[#8C7A6E] mb-1 font-medium">易错字命中</div>
              <div className="text-2xl font-black text-emerald-700">0 处</div>
              <div className="text-[11px] text-emerald-700 font-bold mt-0.5">首战完美无错</div>
            </div>
            <div className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#EBE0D5] text-center">
              <div className="text-xs text-[#8C7A6E] mb-1 font-medium">卡顿停顿(&gt;1.5s)</div>
              <div className="text-2xl font-black text-amber-700">1 处</div>
              <div className="text-[11px] text-amber-800 font-bold mt-0.5">已自动编入复习池</div>
            </div>
          </div>

          {/* Heatmap / Pause Analysis Card */}
          <div className="p-5 rounded-2xl bg-[#F8F2E9] border border-[#E4D5C5] mb-6">
            <div className="flex items-center justify-between mb-3 text-xs font-bold text-[#5C4D43]">
              <div className="flex items-center gap-1.5">
                <FlameIcon className="w-4 h-4 text-primary" />
                <span>全文背诵脉络 & 停顿卡顿热力诊断</span>
              </div>
              <span className="text-amber-800">黄色高亮：输入停顿点</span>
            </div>

            <div className="space-y-2 text-sm leading-relaxed text-[#3E2F23] font-serif">
              <p>
                庆历四年春，滕子京谪守巴陵郡。越明年，政通人和，百废俱兴，乃重修岳阳楼，增其旧制，刻唐贤今人诗赋于其上。
              </p>
              <p>
                予观夫巴陵胜状，在洞庭一湖。衔远山，吞长江，浩浩汤汤，横无际涯，朝晖夕阴，气象万千。
                <mark className="bg-amber-200/90 text-amber-950 px-1 py-0.5 rounded font-bold">
                  此则岳阳楼之大观也（停顿 1.8s）
                </mark>
                ，前人之述备矣。
              </p>
              <p>
                至若春和景明，波澜不惊，上下天光，一碧万顷；沙鸥翔集，锦鳞游泳；岸芷汀兰，郁郁青青。
                ... 居庙堂之高则忧其民，处江湖之远则忧其君。先天下之忧而忧，后天下之乐而乐。
              </p>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[#EBDCCF]">
            <div className="text-xs text-[#7A6A5E] flex items-center gap-1.5">
              <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
              <span>本篇通关记录已持久化保存至专属 SQLite 存档</span>
            </div>
            <button
              onClick={() => navigate('/')}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-primary-dark text-white font-extrabold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>立即挑战你的第一篇 Boss 战</span>
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
