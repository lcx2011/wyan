import { useEffect } from 'react';
import './landing.css';
import { LandingNavbar } from './components/LandingNavbar';
import { HeroSection } from './components/HeroSection';
import { MethodologySection } from './components/MethodologySection';
import { InteractivePlayground } from './components/InteractivePlayground';
import { ExamReportMockup } from './components/ExamReportMockup';
import { CurriculumShowcase } from './components/CurriculumShowcase';
import { ComparisonSection } from './components/ComparisonSection';
import { PwaExperienceSection } from './components/PwaExperienceSection';
import { TestimonialsSection } from './components/TestimonialsSection';
import { FaqSection } from './components/FaqSection';
import { CtaBanner } from './components/CtaBanner';
import { LandingFooter } from './components/LandingFooter';

export function LandingPage() {
  useEffect(() => {
    // Set page title for SEO and polish
    const originalTitle = document.title;
    document.title = '文言文背诵官网 —— 面向中小学生的渐进式古诗文背诵闯关神器';
    return () => {
      document.title = originalTitle;
    };
  }, []);

  return (
    <div className="landing-root min-h-screen">
      {/* Top Fixed Navbar */}
      <LandingNavbar />

      {/* Hero Section */}
      <HeroSection />

      {/* Core Methodology Pillars */}
      <MethodologySection />

      {/* Real Live Interactive Playground / Demo */}
      <InteractivePlayground />

      {/* Full-text Boss Fight & Exam Diagnostics Mockup */}
      <ExamReportMockup />

      {/* Ministry Curriculum Catalog Showcase */}
      <CurriculumShowcase />

      {/* Scientific Comparison Matrix */}
      <ComparisonSection />

      {/* PWA & Multi-device Freedom */}
      <PwaExperienceSection />

      {/* Student & Parent Testimonials */}
      <TestimonialsSection />

      {/* FAQ Accordion */}
      <FaqSection />

      {/* Final Action Banner */}
      <CtaBanner />

      {/* Classical Footer */}
      <LandingFooter />
    </div>
  );
}

export default LandingPage;
