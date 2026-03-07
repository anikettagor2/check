"use client";

import React, { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sphere, MeshDistortMaterial, Stars } from "@react-three/drei";
import * as THREE from "three";

function AnimatedShapes() {
  const mesh1 = useRef<THREE.Mesh>(null);
  const mesh2 = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (mesh1.current) {
      mesh1.current.rotation.x = Math.cos(t / 4) / 2;
      mesh1.current.rotation.y = Math.sin(t / 4) / 2;
      mesh1.current.position.y = Math.sin(t / 1.5) / 2;
    }
    if (mesh2.current) {
      mesh2.current.rotation.x = Math.sin(t / 4) / 2;
      mesh2.current.rotation.y = Math.cos(t / 4) / 2;
      mesh2.current.position.y = Math.cos(t / 1.5) / 2;
    }
  });

  return (
    <>
      <Float speed={2} rotationIntensity={1} floatIntensity={1}>
        <mesh ref={mesh1} position={[4, 2, -5]}>
          <octahedronGeometry args={[2, 0]} />
          <meshStandardMaterial color="#6366f1" wireframe transparent opacity={0.2} />
        </mesh>
      </Float>

      <Float speed={1.5} rotationIntensity={0.5} floatIntensity={2}>
        <mesh ref={mesh2} position={[-5, -2, -3]}>
          <torusGeometry args={[3, 0.02, 16, 100]} />
          <meshStandardMaterial color="#6366f1" transparent opacity={0.1} />
        </mesh>
      </Float>

      <Sphere args={[1, 100, 200]} scale={2.5} position={[0, 0, -10]}>
        <MeshDistortMaterial
          color="#1e1b4b"
          attach="material"
          distort={0.4}
          speed={1.5}
          roughness={0}
        />
      </Sphere>
    </>
  );
}

export function ImmersiveBackground() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none opacity-40">
      <Canvas camera={{ position: [0, 0, 10], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#6366f1" />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#ec4899" />
        
        <AnimatedShapes />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        
        <fog attach="fog" args={["#000", 5, 20]} />
      </Canvas>
    </div>
  );
}
