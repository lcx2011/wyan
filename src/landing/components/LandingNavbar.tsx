import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpenIcon, MenuIcon, CloseIcon, ZapIcon, SparklesIcon } from './LandingIcons';

export function LandingNavbar() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: '核心亮点', href: '#features' },
    { label: '科学方法', href: '#methodology' },
    { label: '互动试玩', href: '#playground' },
    { label: '课标题库', href: '#curriculum' },
    { label: '对比优势', href: '#comparison' },
    { label: '多端支持', href: '#pwa' },
    { label: '学霸评价', href: '#testimonials' },
    { label: '常见问题', href: '#faq' },
  ];

  const handleNavClick = (href: string) => {
    setMobileMenuOpen(false);
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'glass-nav shadow-sm py-3'
          : 'bg-transparent py-4'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand Logo & Classical Seal */}
        <div
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white shadow-md shadow-primary/20 group-hover:scale-105 transition-transform">
              <BookOpenIcon className="w-5 h-5" />
            </div>
            <div className="absolute -bottom-1 -right-1 px-1 py-0.2 bg-[#C93B2B] text-white text-[9px] font-bold rounded-[3px] shadow-sm font-serif">
              文言
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-extrabold tracking-tight text-[#2A2018] group-hover:text-primary transition-colors">
                文言文背诵
              </span>
              <span className="px-1.5 py-0.5 text-[11px] font-semibold bg-amber-100/80 text-amber-800 rounded border border-amber-200/60">
                PWA 闯关版
              </span>
            </div>
            <span className="text-[11px] text-[#7A6A5E] tracking-wider hidden sm:inline">
              面向中小学生的渐进式古诗文背诵神器
            </span>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-7">
          {navLinks.map((link) => (
            <button
              key={link.href}
              onClick={() => handleNavClick(link.href)}
              className="text-sm font-medium text-[#4A3E36] hover:text-primary transition-colors cursor-pointer py-1"
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Action Buttons */}
        <div className="hidden sm:flex items-center gap-3">
          <button
            onClick={() => navigate('/login')}
            className="px-3.5 py-1.5 text-sm font-semibold text-[#5A4B41] hover:text-primary transition-colors"
          >
            登录账号
          </button>
          <button
            onClick={() => navigate('/')}
            className="relative group px-5 py-2.5 rounded-full bg-gradient-to-r from-primary via-primary-light to-primary-dark text-white text-sm font-bold shadow-soft hover:shadow-lg hover:shadow-primary/30 transition-all duration-300 hover:scale-[1.02] flex items-center gap-2"
          >
            <SparklesIcon className="w-4 h-4 text-amber-200" />
            <span>进入背诵系统</span>
            <ZapIcon className="w-3.5 h-3.5 opacity-80 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex sm:hidden items-center gap-2">
          <button
            onClick={() => navigate('/')}
            className="px-3 py-1.5 rounded-full bg-primary text-white text-xs font-bold shadow-sm"
          >
            开始背诵
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-[#4A3E36] hover:text-primary focus:outline-none"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <CloseIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden glass-nav border-t border-[#E6D7C8] px-4 pt-3 pb-6 mt-2 shadow-xl animate-fade-in">
          <div className="flex flex-col gap-2">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => handleNavClick(link.href)}
                className="text-left px-3 py-2.5 text-base font-medium text-[#4A3E36] hover:bg-orange-50/80 hover:text-primary rounded-lg transition-colors"
              >
                {link.label}
              </button>
            ))}
            <div className="pt-3 mt-2 border-t border-[#E6D7C8]/60 flex flex-col gap-2.5">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/login');
                }}
                className="w-full py-2.5 text-center text-sm font-bold text-[#5A4B41] bg-[#F2ECE4] rounded-xl"
              >
                登录已有账号
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/');
                }}
                className="w-full py-3 text-center text-sm font-bold text-white bg-gradient-to-r from-primary to-primary-dark rounded-xl shadow-soft"
              >
                立即进入应用
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
