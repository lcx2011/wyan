import { useNavigate } from 'react-router-dom';
import { BookOpenIcon, SparklesIcon, ChevronDownIcon } from './LandingIcons';

export function LandingFooter() {
  const navigate = useNavigate();

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="dark-ink-bg text-[#A8988C] pt-16 pb-12 border-t border-white/10 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-white/10">
          {/* Col 1: Brand & Bio */}
          <div className="md:col-span-5 flex flex-col items-start">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-md">
                <BookOpenIcon className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black text-white">文言文背诵</span>
                <span className="chinese-seal px-1.5 py-0.2 text-[10px] text-amber-300 border-amber-300">
                  PWA 官版
                </span>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-stone-400 leading-relaxed mb-4 max-w-sm">
              面向中小学生的渐进式文言文背诵闯关应用。基于检索练习与艾宾浩斯遗忘曲线，通过单卡三连、双层滚雪球与全文
              Boss 战，让背诵形成可持续的闯关闭环。
            </p>
            <div className="flex items-center gap-2 text-xs text-amber-400/90 font-medium">
              <SparklesIcon className="w-4 h-4 text-amber-400" />
              <span>部编版中小学语文新课标全收录 · 纯净无广告</span>
            </div>
          </div>

          {/* Col 2: Navigation Links */}
          <div className="md:col-span-2">
            <div className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              快速导航
            </div>
            <ul className="space-y-2.5 text-xs text-stone-300">
              <li>
                <a href="#features" className="hover:text-primary transition-colors">
                  核心亮点
                </a>
              </li>
              <li>
                <a href="#methodology" className="hover:text-primary transition-colors">
                  科学记忆法
                </a>
              </li>
              <li>
                <a href="#playground" className="hover:text-primary transition-colors">
                  在线试玩
                </a>
              </li>
              <li>
                <a href="#curriculum" className="hover:text-primary transition-colors">
                  课标题库
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Product Matrix */}
          <div className="md:col-span-2">
            <div className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              应用入口
            </div>
            <ul className="space-y-2.5 text-xs text-stone-300">
              <li>
                <button
                  onClick={() => navigate('/')}
                  className="hover:text-primary transition-colors cursor-pointer text-left"
                >
                  进入背诵应用
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('/login')}
                  className="hover:text-primary transition-colors cursor-pointer text-left"
                >
                  账号登录 / 注册
                </button>
              </li>
              <li>
                <a href="#pwa" className="hover:text-primary transition-colors">
                  PWA 桌面添加到主屏幕
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-primary transition-colors">
                  常见问题解答
                </a>
              </li>
            </ul>
          </div>

          {/* Col 4: Platform & Architecture */}
          <div className="md:col-span-3">
            <div className="text-xs font-bold text-white uppercase tracking-wider mb-4">
              技术规格与保障
            </div>
            <div className="space-y-2 text-xs text-stone-400">
              <div>• 架构：PWA + React 18 + Fastify + SQLite 独立存档</div>
              <div>• 平台支持：iOS Safari / Chrome / Android / PC Web</div>
              <div>• 判定引擎：声母拼音即时多音字映射算法</div>
              <div>• 隐私安全：独立数据库隔离，无追踪</div>
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-300">
          <div>
            © {new Date().getFullYear()} 文言文背诵 (Wenyan Beisong). 保留所有权利.
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={scrollToTop}
              className="flex items-center gap-1.5 text-stone-300 hover:text-white transition-colors cursor-pointer"
            >
              <span>返回顶部</span>
              <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center rotate-180">
                <ChevronDownIcon className="w-3.5 h-3.5" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
