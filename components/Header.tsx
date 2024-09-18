import Image from "next/image";
import TypingEffect from "./TypingEffect";

export default function Header() {
  return (
    <section className="flex flex-col items-center justify-center h-screen text-center relative z-10">
      <div className="flex flex-col md:flex-row items-center">
        <div className="md:mr-8">
          <Image
            src="/images/trent.jpg"
            alt="Profile Picture"
            width={200}
            height={200}
            className="rounded-full"
          />
        </div>
        <div className="mt-4 md:mt-0">
          <h1 className="text-4xl font-bold">Hello, I'm Your Name</h1>
          <p className="text-xl mt-2">
            I'm a passionate <TypingEffect />
          </p>
        </div>
      </div>
    </section>
  );
}
