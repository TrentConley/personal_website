import Head from "next/head";
import Hero from "../components/Hero";
import Portfolio from "../components/Portfolio";
import Contact from "../components/Contact";
import About from "../components/About"; // New About component

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Head>
        <title>Trent Conley | Software Engineer</title>
        <meta
          name="description"
          content="Portfolio of Trent Conley, a software engineer and tech enthusiast."
        />
      </Head>
      <Hero />
      <About /> {/* Added About section */}
      <Portfolio />
      <Contact />
    </div>
  );
}
