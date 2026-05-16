import React, { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { useGLTF, OrbitControls, Html } from '@react-three/drei'

function Model({ letter }) {
  const { scene } = useGLTF(`/models/${letter}.glb`)
  return <primitive object={scene} />
}

function Loading() {
  return (
    <Html center>
      <span>Loading model...</span>
    </Html>
  )
}

export default function TestViewer() {
  return (
    <Canvas camera={{ position: [0, 0, 3], fov: 45 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 3, 3]} intensity={1} />
      <Suspense fallback={<Loading />}>
        <Model letter="A" />
      </Suspense>
      <OrbitControls enablePan={false} minDistance={1.5} maxDistance={5} />
    </Canvas>
  )
}
