import Head from "next/head";
import Hero from "../components/Hero";
import Portfolio from "../components/Portfolio";
import Contact from "../components/Contact"; // New component for contact section

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
      <Portfolio />
      <Contact />
    </div>
  );
}
