import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HomeView } from "@/components/home/home-view";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <HomeView />
      </main>
      <SiteFooter />
    </>
  );
}
