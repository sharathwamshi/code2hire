import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function NodeGraphBackdrop({ nodeCount = 46 }) {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const width = mount.clientWidth
    const height = mount.clientHeight

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)
    camera.position.z = 13

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    const group = new THREE.Group()
    scene.add(group)

    const nodes = []
    const roots = 6
    for (let r = 0; r < roots; r++) {
      const angle = (r / roots) * Math.PI * 2
      const rootPos = new THREE.Vector3(Math.cos(angle) * 6, Math.sin(angle) * 3.2, (Math.random() - 0.5) * 4)
      nodes.push({ pos: rootPos, parent: null })
      const branches = 2 + Math.floor(Math.random() * 3)
      for (let b = 0; b < branches; b++) {
        const childPos = rootPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3.2, (Math.random() - 0.5) * 3.2, (Math.random() - 0.5) * 3))
        nodes.push({ pos: childPos, parent: rootPos })
      }
    }
    while (nodes.length < nodeCount) {
      const parent = nodes[Math.floor(Math.random() * nodes.length)]
      const pos = parent.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4))
      nodes.push({ pos, parent: parent.pos })
    }

    const nodeGeo = new THREE.SphereGeometry(0.06, 12, 12)
    const nodeMat = new THREE.MeshBasicMaterial({ color: 0x9a72e8, transparent: true, opacity: 0.55 })
    nodes.forEach((n) => {
      const mesh = new THREE.Mesh(nodeGeo, nodeMat)
      mesh.position.copy(n.pos)
      group.add(mesh)
    })

    const lineMat = new THREE.LineBasicMaterial({ color: 0xc9b6f5, transparent: true, opacity: 0.28 })
    nodes.forEach((n) => {
      if (!n.parent) return
      const geometry = new THREE.BufferGeometry().setFromPoints([n.parent, n.pos])
      group.add(new THREE.Line(geometry, lineMat))
    })

    let frame
    const animate = () => {
      group.rotation.y += 0.0009
      group.rotation.x = Math.sin(Date.now() * 0.00007) * 0.15
      renderer.render(scene, camera)
      frame = requestAnimationFrame(animate)
    }
    animate()

    const handleResize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
      nodeGeo.dispose(); nodeMat.dispose(); lineMat.dispose(); renderer.dispose()
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
    }
  }, [nodeCount])

  return <div ref={mountRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
}
