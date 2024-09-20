import React from "react";
import Link from "next/link";

export default function Contact() {
  return (
    <section id="contact" className="py-16 bg-gray-900 text-white">
      <h2 className="text-4xl font-bold text-center mb-12">Contact</h2>
      <div className="max-w-xl mx-auto text-center space-y-4">
        <p>
          <strong>Email:</strong>{" "}
          <a href="mailto:tconley7@gatech.edu" className="text-blue-400">
            tconley7y@gatech.edu
          </a>
        </p>
        <p>
          <strong>Phone:</strong>{" "}
          <a href="tel:+16507141773" className="text-blue-400">
            +1 (650) 714-1773
          </a>
        </p>
        <Link href="/resume" className="btn btn-primary mt-6">
          View & Download Resume
        </Link>
      </div>
    </section>
  );
}
