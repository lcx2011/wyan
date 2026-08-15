import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PLAYGROUND_PRESETS,
  PlaygroundVerse,
} from '../data/landingData';
import {
  SparklesIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  KeyboardIcon,
  ZapIcon,
  ArrowRightIcon,
  TrophyIcon,
} from './LandingIcons';

type TrainingMode = 'blank' | 'initial' | 'blind';

export function InteractivePlayground() {
  const navigate = useNavigate();
  const [selectedVerseIndex, setSelectedVerseIndex] = useState(0);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [mode, setMode] = useState<TrainingMode>('blind');
  const [cursor, setCursor] = useState(0);
  const [errorIndex, setErrorIndex] = useState<number | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentVerse: PlaygroundVerse = PLAYGROUND_PRESETS[selectedVerseIndex];
  const currentSentence = currentVerse.sentences[sentenceIndex];
  const targetPinyinList = currentSentence.pinyin;
  const targetChars = currentSentence.chars;

  // Reset state when verse or sentence changes
  const resetSentence = useCallback(() => {
    setCursor(0);
    setErrorIndex(null);
    setIsCompleted(false);
  }, []);

  useEffect(() => {
    resetSentence();
  }, [selectedVerseIndex, sentenceIndex, mode, resetSentence]);

  // Handle character input (from physical keyboard or virtual keyboard buttons)
  const handleInput = useCallback(
    (inputLetter: string) => {
      if (isCompleted || cursor >= targetPinyinList.length) return;

      const letter = inputLetter.toLowerCase();
      const expectedLetter = targetPinyinList[cursor];

      if (letter === expectedLetter) {
        // Correct hit!
        const nextCursor = cursor + 1;
        setCursor(nextCursor);
        setErrorIndex(null);

        if (nextCursor >= targetPinyinList.length) {
          setIsCompleted(true);
        }
      } else {
        // Mistake hit!
        setErrorIndex(cursor);
        setTimeout(() => setErrorIndex(null), 500);
      }
    },
    [cursor, isCompleted, targetPinyinList]
  );

  // Listen to physical keyboard events when focused
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier keys or non-letter keys
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[a-zA-Z]$/.test(e.key)) {
        handleInput(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleInput]);

  // Next sentence in preset
  const handleNextSentence = () => {
    if (sentenceIndex < currentVerse.sentences.length - 1) {
      setSentenceIndex(sentenceIndex + 1);
    } else {
      setSentenceIndex(0);
    }
    resetSentence();
  };

  // Virtual keyboard letters for quick mobile / click trial
  const quickLetters = ['s', 'b', 'z', 'g', 'y', 'x', 'm', 'l', 'd', 't', 'h', 'q', 'r', 'c', 'w'];

  return (
    <section id="playground" className="py-24 bg-[#F5EFE6] relative overflow-hidden">
      {/* Background Ambience */}
      <div className="ambient-glow-orange top-10 right-10 opacity-70" />
      <div className="ambient-glow-teal bottom-10 left-10 opacity-60" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-100 border border-orange-300 text-xs font-extrabold text-orange-950 mb-3 shadow-xs">
            <SparklesIcon className="w-4 h-4 text-primary" />
            <span>免登录 · 在线 30 秒上手体验</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-[#261C14] tracking-tight mb-4">
            亲自体验 <span className="text-gradient-primary">拼音首字母背诵</span> 的魔力
          </h2>
          <p className="text-base sm:text-lg text-[#665549] leading-relaxed">
            敲击键盘输入每个汉字的声母，亲身感受无痛唤醒大脑记忆的酣畅流利。
          </p>
        </div>

        {/* Simulator Container */}
        <div
          ref={containerRef}
          className="glass-card rounded-3xl p-6 sm:p-10 shadow-xl border border-[#DECFC0] bg-white/90"
        >
          {/* Top Controls: Verse Selector + Mode Selector */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pb-6 border-b border-[#EBDCCF]">
            {/* Verse Selector Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <span className="text-xs font-bold text-[#8C7A6E] mr-1 hidden sm:inline">
                篇目体验：
              </span>
              {PLAYGROUND_PRESETS.map((verse, idx) => (
                <button
                  key={verse.id}
                  onClick={() => {
                    setSelectedVerseIndex(idx);
                    setSentenceIndex(0);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer ${
                    selectedVerseIndex === idx
                      ? 'bg-[#261C14] text-white shadow-md'
                      : 'bg-[#EFE7DC] text-[#5C4D43] hover:bg-[#E5DBCF]'
                  }`}
                >
                  {verse.title} · {verse.author}
                </button>
              ))}
            </div>

            {/* Mode Selector Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-[#EFE7DC] rounded-xl self-start md:self-auto">
              <button
                onClick={() => setMode('blank')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  mode === 'blank'
                    ? 'bg-white text-primary shadow-xs'
                    : 'text-[#6B5A4E] hover:text-[#261C14]'
                }`}
              >
                1. 挖空提示
              </button>
              <button
                onClick={() => setMode('initial')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  mode === 'initial'
                    ? 'bg-white text-primary shadow-xs'
                    : 'text-[#6B5A4E] hover:text-[#261C14]'
                }`}
              >
                2. 首字提示
              </button>
              <button
                onClick={() => setMode('blind')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  mode === 'blind'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-[#6B5A4E] hover:text-[#261C14]'
                }`}
              >
                3. 纯盲打闯关
              </button>
            </div>
          </div>

          {/* Training Stage Indicator */}
          <div className="py-4 flex items-center justify-between text-xs text-[#8C7A6E]">
            <div className="flex items-center gap-2 font-medium">
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">
                第 {sentenceIndex + 1} / {currentVerse.sentences.length} 句
              </span>
              <span>{currentVerse.dynasty} · {currentVerse.author}</span>
            </div>
            <button
              onClick={resetSentence}
              className="flex items-center gap-1 text-primary hover:underline font-bold cursor-pointer"
            >
              <RefreshCwIcon className="w-3.5 h-3.5" />
              <span>重置本句</span>
            </button>
          </div>

          {/* Interactive Characters Grid */}
          <div className="py-8 sm:py-12 flex flex-col items-center justify-center">
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 max-w-2xl mb-8">
              {targetChars.map((char, idx) => {
                const isPassed = idx < cursor;
                const isCurrent = idx === cursor && !isCompleted;
                const isError = errorIndex === idx;
                const pinyin = targetPinyinList[idx];

                // Hint logic according to mode
                let displayChar = '·';
                let displayPinyin = pinyin;

                if (mode === 'blank') {
                  // In blank mode, show first & last char or vowels
                  displayChar = idx % 2 === 0 ? char : isPassed ? char : ' ';
                  displayPinyin = isPassed ? pinyin : '?';
                } else if (mode === 'initial') {
                  // Show pinyin hint above
                  displayChar = isPassed ? char : isCurrent ? '?' : ' ';
                  displayPinyin = pinyin;
                } else {
                  // Blind mode
                  displayChar = isPassed ? char : isCurrent ? '?' : ' ';
                  displayPinyin = isPassed ? pinyin : '*';
                }

                return (
                  <div
                    key={idx}
                    className={`w-14 h-18 sm:w-16 sm:h-22 rounded-2xl border-2 flex flex-col items-center justify-center transition-all duration-200 ${
                      isPassed
                        ? 'bg-emerald-50/90 border-emerald-500 text-emerald-900 shadow-sm scale-100'
                        : isCurrent
                        ? isError
                          ? 'bg-red-50 border-red-500 text-red-700 shadow-md ring-4 ring-red-200 animate-shake'
                          : 'bg-orange-50 border-primary text-primary shadow-lg ring-4 ring-primary/20 scale-105'
                        : 'bg-[#FAF6F0] border-[#E0D0C0] text-[#B0A090]'
                    }`}
                  >
                    <span className="text-[11px] sm:text-xs font-mono font-bold uppercase tracking-wider mb-1">
                      {isPassed ? pinyin : isCurrent ? pinyin : displayPinyin}
                    </span>
                    <span className="text-xl sm:text-2xl font-serif font-extrabold">
                      {isPassed ? char : isCurrent ? '?' : displayChar}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Hint & Status Prompt */}
            {!isCompleted ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-2 text-sm text-[#5C4D43]">
                  <KeyboardIcon className="w-4 h-4 text-primary animate-pulse" />
                  <span>
                    请在键盘上敲击当前字符的声母：
                    <strong className="text-primary text-base font-mono mx-1 uppercase">
                      [{targetPinyinList[cursor]}]
                    </strong>
                    （对应汉字：{targetChars[cursor]}）
                  </span>
                </div>
                <div className="text-xs text-[#8C7A6E]">
                  支持物理键盘直接按键，或点击下方字母按键测试
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 animate-fade-in">
                <div className="flex items-center gap-2 text-emerald-700 font-extrabold text-lg">
                  <CheckCircleIcon className="w-6 h-6 text-emerald-600" />
                  <span>恭喜！本句零错误盲打通关！</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleNextSentence}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <span>下一句挑战</span>
                    <ArrowRightIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => navigate('/')}
                    className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <span>进入系统完整背诵</span>
                    <ZapIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Virtual Letter Buttons (Great for Mobile & Quick Click Trial) */}
            <div className="mt-8 pt-6 border-t border-[#EBDCCF] w-full max-w-2xl flex flex-col items-center">
              <div className="text-xs font-bold text-[#8C7A6E] mb-3">
                快捷字母键盘（点击直接输入）：
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
                {quickLetters.map((l) => (
                  <button
                    key={l}
                    onClick={() => handleInput(l)}
                    className="w-9 h-10 sm:w-10 sm:h-11 rounded-lg bg-white border border-[#D5C5B5] hover:border-primary hover:bg-orange-50 active:bg-primary active:text-white font-mono font-bold text-sm text-[#3E2F23] shadow-xs transition-all flex items-center justify-center cursor-pointer"
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Translation Box */}
            <div className="mt-6 w-full max-w-2xl p-4 rounded-2xl bg-[#F4EDE3] border border-[#E0D0C0] text-sm text-[#4E3F35] flex items-start gap-3">
              <span className="chinese-seal px-1.5 py-0.5 text-xs shrink-0 mt-0.5">译文</span>
              <p className="leading-relaxed">{currentSentence.translation}</p>
            </div>
          </div>

          {/* Footer Callout */}
          <div className="mt-4 pt-4 border-t border-[#EBDCCF] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#7A6A5E]">
            <div className="flex items-center gap-2">
              <TrophyIcon className="w-4 h-4 text-amber-500" />
              <span>实际应用中支持多音字自适应匹配与整段双层滚雪球</span>
            </div>
            <button
              onClick={() => navigate('/')}
              className="text-primary hover:underline font-bold flex items-center gap-1"
            >
              <span>查看 72 篇完整篇目</span>
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
