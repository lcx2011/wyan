import { useState } from 'react';
import { METHODOLOGY_STEPS } from '../data/landingData';
import {
  SparklesIcon,
  CheckCircleIcon,
  LayersIcon,
  TrophyIcon,
  BrainIcon,
  ZapIcon,
} from './LandingIcons';

export function MethodologySection() {
  const [activeStep, setActiveStep] = useState(0);

  const getStepIcon = (index: number) => {
    switch (index) {
      case 0:
        return <ZapIcon className="w-6 h-6" />;
      case 1:
        return <LayersIcon className="w-6 h-6" />;
      case 2:
        return <TrophyIcon className="w-6 h-6" />;
      case 3:
        return <BrainIcon className="w-6 h-6" />;
      default:
        return <SparklesIcon className="w-6 h-6" />;
    }
  };

  return (
    <section id="methodology" className="py-24 parchment-bg relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-100/90 border border-orange-300 text-xs font-bold text-orange-900 mb-3 shadow-xs">
            <BrainIcon className="w-4 h-4 text-primary" />
            <span>认知心理学 · 检索练习理论</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#261C14] tracking-tight mb-4">
            四大科学记忆引擎，构建 <span className="text-gradient-primary">坚不可摧</span> 的背诵闭环
          </h2>
          <p className="text-base sm:text-lg text-[#615145] leading-relaxed">
            从卡片级肌肉记忆到整篇宏观统摄，层层赋能，彻底击碎“记不住、背串行、忘得快”三大痛点。
          </p>
        </div>

        {/* 4 Pillars Grid / Interactive Tabs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {METHODOLOGY_STEPS.map((step, idx) => {
            const isSelected = activeStep === idx;
            return (
              <div
                key={step.step}
                onClick={() => setActiveStep(idx)}
                className={`cursor-pointer rounded-3xl p-6 sm:p-7 transition-all duration-300 relative flex flex-col justify-between ${
                  isSelected
                    ? 'glass-card border-primary/50 shadow-xl ring-2 ring-primary/20 scale-[1.02] bg-white'
                    : 'glass-card hover:border-[#D5C5B5] bg-white/70 hover:bg-white'
                }`}
              >
                <div>
                  {/* Top Step Number & Tag */}
                  <div className="flex items-center justify-between mb-5">
                    <span className="font-mono text-3xl font-black text-[#BFAFA0]">
                      {step.step}
                    </span>
                    <span
                      className="px-2.5 py-1 text-xs font-bold rounded-lg"
                      style={{
                        backgroundColor: `${step.color}15`,
                        color: step.color,
                      }}
                    >
                      {step.tag}
                    </span>
                  </div>

                  {/* Icon & Title */}
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 text-white shadow-md"
                    style={{ backgroundColor: step.color }}
                  >
                    {getStepIcon(idx)}
                  </div>

                  <h3 className="text-xl font-extrabold text-[#261C14] mb-1">
                    {step.title}
                  </h3>
                  <div className="text-xs font-semibold text-primary mb-3">
                    {step.subtitle}
                  </div>

                  <p className="text-xs sm:text-sm text-[#665549] leading-relaxed mb-4 line-clamp-3">
                    {step.description}
                  </p>
                </div>

                {/* Feature bullets preview */}
                <div className="pt-4 border-t border-[#EFE5DA] space-y-1.5">
                  {step.features.slice(0, 2).map((feat, fIdx) => (
                    <div key={fIdx} className="flex items-center gap-1.5 text-xs text-[#52443B]">
                      <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Deep Dive Showcase Card for Active Step */}
        <div className="glass-card rounded-3xl p-8 sm:p-12 border border-[#E0D0C0] shadow-xl bg-white/95">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Content */}
            <div className="lg:col-span-7">
              <div className="flex items-center gap-3 mb-3">
                <span className="chinese-seal px-2 py-0.5 text-xs">
                  引擎 {METHODOLOGY_STEPS[activeStep].step}
                </span>
                <span className="text-sm font-bold text-primary">
                  {METHODOLOGY_STEPS[activeStep].badge}
                </span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-[#261C14] mb-3">
                {METHODOLOGY_STEPS[activeStep].title}：{METHODOLOGY_STEPS[activeStep].subtitle}
              </h3>
              <p className="text-base text-[#5C4D43] leading-relaxed mb-6">
                {METHODOLOGY_STEPS[activeStep].description}
              </p>

              {/* All Features of this step */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {METHODOLOGY_STEPS[activeStep].features.map((feat, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E8DACB] flex items-center gap-2.5 text-sm font-semibold text-[#3E2F23]"
                  >
                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs shrink-0">
                      ✓
                    </div>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Visual Diagram / Flow */}
            <div className="lg:col-span-5 p-6 rounded-2xl bg-[#F7F0E6] border border-[#DECFC0]">
              <div className="text-xs font-bold text-[#8C7A6E] mb-4 text-center">
                —— 执行流程链路可视化 ——
              </div>

              {activeStep === 0 && (
                <div className="space-y-3 font-sans">
                  <div className="p-3 rounded-xl bg-white border border-[#E5D7C9] flex items-center justify-between shadow-xs">
                    <span className="text-xs font-bold text-primary">① 挖空感知</span>
                    <span className="text-xs text-[#665549]">识别主干词与韵脚结构</span>
                  </div>
                  <div className="text-center text-primary text-xs font-bold">↓ 进阶</div>
                  <div className="p-3 rounded-xl bg-white border border-[#E5D7C9] flex items-center justify-between shadow-xs">
                    <span className="text-xs font-bold text-amber-600">② 首字激活</span>
                    <span className="text-xs text-[#665549]">以声母线索诱发主动提取</span>
                  </div>
                  <div className="text-center text-primary text-xs font-bold">↓ 达成</div>
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 flex items-center justify-between shadow-xs">
                    <span className="text-xs font-bold text-emerald-800">③ 盲打零错</span>
                    <span className="text-xs text-emerald-700 font-bold">100% 肌肉记忆形成</span>
                  </div>
                </div>
              )}

              {activeStep === 1 && (
                <div className="space-y-3 font-sans">
                  <div className="p-3 rounded-xl bg-white border border-[#E5D7C9] flex items-center justify-between shadow-xs">
                    <span className="text-xs font-bold text-teal-700">两卡接力滚</span>
                    <span className="text-xs text-[#665549]">卡1 + 卡2 紧密拼接盲打</span>
                  </div>
                  <div className="text-center text-teal-600 text-xs font-bold">↓ 串联拓展</div>
                  <div className="p-3 rounded-xl bg-white border border-[#E5D7C9] flex items-center justify-between shadow-xs">
                    <span className="text-xs font-bold text-teal-700">后续接续滚</span>
                    <span className="text-xs text-[#665549]">卡2 + 卡3、卡3 + 卡4 ...</span>
                  </div>
                  <div className="text-center text-teal-600 text-xs font-bold">↓ 段落大合流</div>
                  <div className="p-3 rounded-xl bg-teal-50 border border-teal-300 flex items-center justify-between shadow-xs">
                    <span className="text-xs font-bold text-teal-900">整段成篇大滚</span>
                    <span className="text-xs text-teal-800 font-bold">段落上下文绝对连贯</span>
                  </div>
                </div>
              )}

              {activeStep === 2 && (
                <div className="space-y-3 font-sans">
                  <div className="p-3 rounded-xl bg-white border border-[#E5D7C9] flex items-center justify-between shadow-xs">
                    <span className="text-xs font-bold text-amber-700">全篇计时盲打</span>
                    <span className="text-xs text-[#665549]">完全无提示沉浸式输出</span>
                  </div>
                  <div className="text-center text-amber-600 text-xs font-bold">↓ 数据捕获</div>
                  <div className="p-3 rounded-xl bg-white border border-[#E5D7C9] flex items-center justify-between shadow-xs">
                    <span className="text-xs font-bold text-amber-700">卡顿停顿定位</span>
                    <span className="text-xs text-[#665549]">毫秒级记录犹豫分句</span>
                  </div>
                  <div className="text-center text-amber-600 text-xs font-bold">↓ 诊断出炉</div>
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-between shadow-xs">
                    <span className="text-xs font-bold text-amber-900">生成荣誉通关报告</span>
                    <span className="text-xs text-amber-800 font-bold">用时/易错字/流利度徽章</span>
                  </div>
                </div>
              )}

              {activeStep === 3 && (
                <div className="space-y-3 font-sans">
                  <div className="p-3 rounded-xl bg-white border border-[#E5D7C9] flex items-center justify-between shadow-xs">
                    <span className="text-xs font-bold text-purple-700">前句提示检测</span>
                    <span className="text-xs text-[#665549]">给出上句，盲打接出下句</span>
                  </div>
                  <div className="text-center text-purple-600 text-xs font-bold">↓ 错题捕获</div>
                  <div className="p-3 rounded-xl bg-white border border-[#E5D7C9] flex items-center justify-between shadow-xs">
                    <span className="text-xs font-bold text-purple-700">隔题智能回插</span>
                    <span className="text-xs text-[#665549]">答错题目短间隔再次考察</span>
                  </div>
                  <div className="text-center text-purple-600 text-xs font-bold">↓ 永久记忆</div>
                  <div className="p-3 rounded-xl bg-purple-50 border border-purple-300 flex items-center justify-between shadow-xs">
                    <span className="text-xs font-bold text-purple-900">连过两次移出池</span>
                    <span className="text-xs text-purple-800 font-bold">直达考场秒速提取</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
