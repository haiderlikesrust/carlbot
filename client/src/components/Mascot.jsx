import { useEffect, useRef } from 'react'
import * as THREE from 'three'

function Mascot() {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const mascotRef = useRef(null)
  const animationFrameRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return

    const initMascot = () => {
      // Scene setup
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x000000)
      sceneRef.current = scene

      // Camera setup
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
      camera.position.set(0, 0, 5)

      // Renderer setup
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setSize(200, 200)
      renderer.setPixelRatio(window.devicePixelRatio)
      containerRef.current.appendChild(renderer.domElement)

      // Lighting
      const ambientLight = new THREE.AmbientLight(0x00ff41, 0.5)
      scene.add(ambientLight)

      const pointLight1 = new THREE.PointLight(0x00ff41, 1, 100)
      pointLight1.position.set(5, 5, 5)
      scene.add(pointLight1)

      const pointLight2 = new THREE.PointLight(0x00d4ff, 1, 100)
      pointLight2.position.set(-5, -5, 5)
      scene.add(pointLight2)

      // Create mascot
      const group = new THREE.Group()

      // Body
      const bodyGeometry = new THREE.BoxGeometry(1, 1.2, 0.8)
      const bodyMaterial = new THREE.MeshPhongMaterial({
        color: 0x00ff41,
        emissive: 0x001100,
        shininess: 100
      })
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
      group.add(body)

      // Gaming controller symbol
      const controllerGroup = new THREE.Group()
      const controllerBase = new THREE.BoxGeometry(0.4, 0.25, 0.1)
      const controllerMaterial = new THREE.MeshBasicMaterial({ color: 0x00d4ff })
      const base = new THREE.Mesh(controllerBase, controllerMaterial)
      controllerGroup.add(base)

      // D-pad
      const dpad = new THREE.BoxGeometry(0.12, 0.12, 0.05)
      const dpadMesh = new THREE.Mesh(dpad, new THREE.MeshBasicMaterial({ color: 0xffffff }))
      dpadMesh.position.set(-0.1, 0, 0.06)
      controllerGroup.add(dpadMesh)

      // Buttons
      for (let i = 0; i < 4; i++) {
        const button = new THREE.SphereGeometry(0.04, 8, 8)
        const buttonMesh = new THREE.Mesh(button, new THREE.MeshBasicMaterial({ color: 0xff00ff }))
        buttonMesh.position.set(0.1 + (i % 2) * 0.05, (i < 2 ? 0.05 : -0.05), 0.06)
        controllerGroup.add(buttonMesh)
      }

      controllerGroup.rotation.x = Math.PI / 2
      controllerGroup.position.z = 0.41
      group.add(controllerGroup)

      // Head
      const headGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8)
      const headMaterial = new THREE.MeshPhongMaterial({
        color: 0x00d4ff,
        emissive: 0x001122,
        shininess: 100
      })
      const head = new THREE.Mesh(headGeometry, headMaterial)
      head.position.y = 1.1
      group.add(head)

      // Eyes
      const eyeGeometry = new THREE.SphereGeometry(0.15, 16, 16)
      const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff41 })

      const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial)
      leftEye.position.set(-0.2, 1.1, 0.45)
      group.add(leftEye)

      const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial)
      rightEye.position.set(0.2, 1.1, 0.45)
      group.add(rightEye)

      // Antenna
      const antennaGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8)
      const antennaMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff41 })
      const antenna = new THREE.Mesh(antennaGeometry, antennaMaterial)
      antenna.position.y = 1.6
      group.add(antenna)

      // Antenna tip
      const tipGeometry = new THREE.SphereGeometry(0.1, 8, 8)
      const tipMaterial = new THREE.MeshBasicMaterial({
        color: 0x00d4ff,
        emissive: 0x00d4ff,
        emissiveIntensity: 0.5
      })
      const tip = new THREE.Mesh(tipGeometry, tipMaterial)
      tip.position.y = 1.85
      group.add(tip)

      // Arms
      const armGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3)
      const armMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff41 })

      const leftArm = new THREE.Mesh(armGeometry, armMaterial)
      leftArm.position.set(-0.7, 0.2, 0)
      group.add(leftArm)

      const rightArm = new THREE.Mesh(armGeometry, armMaterial)
      rightArm.position.set(0.7, 0.2, 0)
      group.add(rightArm)

      // Legs
      const legGeometry = new THREE.BoxGeometry(0.3, 0.6, 0.3)
      const legMaterial = new THREE.MeshPhongMaterial({ color: 0x00d4ff })

      const leftLeg = new THREE.Mesh(legGeometry, legMaterial)
      leftLeg.position.set(-0.3, -0.9, 0)
      group.add(leftLeg)

      const rightLeg = new THREE.Mesh(legGeometry, legMaterial)
      rightLeg.position.set(0.3, -0.9, 0)
      group.add(rightLeg)

      // Glow layers
      const glows = []
      for (let i = 0; i < 3; i++) {
        const glowGeometry = new THREE.SphereGeometry(1.5 + i * 0.3, 32, 32)
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: i === 0 ? 0x00ff41 : (i === 1 ? 0x00d4ff : 0xff00ff),
          transparent: true,
          opacity: 0.05 - i * 0.01
        })
        const glow = new THREE.Mesh(glowGeometry, glowMaterial)
        glow.userData.index = i
        group.add(glow)
        glows.push(glow)
      }

      // Particle system
      const particleCount = 50
      const particleGeometry = new THREE.BufferGeometry()
      const positions = new Float32Array(particleCount * 3)
      const colors = new Float32Array(particleCount * 3)

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3
        positions[i3] = (Math.random() - 0.5) * 4
        positions[i3 + 1] = (Math.random() - 0.5) * 4
        positions[i3 + 2] = (Math.random() - 0.5) * 4

        const color = Math.random() > 0.5 ? 0x00ff41 : 0x00d4ff
        colors[i3] = (color >> 16) / 255
        colors[i3 + 1] = ((color >> 8) & 0xff) / 255
        colors[i3 + 2] = (color & 0xff) / 255
      }

      particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

      const particleMaterial = new THREE.PointsMaterial({
        size: 0.1,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
      })

      const particleSystem = new THREE.Points(particleGeometry, particleMaterial)
      group.add(particleSystem)

      mascotRef.current = {
        group,
        head,
        leftEye,
        rightEye,
        leftArm,
        rightArm,
        leftLeg,
        rightLeg,
        tip,
        glows,
        body,
        particleSystem,
        controllerGroup
      }

      scene.add(group)

      // Mouse tracking
      let mouseX = 0, mouseY = 0
      let targetRotationX = 0, targetRotationY = 0
      let currentRotationX = 0, currentRotationY = 0
      let animationState = 'idle'

      const handleMouseMove = (e) => {
        const rect = containerRef.current.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2

        mouseX = (e.clientX - centerX) / rect.width
        mouseY = (e.clientY - centerY) / rect.height

        targetRotationY = mouseX * 0.5
        targetRotationX = -mouseY * 0.5
      }

      const handleClick = () => {
        if (!mascotRef.current) return
        animationState = 'excited'
        setTimeout(() => { animationState = 'idle' }, 2000)

        // Bounce
        const originalY = group.position.y
        let bounceSpeed = 0.15
        let bounceCount = 0

        const bounce = () => {
          group.position.y += bounceSpeed
          bounceSpeed -= 0.025

          if (group.position.y <= originalY) {
            group.position.y = originalY
            bounceCount++
            if (bounceCount < 2) {
              bounceSpeed = 0.15
              bounce()
              return
            }
            return
          }
          requestAnimationFrame(bounce)
        }
        bounce()

        // Eye flash
        const colors = [0xffffff, 0xff00ff, 0x00ffff, 0xffff00]
        let colorIndex = 0
        const flashInterval = setInterval(() => {
          leftEye.material.emissive = new THREE.Color(colors[colorIndex])
          rightEye.material.emissive = new THREE.Color(colors[colorIndex])
          leftEye.material.emissiveIntensity = 1
          rightEye.material.emissiveIntensity = 1
          colorIndex = (colorIndex + 1) % colors.length
        }, 50)

        setTimeout(() => {
          clearInterval(flashInterval)
          leftEye.material.emissive = new THREE.Color(0x000000)
          rightEye.material.emissive = new THREE.Color(0x000000)
          leftEye.material.emissiveIntensity = 0
          rightEye.material.emissiveIntensity = 0
        }, 300)

        group.rotation.y += Math.PI * 2
      }

      containerRef.current.addEventListener('mousemove', handleMouseMove)
      containerRef.current.addEventListener('mouseenter', () => {
        targetRotationY = 0.3
      })
      containerRef.current.addEventListener('mouseleave', () => {
        targetRotationY = 0
        targetRotationX = 0
      })
      containerRef.current.addEventListener('click', handleClick)

      // Animation loop
      const animate = () => {
        animationFrameRef.current = requestAnimationFrame(animate)

        if (!mascotRef.current) return

        const time = Date.now() * 0.001

        currentRotationX += (targetRotationX - currentRotationX) * 0.1
        currentRotationY += (targetRotationY - currentRotationY) * 0.1

        group.rotation.y = currentRotationY
        group.rotation.x = currentRotationX

        if (animationState === 'excited') {
          group.position.y = Math.sin(time * 3) * 0.2
          group.rotation.z = Math.sin(time * 4) * 0.2
          head.rotation.y = Math.sin(time * 5) * 0.3
          head.rotation.x = Math.sin(time * 4) * 0.2
          leftArm.rotation.x = Math.sin(time * 3) * 0.5
          rightArm.rotation.x = -Math.sin(time * 3) * 0.5
        } else {
          group.position.y = Math.sin(time) * 0.1
          group.rotation.z = Math.sin(time * 0.5) * 0.05
          head.rotation.y = Math.sin(time * 2) * 0.1
          head.rotation.x = Math.sin(time * 1.5) * 0.05
          leftArm.rotation.x = Math.sin(time) * 0.2
          rightArm.rotation.x = -Math.sin(time) * 0.2
        }

        leftLeg.rotation.x = -Math.sin(time * 1.5) * 0.15
        rightLeg.rotation.x = Math.sin(time * 1.5) * 0.15

        const scale = 1 + Math.sin(time * 3) * 0.2
        tip.scale.set(scale, scale, scale)
        const hue = (time * 0.5) % 1
        tip.material.color.setHSL(hue, 1, 0.5)

        glows.forEach((glow, index) => {
          glow.material.opacity = (0.05 - index * 0.01) + Math.sin(time * 2 + index) * 0.03
          glow.rotation.y += 0.01 + index * 0.005
          glow.rotation.x += 0.005 + index * 0.002
        })

        const positions = particleSystem.geometry.attributes.position.array
        for (let i = 0; i < positions.length; i += 3) {
          const angle = time * 0.5 + i * 0.1
          const radius = 2 + Math.sin(time + i) * 0.3
          positions[i] = Math.cos(angle) * radius
          positions[i + 1] = Math.sin(angle * 1.3) * radius
          positions[i + 2] = Math.sin(angle * 0.7) * radius
        }
        particleSystem.geometry.attributes.position.needsUpdate = true
        particleSystem.rotation.y += 0.002

        controllerGroup.rotation.z = Math.sin(time * 2) * 0.1
        controllerGroup.children.forEach((child, index) => {
          if (index > 0 && child.geometry.type === 'SphereGeometry') {
            child.scale.setScalar(1 + Math.sin(time * 4 + index) * 0.2)
          }
        })

        const eyeGlow = 0.3 + Math.sin(time * 3) * 0.2
        leftEye.material.emissiveIntensity = eyeGlow
        rightEye.material.emissiveIntensity = eyeGlow

        renderer.render(scene, camera)
      }

      animate()

      // Return cleanup function
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current)
        }
        if (containerRef.current && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement)
        }
        renderer.dispose()
      }
    }

    const cleanup = initMascot()
    
    return cleanup
  }, [])

  return <div className="mascot-container" ref={containerRef}></div>
}

export default Mascot

