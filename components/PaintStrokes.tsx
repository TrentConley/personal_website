import React, { useEffect, useState, useRef } from "react";
import { motion, useAnimation } from "framer-motion";

interface FluidBlobProps {
  size: string;
  color1: string;
  color2: string;
  delay: number;
  index: number;
  blurAmount?: string;
  opacity1?: string;
  opacity2?: string;
}

const generateRandomPath = () => {
  const points = 5;
  const path = [];
  for (let i = 0; i < points; i++) {
    path.push([
      Math.random() * 100 - 50,  // x between -50 and 50
      Math.random() * 100 - 50   // y between -50 and 50
    ]);
  }
  return path;
};

const FluidBlob: React.FC<FluidBlobProps> = ({ 
  size, 
  color1, 
  color2, 
  delay, 
  index,
  blurAmount = "3xl",
  opacity1 = "30",
  opacity2 = "20"
}) => {
  const controls = useAnimation();
  const isMounted = useRef(false);
  
  useEffect(() => {
    isMounted.current = true;
    let animationFrame: number;

    const animate = async () => {
      if (!isMounted.current) return;

      const path = generateRandomPath();
      for (const [x, y] of path) {
        if (!isMounted.current) break;
        
        await controls.start({
          x,
          y,
          transition: {
            duration: Math.random() * 5 + 8,
            ease: "easeInOut"
          }
        });
      }
      
      if (isMounted.current) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    // Start the animation after a delay
    const timeoutId = setTimeout(() => {
      animate();
    }, delay * 1000);

    return () => {
      isMounted.current = false;
      clearTimeout(timeoutId);
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [controls, delay]);

  return (
    <motion.div
      animate={controls}
      initial={{ x: 0, y: 0 }}
      className={`absolute ${size} origin-center`}
      style={{
        left: `${Math.random() * 80 + 10}vw`,
        top: `${Math.random() * 80 + 10}vh`,
      }}
    >
      <motion.div
        animate={{
          scale: [1, 1.1, 0.9, 1.15, 1],
          rotate: [0, 10, -10, 15, 0],
        }}
        transition={{
          duration: Math.random() * 10 + 15,
          repeat: Infinity,
          ease: "easeInOut",
          delay: delay,
        }}
        className="relative w-full h-full"
      >
        <div className={`absolute inset-0 bg-${color1}-600/${opacity1} rounded-full blur-${blurAmount} transform-gpu mix-blend-screen`}></div>
        <div className={`absolute inset-0 bg-${color2}-500/${opacity2} rounded-full blur-[100px] transform-gpu mix-blend-screen`}></div>
      </motion.div>
    </motion.div>
  );
};

export default function PaintStrokes() {
  const blobs = [
    { size: "w-[45vw] h-[45vw]", color1: "blue", color2: "indigo", delay: 0, blurAmount: "3xl", opacity1: "25", opacity2: "20" },
    { size: "w-[40vw] h-[40vw]", color1: "purple", color2: "fuchsia", delay: 2, blurAmount: "3xl", opacity1: "20", opacity2: "15" },
    { size: "w-[50vw] h-[50vw]", color1: "cyan", color2: "blue", delay: 1, blurAmount: "3xl", opacity1: "20", opacity2: "15" },
    { size: "w-[35vw] h-[35vw]", color1: "violet", color2: "purple", delay: 3, blurAmount: "2xl", opacity1: "25", opacity2: "20" },
    { size: "w-[45vw] h-[45vw]", color1: "pink", color2: "rose", delay: 2, blurAmount: "3xl", opacity1: "20", opacity2: "15" },
    { size: "w-[30vw] h-[30vw]", color1: "blue", color2: "cyan", delay: 4, blurAmount: "2xl", opacity1: "20", opacity2: "15" },
    { size: "w-[40vw] h-[40vw]", color1: "indigo", color2: "violet", delay: 1, blurAmount: "3xl", opacity1: "20", opacity2: "15" },
    { size: "w-[35vw] h-[35vw]", color1: "purple", color2: "pink", delay: 3, blurAmount: "2xl", opacity1: "20", opacity2: "15" },
  ];

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden bg-[#050A18]">
      {blobs.map((blob, index) => (
        <FluidBlob key={index} {...blob} index={index} />
      ))}
    </div>
  );
} 