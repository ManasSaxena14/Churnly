import { Hero } from "@/components/landing/Hero";
import { PipelineScroll } from "@/components/landing/PipelineScroll";
import { Guarantees } from "@/components/landing/Guarantees";
import { EvalShowcase } from "@/components/landing/EvalShowcase";
import { ReceiptChain } from "@/components/landing/ReceiptChain";
import { FinalCTA, SiteFooter, SiteNav, TechMarquee } from "@/components/landing/Chrome";
import { ProductPreview } from "@/components/landing/ProductPreview";
import { FAQ } from "@/components/landing/FAQ";
import { ScrollProgress, SmoothScroll } from "@/components/motion";

export default function HomePage() {
  return (
    <div className="grain relative min-h-screen w-full overflow-x-clip bg-ink text-zinc-50">
      <SmoothScroll />
      <ScrollProgress />
      <SiteNav />
      <main>
        <Hero />
        <TechMarquee />
        <PipelineScroll />
        <ProductPreview />
        <Guarantees />
        <EvalShowcase />
        <ReceiptChain />
        <FAQ />
        <FinalCTA />
      </main>
      <SiteFooter />
    </div>
  );
}
