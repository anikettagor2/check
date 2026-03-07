import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { AboutContent } from "@/components/about-content";
import { LenisProvider } from "@/components/home/lenis-provider";
import { CustomCursor } from "@/components/home/custom-cursor";
import { ImmersiveBackground } from "@/components/home/immersive-background";

export const metadata = {
  title: "About Us | EditoHub",
  description: "Learn about the mission, vision, and team behind EditoHub.",
};

export default function AboutPage() {
  return (
    <LenisProvider>
      <main className="bg-black text-white overflow-x-hidden selection:bg-primary selection:text-white">
        <CustomCursor />
        <ImmersiveBackground />
        <Navbar />
        <AboutContent />
        <Footer />
      </main>
    </LenisProvider>
  );
}
