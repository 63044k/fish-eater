// Get the canvas and context for drawing
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Function to resize canvas to fill the window
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

// Initial canvas sizing
resizeCanvas();

// Handle window resize
window.addEventListener('resize', resizeCanvas);

// Game settings
function getGameDimensions() {
    return {
        width: canvas.width,
        height: canvas.height
    };
}

// World settings for infinite ocean
const world = {
    surfaceY: 0,        // Y position of water surface (will be calculated)
    bottomY: 0,         // Y position of ocean floor (will be calculated)
    offsetX: 0,         // Horizontal world offset
    offsetY: 0,         // Vertical world offset
    skyHeight: 150,     // Height of sky area
    oceanDepth: 2000,   // Total ocean depth (many screens deep)
    sandHeight: 100     // Height of sand area at bottom
};

// Shark object - stays in center of screen
const shark = {
    x: 0,               // Will be set to center X
    y: 0,               // Will be set to center Y  
    width: 80,          // Base width
    height: 40,         // Base height
    baseWidth: 80,      // Original width for growth calculations
    baseHeight: 40,     // Original height for growth calculations
    growthFactor: 1.0,  // Current growth multiplier
    speed: 2,           // Reduced from 4 to 2 for better control
    direction: 0,       // Angle in degrees
    targetX: 0,         // Mouse target position
    targetY: 0
};

// Mouse position and state
const mouse = {
    x: 0,
    y: 0,
    isOnScreen: false
};

// Seaweed for visual movement effect (pre-generated off-screen)
const seaweedPieces = [];
const seaweedDensity = 0.0025; // Final density for seaweed
const generatedChunks = new Set(); // Track which chunks have been generated

// Fish for the shark to chase (also pre-generated off-screen)
const fishPieces = [];
const fishDensity = 0.0005; // Reduced from 0.001 to prevent overcrowding
const fishGeneratedChunks = new Set(); // Track which chunks have fish generated

// Game stats for fish eating
const gameStats = {
    fishEaten: 0,
    slowFishEaten: 0,
    fastFishEaten: 0
};

// Debug settings
const debugSettings = {
    showMouthPosition: false // Set to true to show mouth debug visualization
};

// Blood particles for fish eating effects
const bloodParticles = [];

// Function to create blood particles when a fish is eaten
function createBloodEffect(fishX, fishY, fishSize) {
    const particleCount = Math.min(12 + Math.floor(fishSize / 2), 20); // More particles for a cloud effect
    
    for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 1.0; // More random spread
        const speed = 0.3 + Math.random() * 0.4; // Much slower speeds (was 1-3, now 0.3-0.7)
        const size = 1.5 + Math.random() * 3; // Slightly smaller particles
        
        bloodParticles.push({
            x: fishX + (Math.random() - 0.5) * fishSize * 0.5, // Start slightly spread out
            y: fishY + (Math.random() - 0.5) * fishSize * 0.5,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: size,
            maxSize: size,
            life: 1.0, // Starts at full life
            maxLife: 120 + Math.random() * 60, // Lives longer (2-3 seconds for cloud effect)
            gravity: 0.005 + Math.random() * 0.005, // Much less gravity
            fade: 0.99 - Math.random() * 0.01 // Slower fade
        });
    }
}

// Function to update blood particles
function updateBloodParticles() {
    for (let i = bloodParticles.length - 1; i >= 0; i--) {
        const particle = bloodParticles[i];
        
        // Update position
        particle.x += particle.vx;
        particle.y += particle.vy;
        
        // Apply gentle gravity (makes particles sink very slowly in water)
        particle.vy += particle.gravity;
        
        // Apply stronger water resistance for cloud-like drift
        particle.vx *= 0.995; // Very gentle slowdown
        particle.vy *= 0.995;
        
        // Add subtle random drift for organic cloud movement
        particle.vx += (Math.random() - 0.5) * 0.02;
        particle.vy += (Math.random() - 0.5) * 0.02;
        
        // Reduce life
        particle.life -= 1.0 / particle.maxLife;
        
        // Particles grow slightly at first, then shrink (cloud expansion effect)
        const lifeProgress = 1 - particle.life;
        if (lifeProgress < 0.3) {
            // Expand phase (first 30% of life)
            particle.size = particle.maxSize * (1 + lifeProgress * 0.5);
        } else {
            // Shrink phase (remaining 70% of life)
            const shrinkProgress = (lifeProgress - 0.3) / 0.7;
            particle.size = particle.maxSize * 1.15 * (1 - shrinkProgress);
        }
        
        // Remove dead particles
        if (particle.life <= 0) {
            bloodParticles.splice(i, 1);
        }
    }
}

// Function to draw blood particles
function drawBloodParticles() {
    const dims = getGameDimensions();
    
    bloodParticles.forEach(particle => {
        // Calculate particle position relative to world offset
        const drawX = particle.x + world.offsetX;
        const drawY = particle.y + world.offsetY;
        
        // Only draw if on screen (with some margin)
        if (drawX > -20 && drawX < dims.width + 20 && drawY > -20 && drawY < dims.height + 20) {
            ctx.save();
            
            // Use a harmonious red color that fits the ocean theme
            const alpha = particle.life * 0.8; // Fade out over time
            ctx.fillStyle = `rgba(220, 80, 80, ${alpha})`; // Soft coral red
            
            // Draw particle as a circle
            ctx.beginPath();
            ctx.arc(drawX, drawY, particle.size, 0, 2 * Math.PI);
            ctx.fill();
            
            // Add a subtle glow effect for cartoon style
            ctx.fillStyle = `rgba(255, 120, 120, ${alpha * 0.3})`;
            ctx.beginPath();
            ctx.arc(drawX, drawY, particle.size * 1.5, 0, 2 * Math.PI);
            ctx.fill();
            
            ctx.restore();
        }
    });
}

// Function to get chunk coordinates for a world position
function getChunkCoords(worldX, worldY) {
    const chunkSize = 800; // Size of each seaweed chunk
    return {
        x: Math.floor(worldX / chunkSize),
        y: Math.floor(worldY / chunkSize),
        size: chunkSize
    };
}

// Function to generate seaweed for a specific chunk
function generateSeaweedChunk(chunkX, chunkY, chunkSize) {
    const chunkKey = `${chunkX},${chunkY}`;
    if (generatedChunks.has(chunkKey)) return; // Already generated
    
    generatedChunks.add(chunkKey);
    
    // Calculate world coordinates for this chunk
    const worldX = chunkX * chunkSize + chunkSize / 2;
    const worldY = chunkY * chunkSize + chunkSize / 2;
    
    // Generate seaweed at final density for this chunk
    const area = (chunkSize * chunkSize) / 10000; // Convert to 100x100 units
    const count = Math.floor(area * seaweedDensity * 100);
    
    for (let i = 0; i < count; i++) {
        const x = chunkX * chunkSize + Math.random() * chunkSize;
        const y = chunkY * chunkSize + Math.random() * chunkSize;
        
        // Only place seaweed in the water, not too close to surface or bottom
        const minY = world.surfaceY + 100;
        const maxY = world.bottomY - 50;
        
        if (y >= minY && y <= maxY) {
            seaweedPieces.push({
                x: x,
                y: y,
                height: 30 + Math.random() * 60,
                sway: Math.random() * Math.PI * 2,
                speed: 0.02 + Math.random() * 0.03,
                chunkKey: chunkKey
            });

            // Occasionally spawn a green lurker fish at this seaweed clump
            if (Math.random() < 0.12) { // ~12% of seaweed clumps get a green fish
                const greenFishColor = '#2ecc40'; // Distinct green, not same as seaweed
                const homeX = x;
                const homeY = y + 10; // Slightly below the top of the seaweed
                fishPieces.push({
                    x: homeX,
                    y: homeY,
                    vx: 0,
                    vy: 0,
                    size: 11 + Math.random() * 5,
                    speed: 1.3 + Math.random() * 0.4, // Similar to slow fish
                    fleeDistance: 120 + Math.random() * 80, // Not used for green fish
                    color: greenFishColor,
                    chunkKey: chunkKey,
                    type: 'green',
                    homeX: homeX,
                    homeY: homeY,
                    state: 'hiding', // hiding | emerging | returning
                    stateTimer: 0
                });
            }
        }
    }
}

// Function to generate fish for a specific chunk
function generateFishChunk(chunkX, chunkY, chunkSize) {
    const chunkKey = `${chunkX},${chunkY}`;
    if (fishGeneratedChunks.has(chunkKey)) return; // Already generated
    
    fishGeneratedChunks.add(chunkKey);
    
    // Generate fish at specified density for this chunk
    const area = (chunkSize * chunkSize) / 10000; // Convert to 100x100 units
    const count = Math.floor(area * fishDensity * 100);
    
    for (let i = 0; i < count; i++) {
        const x = chunkX * chunkSize + Math.random() * chunkSize;
        const y = chunkY * chunkSize + Math.random() * chunkSize;
        
        // Only place fish in the water, not too close to surface or bottom
        const minY = world.surfaceY + 80;
        const maxY = world.bottomY - 80;
        
        if (y >= minY && y <= maxY) {
            // Create fish with varied speeds - some slower, some faster than shark
            const fishType = Math.random();
            let speed, color, size;
            
            if (fishType < 0.6) {
                // 60% slow fish - easier to catch
                speed = 1.2 + Math.random() * 0.6; // 1.2-1.8 (slower than shark's 2)
                color = '#FFD700'; // Gold - slow fish
                size = 10 + Math.random() * 8; // Slightly larger
            } else {
                // 40% fast fish - harder to catch
                speed = 2.2 + Math.random() * 0.8; // 2.2-3.0 (faster than shark's 2)
                color = '#FF6347'; // Red - fast fish
                size = 6 + Math.random() * 6; // Smaller and quicker
            }
            
            fishPieces.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 2, // Random initial velocity
                vy: (Math.random() - 0.5) * 2,
                size: size,
                speed: speed,
                fleeDistance: 120 + Math.random() * 80, // Distance at which fish start fleeing
                color: color,
                chunkKey: chunkKey,
                type: 'normal' // normal | green
            });
        }
    }
}

// Function to manage seaweed chunks based on current view
function manageSeaweedChunks() {
    const dims = getGameDimensions();
    const viewCenterX = -world.offsetX;
    const viewCenterY = -world.offsetY + dims.height/2;
    
    const currentChunk = getChunkCoords(viewCenterX, viewCenterY);
    const chunkSize = currentChunk.size;
    
    // Generate chunks in a 5x3 area around current position (2 screens in each direction)
    const rangeX = 2; // 2 chunks left and right
    const rangeY = 1; // 1 chunk up and down
    
    for (let dx = -rangeX; dx <= rangeX; dx++) {
        for (let dy = -rangeY; dy <= rangeY; dy++) {
            const chunkX = currentChunk.x + dx;
            const chunkY = currentChunk.y + dy;
            generateSeaweedChunk(chunkX, chunkY, chunkSize);
            generateFishChunk(chunkX, chunkY, chunkSize);
        }
    }
    
    // Remove seaweed that's too far away (more than 3 chunks)
    const maxDistance = chunkSize * 3;
    for (let i = seaweedPieces.length - 1; i >= 0; i--) {
        const seaweed = seaweedPieces[i];
        const distanceX = Math.abs(seaweed.x - viewCenterX);
        const distanceY = Math.abs(seaweed.y - viewCenterY);
        
        if (distanceX > maxDistance || distanceY > maxDistance) {
            // Remove from generated chunks set as well
            generatedChunks.delete(seaweed.chunkKey);
            seaweedPieces.splice(i, 1);
        }
    }
    
    // Remove fish that's too far away (more than 3 chunks)
    for (let i = fishPieces.length - 1; i >= 0; i--) {
        const fish = fishPieces[i];
        const distanceX = Math.abs(fish.x - viewCenterX);
        const distanceY = Math.abs(fish.y - viewCenterY);
        
        if (distanceX > maxDistance || distanceY > maxDistance) {
            // Remove from generated chunks set as well
            fishGeneratedChunks.delete(fish.chunkKey);
            fishPieces.splice(i, 1);
        }
    }
}

// Initialize game positions
function initializeGame() {
    const dims = getGameDimensions();
    
    // Calculate world boundaries
    world.surfaceY = world.skyHeight;
    world.bottomY = world.surfaceY + world.oceanDepth;
    
    // Place shark in center of screen and reset growth
    shark.x = dims.width / 2;
    shark.y = dims.height / 2;
    shark.targetX = shark.x;
    shark.targetY = shark.y;
    shark.growthFactor = 1.0; // Reset growth to base size
    shark.width = shark.baseWidth;
    shark.height = shark.baseHeight;
    
    // Reset game stats
    gameStats.fishEaten = 0;
    gameStats.slowFishEaten = 0;
    gameStats.fastFishEaten = 0;
    
    mouse.x = dims.width / 2;
    mouse.y = dims.height / 2;
    mouse.isOnScreen = false;
    
    // Clear existing seaweed and generated chunks
    seaweedPieces.length = 0;
    generatedChunks.clear();
    
    // Clear existing fish and generated fish chunks
    fishPieces.length = 0;
    fishGeneratedChunks.clear();
    
    // Generate initial seaweed chunks around starting position
    manageSeaweedChunks();
}

// Call initialization
initializeGame();

// Function to update target position from either mouse or touch
function updateTargetPosition(clientX, clientY) {
    // Get the canvas position on the page
    const rect = canvas.getBoundingClientRect();
    
    // Calculate position relative to the canvas
    mouse.x = clientX - rect.left;
    mouse.y = clientY - rect.top;
    mouse.isOnScreen = true;
    
    // Set shark target
    shark.targetX = mouse.x;
    shark.targetY = mouse.y;
}

// Listen for mouse movement (desktop)
canvas.addEventListener('mousemove', function(event) {
    updateTargetPosition(event.clientX, event.clientY);
});

// Listen for mouse leaving the canvas (desktop)
canvas.addEventListener('mouseleave', function(event) {
    mouse.isOnScreen = false;
});

// Listen for mouse entering the canvas (desktop)
canvas.addEventListener('mouseenter', function(event) {
    mouse.isOnScreen = true;
});

// Listen for touch events (mobile) - simple approach
canvas.addEventListener('touchstart', function(event) {
    event.preventDefault();
    if (event.touches.length > 0) {
        updateTargetPosition(event.touches[0].clientX, event.touches[0].clientY);
    }
}, { passive: false });

canvas.addEventListener('touchmove', function(event) {
    event.preventDefault();
    if (event.touches.length > 0) {
        updateTargetPosition(event.touches[0].clientX, event.touches[0].clientY);
    }
}, { passive: false });

canvas.addEventListener('touchend', function(event) {
    event.preventDefault();
    // Keep target where it was - shark continues moving to last position
}, { passive: false });

// Function to update world position based on shark movement
function updateWorld() {
    const dims = getGameDimensions();
    
    // Only move if mouse is on screen
    if (!mouse.isOnScreen) return;
    
    // Calculate how much the shark wants to move from center
    const deltaX = shark.targetX - shark.x;
    const deltaY = shark.targetY - shark.y;
    
    // Calculate distance to target
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Create a dead zone around the shark - don't move if cursor is close to center
    const deadZoneRadius = 50;
    
    if (distance > deadZoneRadius) {
        // Calculate movement direction
        const moveX = (deltaX / distance) * shark.speed;
        const moveY = (deltaY / distance) * shark.speed;
        
        // Instead of moving shark, move the world in opposite direction
        world.offsetX -= moveX;
        world.offsetY -= moveY;
        
        // Calculate direction shark is facing
        shark.direction = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
        
        // Calculate current depth in world coordinates
        const currentWorldY = shark.y - world.offsetY;
        
        // Limit vertical movement to stay within ocean bounds
        // Don't let the shark go above water surface
        if (currentWorldY < world.surfaceY + 20) {
            world.offsetY = -(world.surfaceY + 20 - shark.y);
        }
        
        // Don't let the shark go below ocean floor
        if (currentWorldY > world.bottomY - 20) {
            world.offsetY = -(world.bottomY - 20 - shark.y);
        }
        
        // No horizontal limits - infinite scrolling!
        
        // Manage seaweed chunks based on new position
        manageSeaweedChunks();
    }
}

// Function to update fish behavior (fleeing from shark)
function updateFish() {
    // Calculate shark's world position
    const sharkWorldX = shark.x - world.offsetX;
    const sharkWorldY = shark.y - world.offsetY;
    
    fishPieces.forEach(fish => {
        // Green lurker fish custom behavior
        if (fish.type === 'green') {
            // States: hiding, emerging, returning
            const sharkDist = Math.sqrt(Math.pow(fish.x - sharkWorldX, 2) + Math.pow(fish.y - sharkWorldY, 2));
            if (fish.state === 'hiding') {
                // Stay at home, minimal movement
                fish.vx = 0;
                fish.vy = 0;
                // If shark is close, emerge
                if (sharkDist < 120) {
                    fish.state = 'emerging';
                    fish.stateTimer = 0;
                }
                // Snap to home
                fish.x = fish.homeX;
                fish.y = fish.homeY;
            } else if (fish.state === 'emerging') {
                // Move toward shark
                const dx = sharkWorldX - fish.x;
                const dy = sharkWorldY - fish.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist > 2) {
                    fish.vx = (dx / dist) * fish.speed * 0.7;
                    fish.vy = (dy / dist) * fish.speed * 0.7;
                } else {
                    fish.vx = 0;
                    fish.vy = 0;
                }
                // If too far from home, return
                fish.stateTimer++;
                const homeDist = Math.sqrt(Math.pow(fish.x - fish.homeX, 2) + Math.pow(fish.y - fish.homeY, 2));
                if (homeDist > 800) {   // Optionally include timeer e.g. fish.stateTimer > 80
                    fish.state = 'returning';
                }
            } else if (fish.state === 'returning') {
                // Move back to home
                const dx = fish.homeX - fish.x;
                const dy = fish.homeY - fish.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist > 2) {
                    fish.vx = (dx / dist) * fish.speed * 0.5;
                    fish.vy = (dy / dist) * fish.speed * 0.5;
                } else {
                    fish.vx = 0;
                    fish.vy = 0;
                    fish.x = fish.homeX;
                    fish.y = fish.homeY;
                    fish.state = 'hiding';
                }
                // If shark comes close again, emerge
                if (sharkDist < 120) {
                    fish.state = 'emerging';
                    fish.stateTimer = 0;
                }
            }
            // Update position
            fish.x += fish.vx;
            fish.y += fish.vy;
            // Keep within ocean bounds
            const minY = world.surfaceY + 80;
            const maxY = world.bottomY - 80;
            if (fish.y < minY) { fish.y = minY; fish.vy = Math.abs(fish.vy); }
            if (fish.y > maxY) { fish.y = maxY; fish.vy = -Math.abs(fish.vy); }
            return;
        }
        // Calculate distance to shark
        const deltaX = fish.x - sharkWorldX;
        const deltaY = fish.y - sharkWorldY;
        const distanceToShark = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        // Fish always flee when within range - no stationary "ring" around shark
        if (distanceToShark < fish.fleeDistance && distanceToShark > 0) {
            // Fish is fleeing - always move away from shark
            fish.isFleeing = true;
            
            // Calculate flee direction (away from shark)
            const fleeX = deltaX / distanceToShark;
            const fleeY = deltaY / distanceToShark;
            
            // Strong continuous flee movement - don't depend on shark movement
            const fleeStrength = Math.max(0.5, (fish.fleeDistance - distanceToShark) / fish.fleeDistance);
            fish.vx += fleeX * fish.speed * fleeStrength * 0.4;
            fish.vy += fleeY * fish.speed * fleeStrength * 0.4;
        } else {
            // Fish is swimming normally - slower, calmer movement
            fish.isFleeing = false;
            
            // Initialize fish properties if not set (reduced speeds)
            if (fish.baseSpeed === undefined) fish.baseSpeed = 0.3 + Math.random() * 0.2; // Much slower base speed
            if (fish.swimDirection === undefined) {
                // Bias toward horizontal movement (left or right)
                fish.swimDirection = (Math.random() > 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.3;
            }
            if (fish.depthOscillation === undefined) fish.depthOscillation = Math.random() * Math.PI * 2;
            if (fish.directionChangeTimer === undefined) fish.directionChangeTimer = Math.random() * 60;
            
            fish.directionChangeTimer++;
            
            // Much gentler swimming motion
            const horizontalBias = 0.8; // Favor horizontal movement
            const verticalSubtlety = 0.3; // Reduce vertical movement
            
            // Reduced movement intensity
            fish.vx += Math.cos(fish.swimDirection) * fish.baseSpeed * horizontalBias * 0.04; // Reduced from 0.1
            fish.vy += Math.sin(fish.swimDirection) * fish.baseSpeed * verticalSubtlety * 0.04;
            
            // Gentler depth oscillation
            fish.depthOscillation += 0.01; // Reduced from 0.02
            fish.vy += Math.sin(fish.depthOscillation) * 0.02; // Reduced from 0.05
            
            // Less frequent direction changes for calmer movement
            if (fish.directionChangeTimer > 60 + Math.random() * 180) { // Every 1-4 seconds (was 0.5-2)
                // Smaller direction adjustments
                const directionChange = (Math.random() - 0.5) * 0.2; // Reduced from 0.4
                fish.swimDirection += directionChange;
                
                // Keep direction mostly horizontal
                const normalizedDir = fish.swimDirection % (Math.PI * 2);
                if (normalizedDir > Math.PI * 0.17 && normalizedDir < Math.PI * 0.83) {
                    fish.swimDirection = (Math.random() > 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.3;
                } else if (normalizedDir > Math.PI * 1.17 && normalizedDir < Math.PI * 1.83) {
                    fish.swimDirection = (Math.random() > 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.3;
                }
                
                fish.directionChangeTimer = 0;
            }
            
            // Much less frequent direction reversals
            if (Math.random() < 0.0005) { // Reduced from 0.002
                fish.swimDirection += Math.PI; // Turn around
                fish.baseSpeed = 0.3 + Math.random() * 0.2; // New speed
            }
        }
        
        // Apply appropriate drag for fish state
        const dragFactor = fish.isFleeing ? 0.92 : 0.96; // More drag to slow down overall movement
        fish.vx *= dragFactor;
        fish.vy *= dragFactor;
        
        // Ensure gentle minimum movement when not fleeing
        if (!fish.isFleeing) {
            const minSpeed = 0.1; // Reduced minimum speed
            const currentSpeed = Math.sqrt(fish.vx * fish.vx + fish.vy * fish.vy);
            if (currentSpeed < minSpeed) {
                const pushDirection = fish.swimDirection || 0;
                fish.vx += Math.cos(pushDirection) * minSpeed * 0.3; // Gentler push
                fish.vy += Math.sin(pushDirection) * minSpeed * 0.1; // Less vertical push
            }
        } else {
            // For fleeing fish, stop very small movements to prevent jitter
            if (Math.abs(fish.vx) < 0.05) fish.vx = 0;
            if (Math.abs(fish.vy) < 0.05) fish.vy = 0;
        }
        
        // Limit maximum speed based on fish state
        const currentSpeed = Math.sqrt(fish.vx * fish.vx + fish.vy * fish.vy);
        const maxSpeed = fish.isFleeing ? fish.speed * 0.8 : fish.speed * 0.3; // Much slower normal swimming
        
        if (currentSpeed > maxSpeed) {
            fish.vx = (fish.vx / currentSpeed) * maxSpeed;
            fish.vy = (fish.vy / currentSpeed) * maxSpeed;
        }
        
        // Update fish position
        fish.x += fish.vx;
        fish.y += fish.vy;
        
        // Keep fish within ocean bounds
        const minY = world.surfaceY + 80;
        const maxY = world.bottomY - 80;
        
        if (fish.y < minY) {
            fish.y = minY;
            fish.vy = Math.abs(fish.vy); // Bounce down
        }
        if (fish.y > maxY) {
            fish.y = maxY;
            fish.vy = -Math.abs(fish.vy); // Bounce up
        }
    });
}

// Function to check if shark can eat fish and handle eating
function updateFishEating() {
    // Calculate shark's center position in world coordinates
    const sharkCenterWorldX = (shark.x + shark.width/2) - world.offsetX;
    const sharkCenterWorldY = (shark.y + shark.height/2) - world.offsetY;
    
    // Calculate shark's actual facing direction
    const angle = shark.direction * (Math.PI / 180);
    
    // Determine if shark is flipped (same logic as in drawShark)
    const isSwimmingLeft = Math.abs(angle) > Math.PI / 2;
    
    // Calculate mouth position based on shark's actual orientation
    let mouthWorldX, mouthWorldY;
    const mouthDistance = shark.width * 0.4; // Distance from center to mouth
    
    if (isSwimmingLeft) {
        // When shark is flipped, we need to mirror the mouth position
        // The mouth should be at the front when swimming left
        const flippedAngle = Math.PI - angle; // Mirror the angle like in drawing
        // Apply horizontal flip by negating the X offset
        mouthWorldX = sharkCenterWorldX - Math.cos(flippedAngle) * mouthDistance;
        mouthWorldY = sharkCenterWorldY + Math.sin(flippedAngle) * mouthDistance; // Full distance, not scaled
    } else {
        // Normal right-facing orientation - mouth at the front
        mouthWorldX = sharkCenterWorldX + Math.cos(angle) * mouthDistance;
        mouthWorldY = sharkCenterWorldY + Math.sin(angle) * mouthDistance; // Full distance, not scaled
    }
    
    // Check for fish within eating range (scales with shark size)
    const baseEatRadius = 30; // Base eating radius
    const eatRadius = baseEatRadius * shark.growthFactor; // Scale with shark size
    
    for (let i = fishPieces.length - 1; i >= 0; i--) {
        const fish = fishPieces[i];
        
        // Calculate distance from fish to shark's mouth
        const deltaX = fish.x - mouthWorldX;
        const deltaY = fish.y - mouthWorldY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        if (distance < eatRadius) {
            // Fish has been eaten!
            handleFishEaten(fish, i);
        }
    }
}

// Function to handle when a fish is eaten
function handleFishEaten(fish, fishIndex) {
    // Create blood effect at fish position
    createBloodEffect(fish.x, fish.y, fish.size);
    
    // Update game statistics
    gameStats.fishEaten++;
    
    // Calculate growth amount based on fish size and type
    let growthAmount;
    if (fish.color === '#FFD700') {
        // Slow fish (larger) provide more growth
        gameStats.slowFishEaten++;
        growthAmount = 0.02 + (fish.size / 500); // Base 0.02 + size-based bonus
        console.log(`🦈 Ate a slow fish! Total slow fish: ${gameStats.slowFishEaten}`);
    } else {
        // Fast fish (smaller) provide less growth but still some
        gameStats.fastFishEaten++;
        growthAmount = 0.015 + (fish.size / 600); // Slightly less growth
        console.log(`🦈 Ate a fast fish! Total fast fish: ${gameStats.fastFishEaten}`);
    }
    
    // Apply growth to shark
    shark.growthFactor += growthAmount;
    
    // Update shark dimensions based on growth factor
    shark.width = shark.baseWidth * shark.growthFactor;
    shark.height = shark.baseHeight * shark.growthFactor;
    
    console.log(`🦈 Shark grew! Growth factor: ${shark.growthFactor.toFixed(3)}, Size: ${shark.width.toFixed(1)}x${shark.height.toFixed(1)}`);
    console.log(`🦈 Total fish eaten: ${gameStats.fishEaten}`);
    
    // Create blood effect at fish position
    createBloodEffect(fish.x, fish.y, fish.size);
    
    // Remove the fish from the array
    fishPieces.splice(fishIndex, 1);
    
    // Here we can add more gameplay effects later:
    // - Particle effects
    // - Sound effects
    // - Score increases
    // - Special abilities based on size
}

// Function to draw a target where the mouse is
function drawMouseTarget() {
    // Only draw target if mouse is on screen
    if (!mouse.isOnScreen) return;
    
    // Draw a much more visible crosshair
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 3;
    
    // Outer crosshair
    ctx.beginPath();
    ctx.moveTo(mouse.x - 20, mouse.y);
    ctx.lineTo(mouse.x + 20, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 20);
    ctx.lineTo(mouse.x, mouse.y + 20);
    ctx.stroke();
    
    // Inner crosshair with different color
    ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)'; // Red center
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    ctx.moveTo(mouse.x - 8, mouse.y);
    ctx.lineTo(mouse.x + 8, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 8);
    ctx.lineTo(mouse.x, mouse.y + 8);
    ctx.stroke();
    
    // Center dot
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 2, 0, 2 * Math.PI);
    ctx.fill();
}
function drawShark() {
    // Save the current drawing state
    ctx.save();
    
    // Move to the shark's center for rotation
    ctx.translate(shark.x + shark.width/2, shark.y + shark.height/2);
    
    // Use the shark's current direction (in radians)
    let angle = shark.direction * (Math.PI / 180); // Convert from degrees to radians
    
    // Determine if shark should be flipped based on direction
    // Flip when swimming generally to the left (angle pointing left)
    const isSwimmingLeft = Math.abs(angle) > Math.PI / 2;
    
    if (isSwimmingLeft) {
        // Flip horizontally for left movement and adjust angle
        ctx.scale(-1, 1);
        // When flipped, we need to mirror the angle to keep the shark pointing correctly
        ctx.rotate(Math.PI - angle);
    } else {
        // Normal orientation for right movement
        ctx.rotate(angle);
    }
    
    // Draw the shark body (a simple oval/ellipse)
    ctx.fillStyle = '#404040'; // Dark gray for the shark
    ctx.beginPath();
    ctx.ellipse(0, 0, shark.width/2, shark.height/2, 0, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw the shark's dorsal fin on top (realistic swept-back shape)
    ctx.fillStyle = '#303030'; // Slightly darker gray
    ctx.beginPath();
    // Create a swept-back fin shape
    const finHeight = shark.height * 0.6; // Height of the fin
    const finWidth = shark.width * 0.3; // Width of the fin base
    const finTip = shark.height * 0.4; // How far the tip extends above the body
    
    // Start at the front of the fin base (leading edge)
    ctx.moveTo(finWidth/2, -shark.height/3);
    // Draw curved leading edge sweeping up and back to the tip
    ctx.quadraticCurveTo(finWidth/4, -shark.height/3 - finTip * 0.8, -finWidth/3, -shark.height/3 - finTip);
    // Draw straight trailing edge back down to the rear of the fin base
    ctx.lineTo(-finWidth/2, -shark.height/3);
    // Close the fin shape
    ctx.closePath();
    ctx.fill();
    
    // Draw the shark's pectoral fin (side fin)
    ctx.fillStyle = '#303030'; // Same darker gray as dorsal fin
    ctx.beginPath();
    // Create a swept-back pectoral fin shape (positioned on the side)
    const pectoralFinLength = shark.width * 0.25; // Length of the pectoral fin
    const pectoralFinWidth = shark.height * 0.3; // Width of the fin base
    const pectoralFinOffset = shark.width * 0.1; // How far forward from center
    
    // Start at the front of the pectoral fin base (leading edge)
    ctx.moveTo(pectoralFinOffset, shark.height/4);
    // Draw curved leading edge sweeping back and out
    ctx.quadraticCurveTo(pectoralFinOffset - pectoralFinLength * 0.3, shark.height/4 + pectoralFinWidth * 0.7, 
                        pectoralFinOffset - pectoralFinLength, shark.height/4 + pectoralFinWidth);
    // Draw straight trailing edge back to the rear of the fin base
    ctx.lineTo(pectoralFinOffset - pectoralFinLength * 0.6, shark.height/4);
    // Close the pectoral fin shape
    ctx.closePath();
    ctx.fill();
    
    // Draw the shark's tail (scaled with growth)
    ctx.fillStyle = '#404040';
    ctx.beginPath();
    const tailLength = shark.width * 0.19; // Scale tail length with shark width
    const tailHeight = shark.height * 0.25; // Scale tail height with shark height
    ctx.moveTo(-shark.width/2, 0);
    ctx.lineTo(-shark.width/2 - tailLength, -tailHeight);
    ctx.lineTo(-shark.width/2 - tailLength, tailHeight);
    ctx.closePath();
    ctx.fill();
    
    // Draw the shark's eye (scaled with growth)
    const eyeSize = shark.height * 0.1; // Scale eye size with shark height
    const eyeOffset = shark.width * 0.25; // Scale eye position with shark width
    const eyeVerticalOffset = shark.height * 0.125; // Scale vertical position
    
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(eyeOffset, -eyeVerticalOffset, eyeSize, 0, 2 * Math.PI);
    ctx.fill();
    
    // Draw the pupil (scaled with growth)
    const pupilSize = eyeSize * 0.5; // Pupil is half the eye size
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(eyeOffset, -eyeVerticalOffset, pupilSize, 0, 2 * Math.PI);
    ctx.fill();
    
    // Restore the drawing state
    ctx.restore();
}

// Function to draw the infinite ocean world
function drawBackground() {
    const dims = getGameDimensions();
    
    // Calculate visible sky area
    const skyTop = Math.min(0, world.surfaceY + world.offsetY);
    const skyBottom = world.surfaceY + world.offsetY;
    
    // Draw sky (only if visible)
    if (skyBottom > 0) {
        const skyGradient = ctx.createLinearGradient(0, skyTop, 0, skyBottom);
        skyGradient.addColorStop(0, '#87CEEB');  // Light blue sky
        skyGradient.addColorStop(1, '#B0E0E6');  // Powder blue at horizon
        
        ctx.fillStyle = skyGradient;
        ctx.fillRect(0, skyTop, dims.width, skyBottom - skyTop);
    }
    
    // Calculate visible water area
    const waterTop = Math.max(0, world.surfaceY + world.offsetY);
    const waterBottom = Math.min(dims.height, world.bottomY + world.offsetY);
    
    // Draw water/ocean (only if visible)
    if (waterBottom > waterTop) {
        const waterGradient = ctx.createLinearGradient(0, waterTop, 0, waterBottom);
        waterGradient.addColorStop(0, '#40E0D0');   // Turquoise at surface
        waterGradient.addColorStop(0.2, '#1E90FF'); // Dodger blue
        waterGradient.addColorStop(0.6, '#0066CC'); // Deep blue
        waterGradient.addColorStop(1, '#003366');   // Very deep blue
        
        ctx.fillStyle = waterGradient;
        ctx.fillRect(0, waterTop, dims.width, waterBottom - waterTop);
    }
    
    // Calculate visible sand area
    const sandTop = Math.max(0, world.bottomY + world.offsetY);
    const sandBottom = dims.height;
    
    // Draw ocean floor/sand (only if visible)
    if (sandBottom > sandTop) {
        const sandGradient = ctx.createLinearGradient(0, sandTop, 0, sandBottom);
        sandGradient.addColorStop(0, '#F4A460');  // Sandy brown
        sandGradient.addColorStop(1, '#D2691E');  // Chocolate
        
        ctx.fillStyle = sandGradient;
        ctx.fillRect(0, sandTop, dims.width, sandBottom - sandTop);
    }
    
    // Draw water surface line with animated waves (only if visible)
    const surfaceY = world.surfaceY + world.offsetY;
    if (surfaceY >= 0 && surfaceY <= dims.height) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        ctx.moveTo(0, surfaceY);
        for (let x = 0; x <= dims.width; x += 10) {
            const waveHeight = Math.sin((x + world.offsetX) * 0.02 + Date.now() * 0.003) * 3;
            ctx.lineTo(x, surfaceY + waveHeight);
        }
        ctx.stroke();
    }
}

// Function to draw seaweed
function drawSeaweed() {
    const dims = getGameDimensions();
    
    seaweedPieces.forEach(seaweed => {
        // Calculate seaweed position relative to world offset
        const drawX = seaweed.x + world.offsetX;
        const drawY = seaweed.y + world.offsetY;
        
        // Only draw if on screen (with some margin)
        if (drawX > -50 && drawX < dims.width + 50 && drawY > -50 && drawY < dims.height + 50) {
            // Update sway animation
            seaweed.sway += seaweed.speed;
            
            // Draw seaweed stalk
            ctx.strokeStyle = '#228B22'; // Forest green
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(drawX, drawY + seaweed.height);
            
            // Create swaying effect
            const segments = 8;
            for (let i = 1; i <= segments; i++) {
                const segmentY = drawY + seaweed.height - (seaweed.height / segments) * i;
                const swayOffset = Math.sin(seaweed.sway + i * 0.5) * (i * 2);
                ctx.lineTo(drawX + swayOffset, segmentY);
            }
            ctx.stroke();
            
            // Draw seaweed fronds
            ctx.fillStyle = '#32CD32'; // Lime green
            for (let i = 2; i < segments; i += 2) {
                const segmentY = drawY + seaweed.height - (seaweed.height / segments) * i;
                const swayOffset = Math.sin(seaweed.sway + i * 0.5) * (i * 2);
                
                ctx.beginPath();
                ctx.ellipse(drawX + swayOffset - 8, segmentY, 6, 12, 0, 0, 2 * Math.PI);
                ctx.fill();
                
                ctx.beginPath();
                ctx.ellipse(drawX + swayOffset + 8, segmentY, 6, 12, 0, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    });
}

// Function to draw fish
function drawFish(type = 'normal') {
    const dims = getGameDimensions();
    // First pass: draw green fish (type: 'green')
    fishPieces.forEach(fish => {
        if (fish.type === type && fish.type === 'green') {
            // Calculate fish position relative to world offset
            const drawX = fish.x + world.offsetX;
            const drawY = fish.y + world.offsetY;

            // Only draw if on screen (with some margin)
            if (drawX > -50 && drawX < dims.width + 50 && drawY > -50 && drawY < dims.height + 50) {
                // Save context for rotation
                ctx.save();

                // Move to fish center
                ctx.translate(drawX, drawY);

                // Calculate fish facing direction based on velocity, but only if moving significantly
                const speed = Math.sqrt(fish.vx * fish.vx + fish.vy * fish.vy);
                if (speed > 0.1) { // Only rotate if moving fast enough
                    // Store the current angle for smoother transitions
                    if (!fish.currentAngle) fish.currentAngle = 0;

                    const targetAngle = Math.atan2(fish.vy, fish.vx);
                    // Smoothly interpolate to the new angle to avoid jittery rotation
                    fish.currentAngle = fish.currentAngle * 0.9 + targetAngle * 0.1;
                    ctx.rotate(fish.currentAngle);
                } else if (fish.currentAngle) {
                    // When nearly stopped, maintain last rotation
                    ctx.rotate(fish.currentAngle);
                }

                // Draw fish body (simple oval)
                ctx.fillStyle = fish.color;
                ctx.beginPath();
                ctx.ellipse(0, 0, fish.size, fish.size * 0.6, 0, 0, 2 * Math.PI);
                ctx.fill();

                // Draw fish tail
                ctx.fillStyle = fish.color;
                ctx.beginPath();
                ctx.moveTo(-fish.size, 0);
                ctx.lineTo(-fish.size * 1.5, -fish.size * 0.4);
                ctx.lineTo(-fish.size * 1.5, fish.size * 0.4);
                ctx.closePath();
                ctx.fill();

                // Draw fish eye
                ctx.fillStyle = 'red';
                ctx.beginPath();
                ctx.arc(fish.size * 0.3, -fish.size * 0.0, fish.size * 0.2, 0, 2 * Math.PI);
                ctx.fill();

                // Draw fish pupil
                ctx.fillStyle = 'pink';
                ctx.beginPath();
                ctx.arc(fish.size * 0.3, -fish.size * 0.0, fish.size * 0.1, 0, 2 * Math.PI);
                ctx.fill();

                ctx.restore();
            }
        }
    });
     
    // Second pass: draw all other fish
    fishPieces.forEach(fish => {
        if (fish.type === type && fish.type === 'normal') {
            // Calculate fish position relative to world offset
            const drawX = fish.x + world.offsetX;
            const drawY = fish.y + world.offsetY;

            // Only draw if on screen (with some margin)
            if (drawX > -50 && drawX < dims.width + 50 && drawY > -50 && drawY < dims.height + 50) {
                // Save context for rotation
                ctx.save();

                ctx.translate(drawX, drawY);

                // Calculate fish facing direction based on velocity, but only if moving significantly
                const speed = Math.sqrt(fish.vx * fish.vx + fish.vy * fish.vy);
                if (speed > 0.1) { // Only rotate if moving fast enough
                    // Store the current angle for smoother transitions
                    if (!fish.currentAngle) fish.currentAngle = 0;

                    const targetAngle = Math.atan2(fish.vy, fish.vx);
                    // Smoothly interpolate to the new angle to avoid jittery rotation
                    fish.currentAngle = fish.currentAngle * 0.9 + targetAngle * 0.1;
                    ctx.rotate(fish.currentAngle);
                } else if (fish.currentAngle) {
                    // When nearly stopped, maintain last rotation
                    ctx.rotate(fish.currentAngle);
                }

                // Draw fish body (simple oval)
                ctx.fillStyle = fish.color;
                ctx.beginPath();
                ctx.ellipse(0, 0, fish.size, fish.size * 0.6, 0, 0, 2 * Math.PI);
                ctx.fill();
                
                // Draw fish tail
                ctx.fillStyle = fish.color;
                ctx.beginPath();
                ctx.moveTo(-fish.size, 0);
                ctx.lineTo(-fish.size * 1.5, -fish.size * 0.4);
                ctx.lineTo(-fish.size * 1.5, fish.size * 0.4);
                ctx.closePath();
                ctx.fill();

                // Draw fish eye
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(fish.size * 0.3, -fish.size * 0.0, fish.size * 0.2, 0, 2 * Math.PI);
                ctx.fill();

                // Draw fish pupil
                ctx.fillStyle = 'black';
                ctx.beginPath();
                ctx.arc(fish.size * 0.3, -fish.size * 0.0, fish.size * 0.1, 0, 2 * Math.PI);
                ctx.fill();

                ctx.restore();
            }
        }
    });
}

// Debug function to visualize mouth position (can be enabled/disabled)
function drawDebugMouth() {
    // Only draw if debug setting is enabled
    if (!debugSettings.showMouthPosition) return;
    
    // Calculate shark's center position in world coordinates
    const sharkCenterWorldX = (shark.x + shark.width/2) - world.offsetX;
    const sharkCenterWorldY = (shark.y + shark.height/2) - world.offsetY;
    
    // Calculate shark's actual facing direction (same as eating function)
    const angle = shark.direction * (Math.PI / 180);
    const isSwimmingLeft = Math.abs(angle) > Math.PI / 2;
    
    // Calculate mouth position (same logic as eating function)
    let mouthWorldX, mouthWorldY;
    const mouthDistance = shark.width * 0.4; // Distance from center to mouth
    
    if (isSwimmingLeft) {
        // When shark is flipped, mouth should be at the front when swimming left
        const flippedAngle = Math.PI - angle;
        mouthWorldX = sharkCenterWorldX - Math.cos(flippedAngle) * mouthDistance;
        mouthWorldY = sharkCenterWorldY + Math.sin(flippedAngle) * mouthDistance; // Full distance
    } else {
        // Normal right-facing orientation - mouth at the front
        mouthWorldX = sharkCenterWorldX + Math.cos(angle) * mouthDistance;
        mouthWorldY = sharkCenterWorldY + Math.sin(angle) * mouthDistance; // Full distance
    }
    
    // Convert to screen coordinates
    const mouthScreenX = mouthWorldX + world.offsetX;
    const mouthScreenY = mouthWorldY + world.offsetY;
    
    // Draw mouth debug circle (scales with shark size)
    const dims = getGameDimensions();
    if (mouthScreenX >= -50 && mouthScreenX <= dims.width + 50 && 
        mouthScreenY >= -50 && mouthScreenY <= dims.height + 50) {
        const baseEatRadius = 30; // Base eating radius
        const eatRadius = baseEatRadius * shark.growthFactor; // Scale with shark size
        
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mouthScreenX, mouthScreenY, eatRadius, 0, 2 * Math.PI);
        ctx.stroke();
        
        // Draw center dot
        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.beginPath();
        ctx.arc(mouthScreenX, mouthScreenY, 3, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
    }
}

// Main game loop - this runs continuously to update and draw the game
function gameLoop() {
    try {
        const dims = getGameDimensions();
        
        // Clear the screen
        ctx.clearRect(0, 0, dims.width, dims.height);
        
        // Update and draw everything in order
        updateFish();
        updateWorld();
        updateFishEating();
        updateBloodParticles();
        drawBackground();
        drawFish('green'); // Draw green fish first for layering
        drawSeaweed();
        drawFish('normal'); // Draw normal fish on top
        drawShark();
        drawDebugMouth(); // Optional debug visualization (controlled by debugSettings.showMouthPosition)
        drawMouseTarget();
        drawBloodParticles();
        
        // Call this function again in the next frame
        requestAnimationFrame(gameLoop);
    } catch (error) {
        console.error('Game loop error:', error);
        // Try to restart the game loop after a brief delay
        setTimeout(() => requestAnimationFrame(gameLoop), 100);
    }
}

// Handle window resize
window.addEventListener('resize', function() {
    resizeCanvas();
    initializeGame(); // Reinitialize positions for new dimensions
});

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Make sure canvas is ready
    if (!canvas || !ctx) {
        console.error('Canvas or context not available');
        return;
    }
    
    // Start the game!
    console.log("🦈 Infinite Ocean Adventure Starting! Move your mouse to explore the depths!");
    gameLoop();
});
