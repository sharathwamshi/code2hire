import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'

function OrbitalShapes({ reducedMotion }) {
  const group = useRef(null)

  useFrame(({ clock }) => {
    if (group.current && !reducedMotion) {
      group.current.rotation.y = clock.getElapsedTime() * 0.08
      group.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.18) * 0.06
    }
  })

  return (
    <group ref={group} position={[2.15, 0.05, -0.4]}>
      <mesh>
        <icosahedronGeometry args={[0.78, 1]} />
        <meshStandardMaterial color="#9b83ff" roughness={0.38} metalness={0.28} transparent opacity={0.34} />
      </mesh>
      <mesh rotation={[0.8, 0.25, 0.35]}>
        <torusGeometry args={[1.2, 0.012, 8, 96]} />
        <meshBasicMaterial color="#c4b5ff" transparent opacity={0.45} />
      </mesh>
      <mesh rotation={[1.35, 0.7, -0.5]}>
        <torusGeometry args={[1.48, 0.009, 8, 96]} />
        <meshBasicMaterial color="#ff8eaf" transparent opacity={0.36} />
      </mesh>
      <mesh position={[1.15, 0.55, 0.1]}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshBasicMaterial color="#ffd27a" />
      </mesh>
      <mesh position={[-0.95, -0.72, 0.2]}>
        <sphereGeometry args={[0.065, 16, 16]} />
        <meshBasicMaterial color="#6ee7f2" />
      </mesh>
    </group>
  )
}

export default function LandingScene({ reducedMotion }) {
  const [isCompact, setIsCompact] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 920px)').matches
  ))

  useEffect(() => {
    const query = window.matchMedia('(max-width: 920px)')
    const updateCompact = () => setIsCompact(query.matches)
    query.addEventListener('change', updateCompact)
    return () => query.removeEventListener('change', updateCompact)
  }, [])

  if (isCompact) return null

  return (
    <div className="lp-three-scene" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 38 }}
        dpr={[1, 1.25]}
        frameloop={reducedMotion ? 'demand' : 'always'}
        gl={{ alpha: true, antialias: false, powerPreference: 'low-power' }}
      >
        <ambientLight intensity={1.2} />
        <pointLight position={[3, 2, 4]} color="#b9a6ff" intensity={18} />
        <OrbitalShapes reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  )
}
