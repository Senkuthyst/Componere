import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Line, Sparkles } from '@react-three/drei'
import { Suspense, useEffect, useRef, useState } from 'react'
import type { Group } from 'three'

function Core() {
  const group = useRef<Group>(null)
  useFrame((state) => { if (!group.current) return; group.current.rotation.y = state.clock.elapsedTime * .12 + state.pointer.x * .12; group.current.rotation.x = state.pointer.y * .08 })
  return <group ref={group}><Float speed={1.3} rotationIntensity={.25} floatIntensity={.45}><mesh><icosahedronGeometry args={[1.05, 1]} /><meshStandardMaterial color="#8171e9" emissive="#34247b" emissiveIntensity={1.5} roughness={.25} metalness={.75} wireframe /></mesh><mesh scale={.57}><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#d9d2ff" emissive="#6c5bd2" emissiveIntensity={2.4} roughness={.2} metalness={.4} /></mesh></Float>{[[-2.1, .9, -.5], [2.15, .4, -.6], [1.6, -1.25, .3], [-1.7, -1.15, .4]].map((position, index) => <Float key={index} speed={.8 + index * .15} floatIntensity={.6}><mesh position={position as [number, number, number]} scale={.13}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={index % 2 ? '#54c9d5' : '#ac9dff'} emissive={index % 2 ? '#174e5f' : '#3c2d86'} emissiveIntensity={2} /></mesh><Line points={[[0, 0, 0], [-position[0] * .82, -position[1] * .82, -position[2] * .82]]} color={index % 2 ? '#55cbd5' : '#8172e9'} transparent opacity={.35} lineWidth={.7} /></Float>)}</group>
}

export default function EscrowHeroScene() {
  const sceneRef = useRef<HTMLDivElement>(null)
  const [contextLost, setContextLost] = useState(false)

  useEffect(() => {
    const canvas = sceneRef.current?.querySelector('canvas')
    if (!canvas) return
    const handleContextLost = (event: Event) => { event.preventDefault(); setContextLost(true) }
    canvas.addEventListener('webglcontextlost', handleContextLost)
    return () => canvas.removeEventListener('webglcontextlost', handleContextLost)
  }, [])

  if (contextLost) return <div className="hero-scene" ref={sceneRef}><div className="hero-scene-error" role="status">3D preview unavailable. Escrow details remain available.</div></div>
  return <div className="hero-scene" ref={sceneRef} aria-label="Interactive escrow agreement visualization"><Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 5.2], fov: 42 }} gl={{ antialias: true, alpha: true }}><Suspense fallback={null}><ambientLight intensity={.35} /><pointLight position={[2, 2, 3]} intensity={8} color="#9180ff" /><pointLight position={[-3, -2, 1]} intensity={5} color="#47c9d4" /><Core /><Sparkles count={38} scale={6} size={1.5} speed={.28} color="#bcb4ff" /></Suspense></Canvas></div>
}
