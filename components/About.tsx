import React from "react";

export default function About() {
  return (
    <section id="about" className="py-16 bg-gray-100 text-gray-800">
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-4xl font-bold text-center mb-8">About Me</h2>
        <p className="mb-6">
          Hi! I am Georgia Tech student graduating in May 2025, planning on
          doing my Masters in Machine Learning. I'm interested in software
          architecture, full stack development, and machine learning
          engineering. In my free time, I like to work on side projects,
          practice Brazilian Jiu Jitsu, and do woodworking.
        </p>
        <h3 className="text-2xl font-semibold mb-4">
          Opportunities I'm Looking For
        </h3>
        <ul className="list-disc list-inside space-y-2">
          <li>
            Full-Stack Developer roles focusing on modern JavaScript frameworks.
          </li>
          <li>Co-founder of a high-impact startup.</li>
          <li>
            Contracting work in Computer Vision, AI, and Machine Learning.
          </li>
        </ul>
      </div>
    </section>
  );
}
