// Three.js Interactive Gaming Mascot
let scene, camera, renderer, mascot;
let mouseX = 0, mouseY = 0;
let targetRotationX = 0, targetRotationY = 0;
let currentRotationX = 0, currentRotationY = 0;
let particles = [];
let particleSystem;
let isIdle = true;
let animationState = 'idle';

function initMascot() {
    const container = document.getElementById('mascotContainer');
    if (!container) return;

    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Camera setup
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(200, 200);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x00ff41, 0.5);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x00ff41, 1, 100);
    pointLight1.position.set(5, 5, 5);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x00d4ff, 1, 100);
    pointLight2.position.set(-5, -5, 5);
    scene.add(pointLight2);

    // Create mascot (gaming-themed robot)
    createMascot();

    // Mouse tracking
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseenter', () => {
        targetRotationY = 0.3;
    });
    container.addEventListener('mouseleave', () => {
        targetRotationY = 0;
        targetRotationX = 0;
    });

    // Click interaction
    container.addEventListener('click', () => {
        animateClick();
    });

    // Start animation loop
    animate();
}

function createMascot() {
    const group = new THREE.Group();

    // Body (main cube with gaming controller symbol)
    const bodyGeometry = new THREE.BoxGeometry(1, 1.2, 0.8);
    const bodyMaterial = new THREE.MeshPhongMaterial({
        color: 0x00ff41,
        emissive: 0x001100,
        shininess: 100
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);

    // Gaming controller symbol on body
    const controllerGroup = new THREE.Group();
    
    // Controller base
    const controllerBase = new THREE.BoxGeometry(0.4, 0.25, 0.1);
    const controllerMaterial = new THREE.MeshBasicMaterial({ color: 0x00d4ff });
    const base = new THREE.Mesh(controllerBase, controllerMaterial);
    controllerGroup.add(base);
    
    // D-pad
    const dpad = new THREE.BoxGeometry(0.12, 0.12, 0.05);
    const dpadMesh = new THREE.Mesh(dpad, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    dpadMesh.position.set(-0.1, 0, 0.06);
    controllerGroup.add(dpadMesh);
    
    // Buttons
    for (let i = 0; i < 4; i++) {
        const button = new THREE.SphereGeometry(0.04, 8, 8);
        const buttonMesh = new THREE.Mesh(button, new THREE.MeshBasicMaterial({ color: 0xff00ff }));
        buttonMesh.position.set(0.1 + (i % 2) * 0.05, (i < 2 ? 0.05 : -0.05), 0.06);
        controllerGroup.add(buttonMesh);
    }
    
    controllerGroup.rotation.x = Math.PI / 2;
    controllerGroup.position.z = 0.41;
    group.add(controllerGroup);

    // Head
    const headGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const headMaterial = new THREE.MeshPhongMaterial({
        color: 0x00d4ff,
        emissive: 0x001122,
        shininess: 100
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.1;
    group.add(head);

    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff41 });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.2, 1.1, 0.45);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.2, 1.1, 0.45);
    group.add(rightEye);

    // Antenna
    const antennaGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8);
    const antennaMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff41 });
    const antenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
    antenna.position.y = 1.6;
    group.add(antenna);

    // Antenna tip
    const tipGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const tipMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00d4ff,
        emissive: 0x00d4ff,
        emissiveIntensity: 0.5
    });
    const tip = new THREE.Mesh(tipGeometry, tipMaterial);
    tip.position.y = 1.85;
    group.add(tip);

    // Arms
    const armGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3);
    const armMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff41 });

    const leftArm = new THREE.Mesh(armGeometry, armMaterial);
    leftArm.position.set(-0.7, 0.2, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(0.7, 0.2, 0);
    group.add(rightArm);

    // Legs
    const legGeometry = new THREE.BoxGeometry(0.3, 0.6, 0.3);
    const legMaterial = new THREE.MeshPhongMaterial({ color: 0x00d4ff });

    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.position.set(-0.3, -0.9, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(0.3, -0.9, 0);
    group.add(rightLeg);

    // Add pulsing glow effect with multiple layers
    for (let i = 0; i < 3; i++) {
        const glowGeometry = new THREE.SphereGeometry(1.5 + i * 0.3, 32, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: i === 0 ? 0x00ff41 : (i === 1 ? 0x00d4ff : 0xff00ff),
            transparent: true,
            opacity: 0.05 - i * 0.01
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.userData.index = i;
        group.add(glow);
    }

    // Create particle system
    const particleCount = 50;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3] = (Math.random() - 0.5) * 4;
        positions[i3 + 1] = (Math.random() - 0.5) * 4;
        positions[i3 + 2] = (Math.random() - 0.5) * 4;
        
        const color = Math.random() > 0.5 ? 0x00ff41 : 0x00d4ff;
        colors[i3] = (color >> 16) / 255;
        colors[i3 + 1] = ((color >> 8) & 0xff) / 255;
        colors[i3 + 2] = (color & 0xff) / 255;
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const particleMaterial = new THREE.PointsMaterial({
        size: 0.1,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });
    
    particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    group.add(particleSystem);

    mascot = group;
    scene.add(mascot);

    // Store references for animation
    mascot.userData = {
        head: head,
        leftEye: leftEye,
        rightEye: rightEye,
        leftArm: leftArm,
        rightArm: rightArm,
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        tip: tip,
        glows: group.children.filter(child => child.material && child.material.transparent),
        body: body,
        particleSystem: particleSystem,
        controllerGroup: controllerGroup
    };
}

function onMouseMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    mouseX = (event.clientX - centerX) / rect.width;
    mouseY = (event.clientY - centerY) / rect.height;
    
    targetRotationY = mouseX * 0.5;
    targetRotationX = -mouseY * 0.5;
}

function animateClick() {
    if (!mascot) return;
    
    animationState = 'excited';
    setTimeout(() => { animationState = 'idle'; }, 2000);
    
    // Epic bounce animation
    const originalY = mascot.position.y;
    let bounceHeight = 0.5;
    let bounceSpeed = 0.15;
    let bounceCount = 0;
    
    function bounce() {
        mascot.position.y += bounceSpeed;
        bounceSpeed -= 0.025;
        
        if (mascot.position.y <= originalY) {
            mascot.position.y = originalY;
            bounceCount++;
            if (bounceCount < 2) {
                bounceSpeed = 0.15;
                bounce();
                return;
            }
            return;
        }
        
        requestAnimationFrame(bounce);
    }
    
    bounce();
    
    // Epic eye flash with color change
    const flashDuration = 300;
    const colors = [0xffffff, 0xff00ff, 0x00ffff, 0xffff00];
    let colorIndex = 0;
    
    const flashInterval = setInterval(() => {
        mascot.userData.leftEye.material.emissive = new THREE.Color(colors[colorIndex]);
        mascot.userData.rightEye.material.emissive = new THREE.Color(colors[colorIndex]);
        mascot.userData.leftEye.material.emissiveIntensity = 1;
        mascot.userData.rightEye.material.emissiveIntensity = 1;
        colorIndex = (colorIndex + 1) % colors.length;
    }, 50);
    
    setTimeout(() => {
        clearInterval(flashInterval);
        mascot.userData.leftEye.material.emissive = new THREE.Color(0x000000);
        mascot.userData.rightEye.material.emissive = new THREE.Color(0x000000);
        mascot.userData.leftEye.material.emissiveIntensity = 0;
        mascot.userData.rightEye.material.emissiveIntensity = 0;
    }, flashDuration);
    
    // Spin animation
    mascot.rotation.y += Math.PI * 2;
    
    // Particle burst
    if (mascot.userData.particleSystem) {
        const positions = mascot.userData.particleSystem.geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] += (Math.random() - 0.5) * 0.5;
            positions[i + 1] += (Math.random() - 0.5) * 0.5;
            positions[i + 2] += (Math.random() - 0.5) * 0.5;
        }
        mascot.userData.particleSystem.geometry.attributes.position.needsUpdate = true;
    }
}

function animate() {
    requestAnimationFrame(animate);

    if (!mascot) return;

    const time = Date.now() * 0.001;

    // Smooth rotation following mouse
    currentRotationX += (targetRotationX - currentRotationX) * 0.1;
    currentRotationY += (targetRotationY - currentRotationY) * 0.1;
    
    mascot.rotation.y = currentRotationY;
    mascot.rotation.x = currentRotationX;

    // Dynamic animations based on state
    if (animationState === 'excited') {
        // Excited state - more movement
        mascot.position.y = Math.sin(time * 3) * 0.2;
        mascot.rotation.z = Math.sin(time * 4) * 0.2;
        
        if (mascot.userData.head) {
            mascot.userData.head.rotation.y = Math.sin(time * 5) * 0.3;
            mascot.userData.head.rotation.x = Math.sin(time * 4) * 0.2;
        }
        
        if (mascot.userData.leftArm && mascot.userData.rightArm) {
            mascot.userData.leftArm.rotation.x = Math.sin(time * 3) * 0.5;
            mascot.userData.rightArm.rotation.x = -Math.sin(time * 3) * 0.5;
            mascot.userData.leftArm.rotation.z = Math.sin(time * 2) * 0.3;
            mascot.userData.rightArm.rotation.z = -Math.sin(time * 2) * 0.3;
        }
    } else {
        // Idle state - gentle movements
        mascot.position.y = Math.sin(time) * 0.1;
        mascot.rotation.z = Math.sin(time * 0.5) * 0.05;
        
        // Head bob with look around
        if (mascot.userData.head) {
            mascot.userData.head.rotation.y = Math.sin(time * 2) * 0.1;
            mascot.userData.head.rotation.x = Math.sin(time * 1.5) * 0.05;
        }
        
        // Arm swing
        if (mascot.userData.leftArm && mascot.userData.rightArm) {
            mascot.userData.leftArm.rotation.x = Math.sin(time) * 0.2;
            mascot.userData.rightArm.rotation.x = -Math.sin(time) * 0.2;
        }
    }
    
    // Leg movement (always active)
    if (mascot.userData.leftLeg && mascot.userData.rightLeg) {
        mascot.userData.leftLeg.rotation.x = -Math.sin(time * 1.5) * 0.15;
        mascot.userData.rightLeg.rotation.x = Math.sin(time * 1.5) * 0.15;
    }
    
    // Antenna tip pulse with color change
    if (mascot.userData.tip) {
        const scale = 1 + Math.sin(time * 3) * 0.2;
        mascot.userData.tip.scale.set(scale, scale, scale);
        const hue = (time * 0.5) % 1;
        mascot.userData.tip.material.color.setHSL(hue, 1, 0.5);
    }
    
    // Multi-layer glow pulse with rotation
    if (mascot.userData.glows) {
        mascot.userData.glows.forEach((glow, index) => {
            glow.material.opacity = (0.05 - index * 0.01) + Math.sin(time * 2 + index) * 0.03;
            glow.rotation.y += 0.01 + index * 0.005;
            glow.rotation.x += 0.005 + index * 0.002;
        });
    }
    
    // Particle system animation
    if (mascot.userData.particleSystem) {
        const positions = mascot.userData.particleSystem.geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            // Orbital motion
            const angle = time * 0.5 + i * 0.1;
            const radius = 2 + Math.sin(time + i) * 0.3;
            positions[i] = Math.cos(angle) * radius;
            positions[i + 1] = Math.sin(angle * 1.3) * radius;
            positions[i + 2] = Math.sin(angle * 0.7) * radius;
        }
        mascot.userData.particleSystem.geometry.attributes.position.needsUpdate = true;
        mascot.userData.particleSystem.rotation.y += 0.002;
    }
    
    // Controller button press animation
    if (mascot.userData.controllerGroup) {
        mascot.userData.controllerGroup.rotation.z = Math.sin(time * 2) * 0.1;
        mascot.userData.controllerGroup.children.forEach((child, index) => {
            if (index > 0 && child.geometry.type === 'SphereGeometry') {
                child.scale.setScalar(1 + Math.sin(time * 4 + index) * 0.2);
            }
        });
    }
    
    // Eye glow pulse
    if (mascot.userData.leftEye && mascot.userData.rightEye) {
        const eyeGlow = 0.3 + Math.sin(time * 3) * 0.2;
        mascot.userData.leftEye.material.emissiveIntensity = eyeGlow;
        mascot.userData.rightEye.material.emissiveIntensity = eyeGlow;
    }

    renderer.render(scene, camera);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMascot);
} else {
    initMascot();
}

// Handle window resize
window.addEventListener('resize', () => {
    if (camera && renderer) {
        const container = document.getElementById('mascotContainer');
        if (container) {
            const width = container.clientWidth;
            const height = container.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        }
    }
});

