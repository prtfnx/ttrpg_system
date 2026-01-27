/**
 * Performance Optimization Service for TTRPG Combat System
 * Provides profiling, monitoring, and optimization utilities
 */

interface PerformanceMetric {
  name: string;
  duration: number;
  startTime: number;
  endTime: number;
  category: 'calculation' | 'rendering' | 'state' | 'data' | 'network';
  metadata?: Record<string, any>;
}

interface PerformanceProfile {
  sessionId: string;
  startTime: number;
  metrics: PerformanceMetric[];
  warnings: string[];
  recommendations: string[];
}

class PerformanceProfiler {
  private static instance: PerformanceProfiler;
  private currentProfile: PerformanceProfile | null = null;
  private activeTimers: Map<string, number> = new Map();
  private activeMetadata: Map<string, any> = new Map();
  private readonly PERFORMANCE_THRESHOLDS = {
    calculation: 50, // milliseconds
    rendering: 16.67, // 60fps
    state: 10,
    data: 100,
    network: 1000
  };

  static getInstance(): PerformanceProfiler {
    if (!PerformanceProfiler.instance) {
      PerformanceProfiler.instance = new PerformanceProfiler();
    }
    return PerformanceProfiler.instance;
  }

  /**
   * Start a new profiling session
   */
  startProfiling(sessionId: string = `session_${Date.now()}`): void {
    this.currentProfile = {
      sessionId,
      startTime: performance.now(),
      metrics: [],
      warnings: [],
      recommendations: []
    };
    
    console.log(`🔍 Performance profiling started: ${sessionId}`);
  }

  /**
   * Start timing a specific operation
   */
  startTimer(name: string, category: PerformanceMetric['category'] = 'calculation', metadata?: Record<string, any>): void {
    if (!this.currentProfile) {
      console.warn('Performance profiling not started. Call startProfiling() first.');
      return;
    }

    const startTime = performance.now();
    this.activeTimers.set(name, startTime);
    
    // Store metadata for later use
    if (metadata) {
      this.activeMetadata.set(`${name}_metadata`, metadata);
    }
    this.activeMetadata.set(`${name}_category`, category);
  }

  /**
   * End timing and record metric
   */
  endTimer(name: string): number {
    if (!this.currentProfile) {
      console.warn('Performance profiling not started.');
      return 0;
    }

    const startTime = this.activeTimers.get(name);
    if (!startTime) {
      console.warn(`Timer "${name}" was not started.`);
      return 0;
    }

    const endTime = performance.now();
    const duration = endTime - startTime;
    const category = (this.activeMetadata.get(`${name}_category`) as PerformanceMetric['category']) || 'calculation';
    const metadata = this.activeMetadata.get(`${name}_metadata`) as Record<string, any>;

    const metric: PerformanceMetric = {
      name,
      duration,
      startTime,
      endTime,
      category,
      metadata
    };

    this.currentProfile.metrics.push(metric);
    
    // Check for performance issues
    this.checkPerformanceThresholds(metric);
    
    // Clean up
    this.activeTimers.delete(name);
    this.activeMetadata.delete(`${name}_metadata`);
    this.activeMetadata.delete(`${name}_category`);

    return duration;
  }

  /**
   * Time a function execution
   */
  async timeFunction<T>(
    name: string, 
    fn: () => T | Promise<T>, 
    category: PerformanceMetric['category'] = 'calculation',
    metadata?: Record<string, any>
  ): Promise<{ result: T; duration: number }> {
    this.startTimer(name, category, metadata);
    
    try {
      const result = await fn();
      const duration = this.endTimer(name);
      return { result, duration };
    } catch (error) {
      this.endTimer(name);
      throw error;
    }
  }

  /**
   * Check if metric exceeds performance thresholds
   */
  private checkPerformanceThresholds(metric: PerformanceMetric): void {
    if (!this.currentProfile) return;

    const threshold = this.PERFORMANCE_THRESHOLDS[metric.category];
    
    if (metric.duration > threshold) {
      const warning = `Performance warning: ${metric.name} took ${metric.duration.toFixed(2)}ms (threshold: ${threshold}ms)`;
      this.currentProfile.warnings.push(warning);
      console.warn(warning);
    }
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(): string[] {
    if (!this.currentProfile) return [];

    const recommendations: string[] = [];
    const metrics = this.currentProfile.metrics;
    
    // Analyze calculation performance
    const calculationMetrics = metrics.filter(m => m.category === 'calculation');
    const slowCalculations = calculationMetrics.filter(m => m.duration > this.PERFORMANCE_THRESHOLDS.calculation);
    
    if (slowCalculations.length > 0) {
      recommendations.push(`Consider optimizing slow calculations: ${slowCalculations.map(m => m.name).join(', ')}`);
    }

    // Analyze rendering performance
    const renderingMetrics = metrics.filter(m => m.category === 'rendering');
    const slowRendering = renderingMetrics.filter(m => m.duration > this.PERFORMANCE_THRESHOLDS.rendering);
    
    if (slowRendering.length > 0) {
      recommendations.push(`Consider React.memo or useMemo for slow rendering operations: ${slowRendering.map(m => m.name).join(', ')}`);
    }

    // Analyze state updates
    const stateMetrics = metrics.filter(m => m.category === 'state');
    const frequentStateUpdates = stateMetrics.length > 10;
    
    if (frequentStateUpdates) {
      recommendations.push('Consider batching state updates or using useCallback to reduce re-renders');
    }

    // Analyze data processing
    const dataMetrics = metrics.filter(m => m.category === 'data');
    const heavyDataProcessing = dataMetrics.filter(m => m.duration > this.PERFORMANCE_THRESHOLDS.data);
    
    if (heavyDataProcessing.length > 0) {
      recommendations.push('Consider web workers for heavy data processing operations');
    }

    return recommendations;
  }

  /**
   * End profiling session and generate report
   */
  endProfiling(): PerformanceProfile | null {
    if (!this.currentProfile) {
      console.warn('No active profiling session.');
      return null;
    }

    // Generate recommendations
    this.currentProfile.recommendations = this.generateRecommendations();
    
    const profile = { ...this.currentProfile };
    const totalDuration = performance.now() - profile.startTime;
    
    console.log(`📊 Performance profiling completed: ${profile.sessionId}`);
    console.log(`⏱️ Session duration: ${totalDuration.toFixed(2)}ms`);
    console.log(`📈 Metrics collected: ${profile.metrics.length}`);
    console.log(`⚠️ Warnings: ${profile.warnings.length}`);
    console.log(`💡 Recommendations: ${profile.recommendations.length}`);

    this.currentProfile = null;
    return profile;
  }

  /**
   * Get current session metrics
   */
  getCurrentMetrics(): PerformanceMetric[] {
    return this.currentProfile?.metrics || [];
  }

  /**
   * Clear all active timers (cleanup utility)
   */
  clearActiveTimers(): void {
    this.activeTimers.clear();
  }
}

/**
 * Combat-specific performance optimization utilities
 */
export class CombatPerformanceOptimizer {
  private profiler: PerformanceProfiler;
  
  constructor() {
    this.profiler = PerformanceProfiler.getInstance();
  }

  /**
   * Profile ability score calculations
   */
  async profileAbilityCalculations(abilityScores: Record<string, number>): Promise<{
    modifiers: Record<string, number>;
    duration: number;
  }> {
    const result = await this.profiler.timeFunction(
      'ability_score_calculations',
      () => {
        const modifiers: Record<string, number> = {};
        for (const [ability, score] of Object.entries(abilityScores)) {
          modifiers[ability] = Math.floor((score - 10) / 2);
        }
        return modifiers;
      },
      'calculation',
      { abilityCount: Object.keys(abilityScores).length }
    );
    return { modifiers: result.result, duration: result.duration };
  }

  /**
   * Profile attack roll calculations
   */
  async profileAttackRoll(
    abilityModifier: number, 
    proficiencyBonus: number, 
    weaponBonus: number = 0
  ): Promise<{ attackBonus: number; duration: number }> {
    const result = await this.profiler.timeFunction(
      'attack_roll_calculation',
      () => {
        return abilityModifier + proficiencyBonus + weaponBonus;
      },
      'calculation',
      { modifiers: { abilityModifier, proficiencyBonus, weaponBonus } }
    );
    return { attackBonus: result.result, duration: result.duration };
  }

  /**
   * Profile damage calculations
   */
  async profileDamageCalculation(
    baseDamage: number[], 
    abilityModifier: number, 
    criticalHit: boolean = false
  ): Promise<{ totalDamage: number; duration: number }> {
    const result = await this.profiler.timeFunction(
      'damage_calculation',
      () => {
        let total = baseDamage.reduce((sum, die) => sum + die, 0) + abilityModifier;
        if (criticalHit) {
          total += baseDamage.reduce((sum, die) => sum + die, 0); // Double dice damage
        }
        return total;
      },
      'calculation',
      { 
        baseDamage, 
        abilityModifier, 
        criticalHit,
        diceCount: baseDamage.length 
      }
    );
    return { totalDamage: result.result, duration: result.duration };
  }

  /**
   * Profile initiative calculations for multiple characters
   */
  async profileInitiativeCalculation(characters: Array<{
    name: string;
    dexterity: number;
    initiativeBonus?: number;
  }>): Promise<{ 
    initiatives: Array<{ name: string; initiative: number }>; 
    duration: number 
  }> {
    const result = await this.profiler.timeFunction(
      'initiative_calculation',
      () => {
        return characters.map(char => ({
          name: char.name,
          initiative: Math.floor(Math.random() * 20) + 1 + 
                    Math.floor((char.dexterity - 10) / 2) + 
                    (char.initiativeBonus || 0)
        })).sort((a, b) => b.initiative - a.initiative);
      },
      'calculation',
      { characterCount: characters.length }
    );
    return { initiatives: result.result, duration: result.duration };
  }

  /**
   * Profile equipment weight calculations
   */
  async profileEquipmentWeight(equipment: Array<{
    weight: number;
    quantity: number;
  }>): Promise<{ totalWeight: number; duration: number }> {
    const result = await this.profiler.timeFunction(
      'equipment_weight_calculation',
      () => {
        return equipment.reduce((total, item) => total + (item.weight * item.quantity), 0);
      },
      'calculation',
      { itemCount: equipment.length }
    );
    return { totalWeight: result.result, duration: result.duration };
  }

  /**
   * Profile spell slot calculations
   */
  async profileSpellSlots(
    characterLevel: number, 
    characterClass: string
  ): Promise<{ spellSlots: number[]; duration: number }> {
    const result = await this.profiler.timeFunction(
      'spell_slot_calculation',
      () => {
        // Simplified spell slot calculation
        const spellSlots: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // Levels 0-9
        
        if (['wizard', 'sorcerer', 'warlock'].includes(characterClass.toLowerCase())) {
          // Full caster progression
          for (let level = 1; level <= Math.min(characterLevel, 20); level++) {
            const slotLevel = Math.min(Math.ceil(level / 2), 9);
            spellSlots[slotLevel] += level <= 2 ? 2 : level <= 4 ? 3 : 4;
          }
        }
        
        return spellSlots;
      },
      'calculation',
      { characterLevel, characterClass }
    );
    return { spellSlots: result.result, duration: result.duration };
  }

  /**
   * Start profiling a combat session
   */
  startCombatProfiling(sessionId?: string): void {
    this.profiler.startProfiling(sessionId || `combat_${Date.now()}`);
  }

  /**
   * End combat profiling and get report
   */
  endCombatProfiling(): PerformanceProfile | null {
    return this.profiler.endProfiling();
  }

  /**
   * Get current profiling metrics
   */
  getCurrentMetrics(): PerformanceMetric[] {
    return this.profiler.getCurrentMetrics();
  }
}

/**
 * React-specific performance optimization hooks and utilities
 */
export const performanceUtils = {
  /**
   * Debounce function for reducing excessive calculations
   */
  debounce<T extends (...args: any[]) => void>(func: T, delay: number): T {
    let timeoutId: number;
    return ((...args: any[]) => {
              window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => func(...args), delay);
    }) as T;
  },

  /**
   * Throttle function for limiting execution frequency
   */
  throttle<T extends (...args: any[]) => void>(func: T, limit: number): T {
    let inThrottle: boolean;
    return ((...args: any[]) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        window.setTimeout(() => inThrottle = false, limit);
      }
    }) as T;
  },

  /**
   * Memoization utility for expensive calculations
   */
  memoize<T extends (...args: any[]) => any>(func: T): T {
    const cache = new Map();
    return ((...args: any[]) => {
      const key = JSON.stringify(args);
      if (cache.has(key)) {
        return cache.get(key);
      }
      const result = func(...args);
      cache.set(key, result);
      return result;
    }) as T;
  },

  /**
   * Batch state updates to reduce re-renders
   */
  batchUpdates(updates: Array<() => void>): void {
    // In React 18+, updates are automatically batched
    // This is a fallback for older versions
    updates.forEach(update => update());
  }
};

// Export instances
export const performanceProfiler = PerformanceProfiler.getInstance();
export const combatOptimizer = new CombatPerformanceOptimizer();