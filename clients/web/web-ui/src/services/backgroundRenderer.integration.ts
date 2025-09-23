/**
 * Background Renderer Integration
 * Rust WebGL integration for performance-optimized background rendering
 * with texture atlasing, LOD system, and weather effects
 */

import {
    type BackgroundConfiguration,
    type BackgroundLayer,
    type PerformanceMetrics,
    type WeatherEffect
} from './performanceOptimizedBackground.service';

export interface LODLevel {
  minZoom: number;
  maxZoom: number;
  textureUrl?: string;
  scale: number;
  quality: 'low' | 'medium' | 'high' | 'ultra';
}

export interface ExtendedPerformanceMetrics extends PerformanceMetrics {
  lastUpdate: number;
}

export interface RustWebGLRenderer {
  // Core WebGL methods
  createTexture(width: number, height: number, data: Uint8Array | null): number;
  updateTexture(textureId: number, data: Uint8Array): void;
  deleteTexture(textureId: number): void;
  createShaderProgram(vertexShader: string, fragmentShader: string): number;
  useShaderProgram(programId: number): void;
  setUniform(location: string, value: number | number[]): void;
  
  // Background-specific methods
  createBackgroundLayer(config: BackgroundLayerConfig): number;
  updateBackgroundLayer(layerId: number, updates: Partial<BackgroundLayerConfig>): void;
  removeBackgroundLayer(layerId: number): void;
  setLayerVisibility(layerId: number, visible: boolean): void;
  setLayerOpacity(layerId: number, opacity: number): void;
  
  // Texture atlas management
  createTextureAtlas(width: number, height: number): number;
  addToTextureAtlas(atlasId: number, textureData: Uint8Array, width: number, height: number): TextureAtlasEntry;
  removeFromTextureAtlas(atlasId: number, entryId: string): void;
  optimizeTextureAtlas(atlasId: number): void;
  
  // LOD system
  setLODLevel(layerId: number, lodLevel: number): void;
  updateLODTexture(layerId: number, lodLevel: number, textureData: Uint8Array): void;
  enableAutoLOD(enabled: boolean): void;
  
  // Weather effects
  createWeatherEffect(config: WeatherEffectConfig): number;
  updateWeatherEffect(effectId: number, updates: Partial<WeatherEffectConfig>): void;
  removeWeatherEffect(effectId: number): void;
  
  // Performance monitoring
  getDrawCallCount(): number;
  getTextureMemoryUsage(): number;
  getFrameTime(): number;
  enablePerformanceMetrics(enabled: boolean): void;
  
  // Rendering
  renderBackground(viewMatrix: number[], projectionMatrix: number[], zoom: number): void;
  setViewport(x: number, y: number, width: number, height: number): void;
  clear(r: number, g: number, b: number, a: number): void;
}

export interface BackgroundLayerConfig {
  id: string;
  name: string;
  textureUrl: string;
  textureData?: Uint8Array;
  width: number;
  height: number;
  opacity: number;
  parallaxFactor: number;
  repeat: 'repeat' | 'clamp' | 'mirror';
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light';
  animated: boolean;
  animationSpeed?: number;
  animationFrames?: string[];
  visible: boolean;
  zIndex: number;
  lodLevels?: LODLevel[];
}

export interface WeatherEffectConfig {
  id: string;
  type: 'rain' | 'snow' | 'fog' | 'storm' | 'wind' | 'particles';
  intensity: number;
  direction: { x: number; y: number };
  speed: number;
  particleCount: number;
  opacity: number;
  color: string;
  textureUrl?: string;
  enabled: boolean;
}

export interface TextureAtlasEntry {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  textureCoords: {
    u1: number;
    v1: number;
    u2: number;
    v2: number;
  };
}

/**
 * Background rendering shaders optimized for WebGL2
 */
export const BACKGROUND_SHADERS = {
  // Vertex shader for background layers with parallax support
  vertexShader: `#version 300 es
    precision highp float;
    
    in vec3 a_position;
    in vec2 a_texCoord;
    in float a_layerIndex;
    
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform float u_parallaxFactors[16];
    uniform float u_zoom;
    uniform vec2 u_viewportSize;
    uniform float u_time;
    
    out vec2 v_texCoord;
    out float v_layerIndex;
    out vec2 v_screenPos;
    
    void main() {
      int layerIdx = int(a_layerIndex);
      float parallaxFactor = u_parallaxFactors[layerIdx];
      
      // Apply parallax effect
      vec3 parallaxPos = a_position;
      parallaxPos.xy *= parallaxFactor;
      
      // Transform to screen space
      vec4 worldPos = u_viewMatrix * vec4(parallaxPos, 1.0);
      gl_Position = u_projectionMatrix * worldPos;
      
      // Pass texture coordinates with parallax offset
      v_texCoord = a_texCoord;
      v_texCoord.x += (1.0 - parallaxFactor) * worldPos.x / u_viewportSize.x;
      v_texCoord.y += (1.0 - parallaxFactor) * worldPos.y / u_viewportSize.y;
      
      v_layerIndex = a_layerIndex;
      v_screenPos = gl_Position.xy / gl_Position.w;
    }
  `,
  
  // Fragment shader with multi-texture atlas support
  fragmentShader: `#version 300 es
    precision highp float;
    
    in vec2 v_texCoord;
    in float v_layerIndex;
    in vec2 v_screenPos;
    
    uniform sampler2D u_textureAtlas;
    uniform vec4 u_textureCoords[16]; // (u1, v1, u2, v2) for each layer
    uniform float u_opacities[16];
    uniform int u_blendModes[16];
    uniform float u_animationOffsets[16];
    uniform float u_time;
    uniform vec3 u_ambientColor;
    uniform float u_globalOpacity;
    
    out vec4 fragColor;
    
    vec4 getTextureColor(int layerIdx, vec2 texCoord) {
      vec4 coords = u_textureCoords[layerIdx];
      vec2 atlasCoord = mix(coords.xy, coords.zw, texCoord);
      
      // Add animation offset if needed
      if (u_animationOffsets[layerIdx] > 0.0) {
        float animOffset = u_time * u_animationOffsets[layerIdx];
        atlasCoord.x += sin(animOffset) * 0.01;
        atlasCoord.y += cos(animOffset) * 0.01;
      }
      
      return texture(u_textureAtlas, atlasCoord);
    }
    
    vec4 blendColors(vec4 base, vec4 overlay, int blendMode) {
      switch (blendMode) {
        case 0: // normal
          return mix(base, overlay, overlay.a);
        case 1: // multiply
          return base * overlay;
        case 2: // screen
          return 1.0 - (1.0 - base) * (1.0 - overlay);
        case 3: // overlay
          return base.r < 0.5 ? 2.0 * base * overlay : 1.0 - 2.0 * (1.0 - base) * (1.0 - overlay);
        case 4: // soft-light
          return base * (overlay + (2.0 * overlay - 1.0) * (base - base * base));
        default:
          return mix(base, overlay, overlay.a);
      }
    }
    
    void main() {
      int layerIdx = int(v_layerIndex);
      vec4 color = getTextureColor(layerIdx, v_texCoord);
      
      // Apply layer opacity
      color.a *= u_opacities[layerIdx];
      
      // Apply ambient color tinting
      color.rgb *= u_ambientColor;
      
      // Apply global opacity
      color.a *= u_globalOpacity;
      
      fragColor = color;
    }
  `,
  
  // Weather effects shader
  weatherVertexShader: `#version 300 es
    precision highp float;
    
    in vec3 a_position;
    in vec2 a_velocity;
    in float a_life;
    in float a_size;
    
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform float u_time;
    uniform vec2 u_gravity;
    uniform float u_intensity;
    
    out float v_life;
    out vec2 v_texCoord;
    
    void main() {
      // Update particle position based on velocity and time
      vec3 pos = a_position;
      pos.xy += a_velocity * u_time * u_intensity;
      pos.xy += u_gravity * u_time * u_time * 0.5;
      
      // Apply size based on life
      float lifeRatio = clamp(v_life, 0.0, 1.0);
      float size = a_size * lifeRatio;
      
      vec4 worldPos = u_viewMatrix * vec4(pos, 1.0);
      gl_Position = u_projectionMatrix * worldPos;
      gl_PointSize = size;
      
      v_life = a_life;
      v_texCoord = vec2(0.5, 0.5);
    }
  `,
  
  weatherFragmentShader: `#version 300 es
    precision highp float;
    
    in float v_life;
    in vec2 v_texCoord;
    
    uniform sampler2D u_particleTexture;
    uniform vec4 u_particleColor;
    uniform float u_opacity;
    
    out vec4 fragColor;
    
    void main() {
      // Create circular particle
      vec2 coord = gl_PointCoord - vec2(0.5);
      float dist = length(coord);
      if (dist > 0.5) discard;
      
      // Fade based on distance from center and life
      float alpha = (1.0 - dist * 2.0) * v_life * u_opacity;
      
      vec4 color = u_particleColor;
      color.a *= alpha;
      
      fragColor = color;
    }
  `
};

/**
 * Background renderer integration class
 * Manages communication between TypeScript frontend and Rust WebGL backend
 */
export class BackgroundRendererIntegration {
  private rustRenderer: RustWebGLRenderer;
  private textureAtlases: Map<string, number> = new Map();
  private layerConfigs: Map<string, BackgroundLayerConfig> = new Map();
  private weatherEffects: Map<string, number> = new Map();
  private shaderPrograms: Map<string, number> = new Map();
  private performanceMetrics: ExtendedPerformanceMetrics = {
    fps: 0,
    frameTime: 0,
    drawCalls: 0,
    backgroundLayers: 0,
    lodSwitches: 0,
    textureMemory: 0,
    triangles: 0,
    gpuMemory: 0,
    activeChunks: 0,
    streamingLatency: 0,
    lastUpdate: Date.now()
  };

  constructor(rustRenderer: RustWebGLRenderer) {
    this.rustRenderer = rustRenderer;
    this.initializeShaders();
    this.initializeTextureAtlas();
  }

  private initializeShaders(): void {
    // Create background shader program
    const backgroundProgram = this.rustRenderer.createShaderProgram(
      BACKGROUND_SHADERS.vertexShader,
      BACKGROUND_SHADERS.fragmentShader
    );
    this.shaderPrograms.set('background', backgroundProgram);

    // Create weather effects shader program
    const weatherProgram = this.rustRenderer.createShaderProgram(
      BACKGROUND_SHADERS.weatherVertexShader,
      BACKGROUND_SHADERS.weatherFragmentShader
    );
    this.shaderPrograms.set('weather', weatherProgram);
  }

  private initializeTextureAtlas(): void {
    // Create main texture atlas (4K for high-quality backgrounds)
    const atlasId = this.rustRenderer.createTextureAtlas(4096, 4096);
    this.textureAtlases.set('main', atlasId);

    // Create smaller atlas for weather effects
    const weatherAtlasId = this.rustRenderer.createTextureAtlas(1024, 1024);
    this.textureAtlases.set('weather', weatherAtlasId);
  }

  async loadBackgroundConfiguration(config: BackgroundConfiguration): Promise<void> {
    // Load all layer textures into the atlas
    for (const layer of config.layers) {
      await this.loadBackgroundLayer(layer);
    }

    // Load weather effects
    for (const effect of config.weatherEffects) {
      this.loadWeatherEffect(effect);
    }
  }

  private async loadBackgroundLayer(layer: BackgroundLayer): Promise<void> {
    const layerConfig: BackgroundLayerConfig = {
      id: layer.id,
      name: layer.name,
      textureUrl: layer.textureUrl,
      width: layer.width,
      height: layer.height,
      opacity: layer.opacity,
      parallaxFactor: layer.parallaxFactor,
      repeat: layer.repeat === 'none' ? 'clamp' : 
              layer.repeat === 'repeat-x' || layer.repeat === 'repeat-y' ? 'repeat' : 
              layer.repeat as 'repeat' | 'clamp' | 'mirror',
      blendMode: layer.blendMode,
      animated: layer.animated,
      animationSpeed: layer.animationSpeed,
      animationFrames: layer.animationFrames,
      visible: layer.visible,
      zIndex: layer.zIndex,
      lodLevels: layer.lodLevels
    };

    // Load texture data
    try {
      const textureData = await this.loadTexture(layer.textureUrl);
      layerConfig.textureData = textureData;

      // Add to texture atlas
      const atlasId = this.textureAtlases.get('main')!;
      this.rustRenderer.addToTextureAtlas(
        atlasId,
        textureData,
        layer.width,
        layer.height
      );

      // Create background layer in Rust
      const layerId = this.rustRenderer.createBackgroundLayer(layerConfig);
      this.layerConfigs.set(layer.id, layerConfig);

      // Load LOD textures if available
      if (layer.lodLevels) {
        for (let i = 0; i < layer.lodLevels.length; i++) {
          const lodLevel = layer.lodLevels[i];
          if (lodLevel.textureUrl) {
            const lodTextureData = await this.loadTexture(lodLevel.textureUrl);
            this.rustRenderer.updateLODTexture(layerId, i, lodTextureData);
          }
        }
      }

    } catch (error) {
      console.error(`Failed to load background layer ${layer.id}:`, error);
      throw error;
    }
  }

  private loadWeatherEffect(effect: WeatherEffect): void {
    const effectConfig: WeatherEffectConfig = {
      id: effect.id,
      type: effect.type,
      intensity: effect.intensity,
      direction: effect.direction,
      speed: effect.speed,
      particleCount: effect.particleCount,
      opacity: effect.opacity,
      color: effect.color,
      enabled: effect.enabled
    };

    const effectId = this.rustRenderer.createWeatherEffect(effectConfig);
    this.weatherEffects.set(effect.id, effectId);
  }

  private async loadTexture(url: string): Promise<Uint8Array> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load texture: ${url}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  updateBackgroundLayer(layerId: string, updates: Partial<BackgroundLayer>): void {
    const config = this.layerConfigs.get(layerId);
    if (!config) {
      throw new Error(`Background layer ${layerId} not found`);
    }

    // Convert updates to BackgroundLayerConfig format
    const configUpdates: Partial<BackgroundLayerConfig> = {};
    if (updates.opacity !== undefined) configUpdates.opacity = updates.opacity;
    if (updates.parallaxFactor !== undefined) configUpdates.parallaxFactor = updates.parallaxFactor;
    if (updates.blendMode !== undefined) configUpdates.blendMode = updates.blendMode;
    if (updates.visible !== undefined) configUpdates.visible = updates.visible;
    if (updates.animationSpeed !== undefined) configUpdates.animationSpeed = updates.animationSpeed;
    if (updates.repeat !== undefined) {
      configUpdates.repeat = updates.repeat === 'none' ? 'clamp' : 
                            updates.repeat === 'repeat-x' || updates.repeat === 'repeat-y' ? 'repeat' : 
                            updates.repeat as 'repeat' | 'clamp' | 'mirror';
    }

    // Update local config with properly typed repeat
    const updatedConfig: BackgroundLayerConfig = { 
      ...config, 
      ...configUpdates,
      repeat: configUpdates.repeat || config.repeat
    };
    this.layerConfigs.set(layerId, updatedConfig);

    // Update Rust side
    const rustLayerId = Array.from(this.layerConfigs.keys()).indexOf(layerId);
    this.rustRenderer.updateBackgroundLayer(rustLayerId, configUpdates);
  }

  addWeatherEffect(effect: WeatherEffect): void {
    this.loadWeatherEffect(effect);
  }

  removeWeatherEffect(effectId: string): void {
    const rustEffectId = this.weatherEffects.get(effectId);
    if (rustEffectId !== undefined) {
      this.rustRenderer.removeWeatherEffect(rustEffectId);
      this.weatherEffects.delete(effectId);
    }
  }

  updateWeatherEffect(effectId: string, updates: Partial<WeatherEffect>): void {
    const rustEffectId = this.weatherEffects.get(effectId);
    if (rustEffectId !== undefined) {
      this.rustRenderer.updateWeatherEffect(rustEffectId, updates);
    }
  }

  setPerformanceProfile(profile: 'low' | 'medium' | 'high' | 'ultra'): void {
    // Adjust LOD settings based on profile
    let maxLOD: number;
    let enableAutoLOD: boolean;
    
    switch (profile) {
      case 'low':
        maxLOD = 1;
        enableAutoLOD = true;
        break;
      case 'medium':
        maxLOD = 2;
        enableAutoLOD = true;
        break;
      case 'high':
        maxLOD = 3;
        enableAutoLOD = false;
        break;
      case 'ultra':
        maxLOD = 4;
        enableAutoLOD = false;
        break;
    }

    this.rustRenderer.enableAutoLOD(enableAutoLOD);
    
    // Update all layers to use appropriate LOD
    for (const [layerId, config] of this.layerConfigs.entries()) {
      const rustLayerId = Array.from(this.layerConfigs.keys()).indexOf(layerId);
      this.rustRenderer.setLODLevel(rustLayerId, Math.min(maxLOD, config.lodLevels?.length || 1) - 1);
    }
  }

  render(viewMatrix: number[], projectionMatrix: number[], zoom: number): void {
    this.rustRenderer.renderBackground(viewMatrix, projectionMatrix, zoom);
    this.updatePerformanceMetrics();
  }

  private updatePerformanceMetrics(): void {
    const now = Date.now();
    const deltaTime = now - this.performanceMetrics.lastUpdate;
    
    if (deltaTime >= 1000) {
      this.performanceMetrics = {
        fps: 1000 / this.rustRenderer.getFrameTime(),
        frameTime: this.rustRenderer.getFrameTime(),
        drawCalls: this.rustRenderer.getDrawCallCount(),
        backgroundLayers: this.layerConfigs.size,
        lodSwitches: 0, // Would be tracked by Rust side
        textureMemory: this.rustRenderer.getTextureMemoryUsage(),
        triangles: this.layerConfigs.size * 2, // Estimate
        gpuMemory: this.rustRenderer.getTextureMemoryUsage(),
        activeChunks: this.layerConfigs.size,
        streamingLatency: 0, // Would be tracked by streaming system
        lastUpdate: now
      };
    }
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  cleanup(): void {
    // Clean up all resources
    // Texture atlases will be cleaned up by Rust side

    for (const effectId of this.weatherEffects.values()) {
      this.rustRenderer.removeWeatherEffect(effectId);
    }

    this.textureAtlases.clear();
    this.layerConfigs.clear();
    this.weatherEffects.clear();
    this.shaderPrograms.clear();
  }
}

export default BackgroundRendererIntegration;