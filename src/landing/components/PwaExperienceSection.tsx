import {
  SmartphoneIcon,
  LaptopIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
} from './LandingIcons';

export function PwaExperienceSection() {
  const pwaSteps = [
    {
      step: '1',
      title: 'Safari 浏览器打开',
      desc: '在 iPhone 或 iPad 的 Safari 浏览器中访问应用地址。',
    },
    {
      step: '2',
      title: '点击底部「分享」',
      desc: '点击浏览器底部导航栏中间的“分享”图标（方框带向上箭头）。',
    },
    {
      step: '3',
      title: '选择「添加到主屏幕」',
      desc: '在弹出菜单中点击“添加到主屏幕”，即可生成专属 App 图标！',
    },
  ];

  return (
    <section id="pwa" className="py-24 dark-ink-bg text-white relative overflow-hidden">
      {/* Background Halos */}
      <div className="ambient-glow-orange top-0 right-0 opacity-20" />
      <div className="ambient-glow-teal bottom-0 left-0 opacity-20" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-bold text-amber-300 mb-3 shadow-xs">
            <SmartphoneIcon className="w-4 h-4" />
            <span>现代 PWA 渐进式技术架构</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight mb-4">
            多端设备自由无界 <br />
            <span className="text-gradient-primary">随时随地，即刻背诵</span>
          </h2>
          <p className="text-base sm:text-lg text-stone-300 leading-relaxed">
            无论是在手机、iPad 平板还是电脑桌面，都能享受极速秒开、免下载安装的沉浸背诵体验。
          </p>
        </div>

        {/* 3 Main Device Pillar Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {/* Card 1: Mobile PWA */}
          <div className="glass-card-dark rounded-3xl p-7 border border-white/10 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-orange-500/20 border border-orange-400/30 flex items-center justify-center text-primary mb-5">
                <SmartphoneIcon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-white mb-2">手机端 PWA 沉浸模式</h3>
              <p className="text-xs sm:text-sm text-stone-300 leading-relaxed mb-4">
                支持 iOS Safari 与各类安卓浏览器一键添加到桌面。全屏运行、隐藏浏览器地址栏，宛如原生应用。
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-white/10 text-xs text-stone-300">
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                <span>触控震动触感反馈 (支持机型)</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                <span>原生软键盘极速声母响应</span>
              </div>
            </div>
          </div>

          {/* Card 2: PC Desktop */}
          <div className="glass-card-dark rounded-3xl p-7 border border-white/10 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-400 mb-5">
                <LaptopIcon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-white mb-2">电脑端 键盘极速盲打</h3>
              <p className="text-xs sm:text-sm text-stone-300 leading-relaxed mb-4">
                在电脑浏览器上打开，直接利用物理机械键盘进行极速盲打，手脑同频，挑战极限流利度评分。
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-white/10 text-xs text-stone-300">
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                <span>全键盘物理盲打精准判定</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                <span>宽屏双栏舒适排版与注解</span>
              </div>
            </div>
          </div>

          {/* Card 3: Cloud SQLite Archive */}
          <div className="glass-card-dark rounded-3xl p-7 border border-white/10 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-400 mb-5">
                <ShieldCheckIcon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-white mb-2">独立 SQLite 云端存档</h3>
              <p className="text-xs sm:text-sm text-stone-300 leading-relaxed mb-4">
                每个账号拥有专属 SQLite 独立数据库。换设备、刷新浏览器无需重新开始，学习成果永久安存。
              </p>
            </div>
            <div className="space-y-2 pt-4 border-t border-white/10 text-xs text-stone-300">
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                <span>多端实时进度安全同步</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                <span>断网拦截提示，绝不丢失数据</span>
              </div>
            </div>
          </div>
        </div>

        {/* iOS Safari Installation Mini Guide */}
        <div className="max-w-4xl mx-auto rounded-3xl p-6 sm:p-8 bg-white/5 border border-white/10 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-6">
            <span className="chinese-seal px-2 py-0.5 text-xs text-amber-300 border-amber-300">
              安装指引
            </span>
            <h4 className="text-lg font-bold text-white">
              iPhone / iPad 一键添加到主屏幕（3 步完成）
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pwaSteps.map((item) => (
              <div key={item.step} className="flex flex-col items-start">
                <div className="w-8 h-8 rounded-full bg-primary text-white font-black text-sm flex items-center justify-center mb-2 shadow-md">
                  {item.step}
                </div>
                <div className="text-sm font-bold text-amber-200 mb-1">{item.title}</div>
                <div className="text-xs text-stone-300 leading-relaxed">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
