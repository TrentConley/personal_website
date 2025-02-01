import React from "react";
import { motion } from "framer-motion";
import ProjectCard from "./ProjectCard";
import PaintStrokes from "./PaintStrokes";

const InteractiveBackground = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Animated color splashes */}
      <div className="absolute top-1/3 -right-20 w-96 h-96 bg-blue-500/10 rounded-full mix-blend-overlay filter blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/3 left-1/4 w-80 h-80 bg-purple-500/10 rounded-full mix-blend-overlay filter blur-3xl animate-pulse delay-700"></div>
      <div className="absolute top-2/3 right-1/4 w-72 h-72 bg-cyan-500/10 rounded-full mix-blend-overlay filter blur-3xl animate-pulse delay-1500"></div>
      <motion.div
        className="absolute top-1/4 right-1/3 w-64 h-64 bg-pink-500/10 rounded-full mix-blend-overlay filter blur-3xl"
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      ></motion.div>
    </div>
  );
};

export default function Portfolio() {
  const projects = [
    {
      id: 1,
      title: "Lexara.io",
      image: "/lexara.jpg",
      description:
        "Built from scratch using React and MongoDB with a Node.js backend, Lexara.io is an AI-powered document intelligence platform that transforms Google Docs workflow. It provides intelligent suggestions, real-time feedback, and AI-powered insights. Features include smart suggestions with context-aware feedback, real-time collaboration for seamless workflow integration, and enterprise-grade security with bank-grade encryption and privacy controls.",
      links: {
        website: "https://lexara.io",
      },
    },
    {
      id: 2,
      title: "Eye-Controlled Drone",
      image: "/drone.jpg",
      description:
        "As a passion project, I created a system to control a drone using only eye movements and head tilts. I began by building an algorithm that mapped where my pupil was in relation to the rest of my eye, but this approach was ineffective since I could have variable distance to the screen. I set out to build a Convolutional Neural Network to classify my eye in certain positions, which provided two degrees of freedom. To gain full control of the drone, I incorporated my head tilt into the algorithm, giving me two more degrees of freedom. Finally, I refined the model by adding approximated face to camera distances, adding pupil coordinates, and retrained the CNN to incorporate these factors. The result was a surprisingly accurate and enjoyable drone control system. I had a friend test it out where he would look at another friend in the camera frame from the drone, and the software recognized where and one of my friends tested it out and you can see my friend Owen control it here: https://www.youtube.com/watch?v=lf6IOTpSvVg",
      links: {
        github: "https://github.com/TrentConley/Drone",
        youtube: "https://www.youtube.com/watch?v=lf6IOTpSvVg",
      },
    },
    {
      id: 3,
      title: "Token Streaming with Revest FNFTs",
      image: "/revest.png",
      description:
        "For the Web3ATL hackathon, I designed and implemented a token streaming mechanism using Revest FNFTs, offering both linear and quadratic withdrawal methods. I enhanced the RevestV2 contracts by introducing a batch minting process, creating one FNFT per second from creation until time lock expiration. This approach allows users to withdraw tokens at predetermined intervals seamlessly. I developed multiple withdrawal functions to handle different streaming strategies and wrote comprehensive tests to validate functionality and ensure reliability. Additionally, I modified auxiliary components such as the lock manager and interfaces to support the new streaming features, resulting in a robust and flexible token streaming solution. Although the initial prize was $2,500, Revest's value increased before distribution, resulting in earnings of over $7,000 in Ethereum at the time.",
      links: {
        github: "https://github.com/TrentConley/RevestV2-Streaming",
        website:
          "https://app.buidlbox.io/projects/token-str?path=projects%2Ftoken-str",
      },
    },
    {
      id: 4,
      title: "Website Development for True Persona AI",
      image: "/persona.png",
      description:
        "During my contract with True Persona AI, I was responsible for developing a website quickly to support their demos showcasing how generative AI can synthesize the personalities and skills of multiple individuals to form effective consulting teams. The website has been instrumental in over a dozen demonstrations, directly contributing to a successful fundraising round for the startup.",
      links: {
        website: "https://team-builder2.vercel.app/",
      },
    },
    {
      id: 5,
      title: "Easy Deep Learning",
      image: "/easy-deep-learning.png",
      description:
        "During Hacklytics 2024, my team and I developed Easy Deep Learning to simplify fine-tuning vision models without coding. Our platform allows users to upload images and fine-tune image classification models using data augmentation with Stable Diffusion. We leveraged technologies such as Firebase, Next.js, Flask, and Intel Developer Cloud to build a robust solution that can train accurate models with minimal data. We successfully trained models to recognize flooded neighborhoods in Pakistan with high accuracy using only 16 original images augmented with synthetic data. This project demonstrates the potential of making advanced AI techniques accessible to non-technical users.",
      links: {
        github: "https://github.com/TrentConley/Hacklytics",
        website: "https://devfolio.co/projects/easy-deep-learning-5b92",
        youtube: "https://www.youtube.com/watch?v=Ci80FKm_ACc",
      },
    },
    // Add more projects as needed
  ];

  return (
    <section id="portfolio" className="relative py-20 bg-[#050A18] overflow-hidden">
      <PaintStrokes />
      
      <motion.div
        className="relative max-w-6xl mx-auto px-6 z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <h2 className="text-5xl font-bold text-center mb-12 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 text-transparent bg-clip-text drop-shadow-lg">
          Projects
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </motion.div>
    </section>
  );
}
