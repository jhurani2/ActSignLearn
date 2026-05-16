import React, { Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, OrbitControls, Html } from '@react-three/drei';

/**
 * Model - renders the GLB for a given letter
 * Loaded inside Suspense for smooth swaps
 */
function Model({ letter }) {
  const { scene } = useGLTF(`/models/${letter}.glb`);
  return <primitive object={scene} />;
}

/**
 * LoadingFallback - shown while model swaps
 * Rendered inside Canvas via Html component
 */
function LoadingFallback() {
  return (
    <Html center>
      <div style={{
        background: 'rgba(0, 0, 0, 0.8)',
        color: '#fff',
        padding: '12px 20px',
        borderRadius: '4px',
        fontSize: '14px',
        fontFamily: 'system-ui'
      }}>
        Loading model…
      </div>
    </Html>
  );
}

/**
 * HandModelViewer
 * @param {string} letter - A single uppercase letter (A-Z)
 * 
 * Features:
 * - Loads GLB from /models/{letter}.glb
 * - OrbitControls for drag-to-rotate interaction
 * - Subtle ambient + directional lighting for depth
 * - Suspense-wrapped model swap with loading indicator
 * - Self-contained: just pass a letter prop
 */
export function HandModelViewer({ letter }) {
  return (
    <Canvas 
      camera={{ position: [0, 0, 2.5], fov: 50 }}
      style={{ width: '100%', height: '100%' }}
    >
      {/* Lighting setup for depth */}
      <ambientLight intensity={0.6} />
      <directionalLight 
        position={[8, 10, 5]} 
        intensity={0.8}
        castShadow
      />

      {/* Model with Suspense boundary for smooth letter swaps */}
      <Suspense fallback={<LoadingFallback />}>
        <Model letter={letter} />
      </Suspense>

      {/* Drag-to-rotate interaction */}
      <OrbitControls 
        autoRotate={false}
        enableZoom={true}
        enablePan={false}
      />
    </Canvas>
  );
}

/**
 * Preload adjacent models for instant swaps
 * Call this at module level to cache models on page load
 */
export function preloadAdjacentModels(currentLetter) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const currentIndex = alphabet.indexOf(currentLetter);
  
  if (currentIndex === -1) return;

  // Preload previous and next letter
  const prevLetter = currentIndex > 0 ? alphabet[currentIndex - 1] : 'Z';
  const nextLetter = currentIndex < 25 ? alphabet[currentIndex + 1] : 'A';

  useGLTF.preload(`/models/${prevLetter}.glb`);
  useGLTF.preload(`/models/${nextLetter}.glb`);
}

/**
 * Preload all 26 letters on mount
 * Call this once during app initialization for instant model swaps
 */
export function preloadAllLetters() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const letter of alphabet) {
    useGLTF.preload(`/models/${letter}.glb`);
  }
}

export default HandModelViewer;
