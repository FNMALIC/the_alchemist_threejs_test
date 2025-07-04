// environment.js - Creates a living environment for the scene
import * as THREE from 'three';

export class Environment {
    constructor(scene) {
        this.scene = scene;
        this.elements = [];
        this.ambientParticles = null;
        this.floatingLights = [];
        this.grassPatches = [];
        this.fogEffect = null;
        this.timeOffset = Math.random() * 1000;
    }

    // Initialize the complete environment
    init() {
        this.createTerrain();
        this.createVegetation();
        // this.createAmbientParticles();
        // this.createFloatingLights();
        // this.createFog();
        // this.createSkybox();
    }
    createTree(x, z, height) {
        const treeGroup = new THREE.Group();

        // Tree trunk
        const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.3, height, 8);
        const trunkMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B4513,
            roughness: 0.9
        });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = height / 2;
        treeGroup.add(trunk);

        // Tree foliage (multiple layers for fuller look)
        const foliageColor = new THREE.Color(0x2d4c1e);
        const foliageMaterial = new THREE.MeshStandardMaterial({
            color: foliageColor,
            roughness: 0.8
        });

        const foliageHeight = height * 1.5;
        const foliageSize = height * 0.8;

        for (let i = 0; i < 3; i++) {
            const coneGeometry = new THREE.ConeGeometry(
                foliageSize * (1 - i * 0.2),
                foliageHeight,
                8
            );
            const cone = new THREE.Mesh(coneGeometry, foliageMaterial);
            cone.position.y = height + foliageHeight * 0.3 * i;
            treeGroup.add(cone);
        }

        treeGroup.position.set(x, 0, z);
        this.scene.add(treeGroup);
        this.elements.push(treeGroup);

        return treeGroup;
    };

    // Create grass patch function
    createGrassPatch(x, z, size) {
        const grassGroup = new THREE.Group();
        const grassBladeCount = Math.floor(size * 20);

        // Create individual grass blades
        for (let i = 0; i < grassBladeCount; i++) {
            // Random position within the patch
            const offsetX = (Math.random() - 0.5) * size;
            const offsetZ = (Math.random() - 0.5) * size;

            // Random height and width
            const height = 0.2 + Math.random() * 0.3;
            const width = 0.02 + Math.random() * 0.03;

            // Create a simple blade with a plane
            const bladeGeometry = new THREE.PlaneGeometry(width, height);

            // Vary the grass color slightly
            const hue = 0.3 + (Math.random() * 0.1);
            const saturation = 0.5 + (Math.random() * 0.3);
            const lightness = 0.3 + (Math.random() * 0.2);
            const grassColor = new THREE.Color().setHSL(hue, saturation, lightness);

            const bladeMaterial = new THREE.MeshStandardMaterial({
                color: grassColor,
                side: THREE.DoubleSide,
                transparent: true,
                alphaTest: 0.5
            });

            const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);

            // Position and rotate the blade
            blade.position.set(x + offsetX, height / 2, z + offsetZ);
            blade.rotation.y = Math.random() * Math.PI;

            // Slightly bend the grass blade
            blade.rotation.x = (Math.random() * 0.2) - 0.1;

            // Add to scene
            this.scene.add(blade);
            grassGroup.add(blade);

            // Store reference for animation
            blade.userData = {
                originalHeight: height,
                originalY: height / 2,
                waveSpeed: 0.5 + Math.random() * 0.5,
                waveAmplitude: 0.05 + Math.random() * 0.05,
                phaseOffset: Math.random() * Math.PI * 2
            };
        }

        this.grassPatches.push(grassGroup);
        return grassGroup;
    };

    // Create rock function
    createRock(x, z, size) {
        const rockGeometry = new THREE.DodecahedronGeometry(size, 1);

        // Deform the rock a bit to make it look more natural
        const vertices = rockGeometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            vertices[i] += (Math.random() - 0.5) * size * 0.2;
            vertices[i + 1] += (Math.random() - 0.5) * size * 0.2;
            vertices[i + 2] += (Math.random() - 0.5) * size * 0.2;
        }

        rockGeometry.computeVertexNormals();

        // Create material with rocky texture
        const rockColor = new THREE.Color(0x666666);
        rockColor.offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);

        const rockMaterial = new THREE.MeshStandardMaterial({
            color: rockColor,
            roughness: 0.8,
            metalness: 0.2
        });

        const rock = new THREE.Mesh(rockGeometry, rockMaterial);
        rock.position.set(x, size / 2, z);
        this.scene.add(rock);
        this.elements.push(rock);

        return rock;
    };

    // Create mushroom function
    createMushroom(x, z, size) {
        const mushroomGroup = new THREE.Group();

        // Stem
        const stemHeight = size * 0.6;
        const stemRadius = size * 0.15;
        const stemGeometry = new THREE.CylinderGeometry(
            stemRadius * 0.8, stemRadius, stemHeight, 8
        );
        const stemMaterial = new THREE.MeshStandardMaterial({
            color: 0xe0e0e0,
            roughness: 0.7
        });
        const stem = new THREE.Mesh(stemGeometry, stemMaterial);
        stem.position.y = stemHeight / 2;
        mushroomGroup.add(stem);

        // Cap
        const capRadius = size * 0.4;
        const capHeight = size * 0.3;
        const capGeometry = new THREE.SphereGeometry(capRadius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);

        // Randomly choose between red and other colors
        let capColor;
        if (Math.random() > 0.7) {
            capColor = new THREE.Color(0xaa2222); // Red
        } else {
            // Random earthy tones
            const hue = 0.05 + Math.random() * 0.1; // Browns and tans
            const saturation = 0.3 + Math.random() * 0.4;
            const lightness = 0.3 + Math.random() * 0.2;
            capColor = new THREE.Color().setHSL(hue, saturation, lightness);
        }

        const capMaterial = new THREE.MeshStandardMaterial({
            color: capColor,
            roughness: 0.8
        });

        const cap = new THREE.Mesh(capGeometry, capMaterial);
        cap.position.y = stemHeight;
        cap.scale.set(1, 0.7, 1); // Flatten the cap a bit
        mushroomGroup.add(cap);

        // Add spots to red mushrooms
        if (capColor.r > 0.5 && capColor.g < 0.3) {
            const spotCount = Math.floor(Math.random() * 5) + 3;
            for (let i = 0; i < spotCount; i++) {
                const spotSize = size * (0.05 + Math.random() * 0.05);
                const spotGeometry = new THREE.CircleGeometry(spotSize, 8);
                const spotMaterial = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    side: THREE.DoubleSide
                });
                const spot = new THREE.Mesh(spotGeometry, spotMaterial);

                // Position on cap
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * capRadius * 0.7;
                spot.position.set(
                    Math.cos(angle) * radius,
                    stemHeight + 0.01,
                    Math.sin(angle) * radius
                );

                spot.rotation.x = -Math.PI / 2;
                mushroomGroup.add(spot);
            }
        }

        mushroomGroup.position.set(x, 0, z);
        this.scene.add(mushroomGroup);
        this.elements.push(mushroomGroup);

        return mushroomGroup;
    };

    // Create flower function
    createFlower(x, z)  {
        const flowerGroup = new THREE.Group();

        // Stem
        const stemHeight = 0.3 + Math.random() * 0.2;
        const stemGeometry = new THREE.CylinderGeometry(0.01, 0.01, stemHeight, 8);
        const stemMaterial = new THREE.MeshStandardMaterial({
            color: 0x3d7c25,
            roughness: 0.8
        });
        const stem = new THREE.Mesh(stemGeometry, stemMaterial);
        stem.position.y = stemHeight / 2;
        flowerGroup.add(stem);

        // Flower head - choose random color
        const hue = Math.random();
        const saturation = 0.7 + Math.random() * 0.3;
        const lightness = 0.5 + Math.random() * 0.3;
        const flowerColor = new THREE.Color().setHSL(hue, saturation, lightness);

        const petalCount = Math.floor(Math.random() * 3) + 5;
        const petalLength = 0.08 + Math.random() * 0.05;
        const petalWidth = 0.04 + Math.random() * 0.03;

        for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * Math.PI * 2;
            const petalGeometry = new THREE.PlaneGeometry(petalWidth, petalLength);
            const petalMaterial = new THREE.MeshStandardMaterial({
                color: flowerColor,
                side: THREE.DoubleSide,
                transparent: true,
                alphaTest: 0.5
            });

            const petal = new THREE.Mesh(petalGeometry, petalMaterial);
            petal.position.set(
                Math.cos(angle) * (petalLength / 2),
                stemHeight,
                Math.sin(angle) * (petalLength / 2)
            );

            petal.rotation.x = -Math.PI / 2;
            petal.rotation.z = angle;
            flowerGroup.add(petal);
        }

        // Flower center
        const centerGeometry = new THREE.SphereGeometry(0.03, 8, 8);
        const centerMaterial = new THREE.MeshStandardMaterial({
            color: 0xffff00,
            roughness: 0.5
        });
        const center = new THREE.Mesh(centerGeometry, centerMaterial);
        center.position.y = stemHeight;
        flowerGroup.add(center);

        flowerGroup.position.set(x, 0, z);
        this.scene.add(flowerGroup);
        this.elements.push(flowerGroup);

        return flowerGroup;
    };


    // Create an uneven terrain with hills and valleys
    createTerrain() {
        // Create a ground plane with displacement
        const groundSize = 50;
        const groundResolution = 128;
        const groundGeometry = new THREE.PlaneGeometry(
            groundSize, groundSize,
            groundResolution - 1, groundResolution - 1
        );

        // Apply displacement to create hills and valleys
        const vertices = groundGeometry.attributes.position.array;
        for (let i = 0; i < vertices.length; i += 3) {
            // Skip the very center area to keep it flat for gameplay
            const x = vertices[i];
            const z = vertices[i + 2];
            const distFromCenter = Math.sqrt(x * x + z * z);

            if (distFromCenter > 8) {
                // Apply perlin-like noise for natural-looking terrain
                const xNorm = x / groundSize;
                const zNorm = z / groundSize;

                // Multiple frequency noise for more natural terrain
                const noise1 = this.simpleNoise(xNorm * 2, zNorm * 2) * 1.5;
                const noise2 = this.simpleNoise(xNorm * 5, zNorm * 5) * 0.5;
                const noise3 = this.simpleNoise(xNorm * 15, zNorm * 15) * 0.2;

                const totalNoise = noise1 + noise2 + noise3;

                // Gradually increase height as we move away from center
                const heightFactor = Math.min(1, (distFromCenter - 8) / 15);
                vertices[i + 1] = totalNoise * 2 * heightFactor;
            }
        }

        // Update the geometry after modifying vertices
        groundGeometry.computeVertexNormals();

        // Create material with grass texture
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x3b5e2b,
            roughness: 0.8,
            metalness: 0.1,
            flatShading: false,
            side: THREE.DoubleSide
        });

        // Create mesh and add to scene
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.5; // Slightly below player level
        this.scene.add(ground);
        this.elements.push(ground);
    }

    // Create various vegetation elements
    createVegetation() {
        // Define an area for vegetation placement
        const areaSize = 10; // Adjust size as needed
        const numTrees = 5;
        const numGrassPatches = 3;
        const numRocks = 3;
        const numMushrooms = 4;
        const numFlowers = 6;

        // Create trees
        for (let i = 0; i < numTrees; i++) {
            const x = (Math.random() - 0.5) * areaSize;
            const z = (Math.random() - 0.5) * areaSize;
            const height = 2 + Math.random(); // Random tree height
            this.createTree(x, z, height);
        }

        // Create grass patches
        for (let i = 0; i < numGrassPatches; i++) {
            const x = (Math.random() - 0.5) * areaSize;
            const z = (Math.random() - 0.5) * areaSize;
            const size = 2 + Math.random() * 3;
            this.createGrassPatch(x, z, size);
        }

        // Create rocks
        for (let i = 0; i < numRocks; i++) {
            const x = (Math.random() - 0.5) * areaSize;
            const z = (Math.random() - 0.5) * areaSize;
            const size = 0.5 + Math.random();
            this.createRock(x, z, size);
        }

        // Create mushrooms
        for (let i = 0; i < numMushrooms; i++) {
            const x = (Math.random() - 0.5) * areaSize;
            const z = (Math.random() - 0.5) * areaSize;
            const size = 0.3 + Math.random() * 0.5;
            this.createMushroom(x, z, size);
        }

        // Create flowers
        for (let i = 0; i < numFlowers; i++) {
            const x = (Math.random() - 0.5) * areaSize;
            const z = (Math.random() - 0.5) * areaSize;
            this.createFlower(x, z);
        }
    }


    simpleNoise(x, z) {
        return Math.sin(x * 3.14) * Math.cos(z * 3.14);
    }

}
