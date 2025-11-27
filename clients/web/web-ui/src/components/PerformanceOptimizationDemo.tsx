import React, { useCallback, useMemo, useState } from 'react';
import { combatOptimizer, performanceUtils } from '../services/performanceOptimization.service';
import type { WizardFormData } from './CharacterWizard/WizardFormData';
import styles from './PerformanceOptimizationDemo.module.css';

// Test character for performance testing
const testCharacter: WizardFormData = {
  name: 'Performance Test Character',
  race: 'Human',
  class: 'Fighter',
  background: 'Soldier',
  strength: 16,
  dexterity: 14,
  constitution: 15,
  intelligence: 12,
  wisdom: 13,
  charisma: 11,
  skills: ['Athletics', 'Intimidation', 'Perception', 'Survival'],
  spells: {
    cantrips: [],
    knownSpells: [],
    preparedSpells: []
  },
  equipment: {
    items: Array.from({ length: 20 }, (_, i) => ({
      equipment: {
        name: `Test Item ${i + 1}`,
        weight: Math.random() * 10,
        cost: { amount: Math.floor(Math.random() * 100), unit: 'gp' }
      },
      quantity: Math.floor(Math.random() * 3) + 1
    })),
    currency: { cp: 0, sp: 0, ep: 0, gp: 150, pp: 0 },
    carrying_capacity: {
      current_weight: 45,
      max_weight: 240,
      encumbered_at: 160,
      heavily_encumbered_at: 200
    }
  },
  advancement: {
    experiencePoints: 2700,
    currentLevel: 3,
    levelHistory: [
      { level: 1, className: 'Fighter', hitPointIncrease: 10, featuresGained: ['Fighting Style', 'Second Wind'] },
      { level: 2, className: 'Fighter', hitPointIncrease: 7, featuresGained: ['Action Surge'] },
      { level: 3, className: 'Fighter', hitPointIncrease: 6, featuresGained: ['Martial Archetype'] }
    ]
  }
};

interface PerformanceMetric {
  name: string;
  duration: number;
  category: string;
}

interface OptimizationResult {
  original: number;
  optimized: number;
  improvement: number;
  description: string;
}

export const PerformanceOptimizationDemo: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [optimizationResults, setOptimizationResults] = useState<OptimizationResult[]>([]);
  const [selectedTest, setSelectedTest] = useState<'all' | 'calculations' | 'rendering' | 'memory'>('all');

  // Memoized expensive calculation
  const memoizedAbilityCalculations = useMemo(() => 
    performanceUtils.memoize((abilities: Record<string, number>) => {
      const modifiers: Record<string, number> = {};
      for (const [ability, score] of Object.entries(abilities)) {
        modifiers[ability] = Math.floor((score - 10) / 2);
      }
      return modifiers;
    }), []
  );

  // Debounced state update
  const debouncedUpdate = useCallback(
    performanceUtils.debounce((value: string) => {
      console.log('Debounced update:', value);
    }, 300),
    []
  );

  // Throttled calculation
  const throttledCalculation = useCallback(
    performanceUtils.throttle(() => {
      console.log('Throttled calculation executed');
    }, 100),
    []
  );

  const runPerformanceTests = async () => {
    setIsRunning(true);
    const sessionId = `perf_test_${Date.now()}`;
    
    try {
      combatOptimizer.startCombatProfiling(sessionId);
      
      const testResults: PerformanceMetric[] = [];
      const optimizations: OptimizationResult[] = [];

      // Test 1: Basic ability score calculations
      if (selectedTest === 'all' || selectedTest === 'calculations') {
        console.log('🧮 Testing ability score calculations...');
        
        // Original calculation (non-memoized)
        const originalStart = performance.now();
        for (let i = 0; i < 1000; i++) {
          const modifiers: Record<string, number> = {};
          const abilities = { 
            strength: testCharacter.strength, 
            dexterity: testCharacter.dexterity,
            constitution: testCharacter.constitution,
            intelligence: testCharacter.intelligence,
            wisdom: testCharacter.wisdom,
            charisma: testCharacter.charisma
          };
          for (const [ability, score] of Object.entries(abilities)) {
            modifiers[ability] = Math.floor((score - 10) / 2);
          }
        }
        const originalDuration = performance.now() - originalStart;

        // Optimized calculation (memoized)
        const optimizedStart = performance.now();
        for (let i = 0; i < 1000; i++) {
          memoizedAbilityCalculations({ 
            strength: testCharacter.strength, 
            dexterity: testCharacter.dexterity,
            constitution: testCharacter.constitution,
            intelligence: testCharacter.intelligence,
            wisdom: testCharacter.wisdom,
            charisma: testCharacter.charisma
          });
        }
        const optimizedDuration = performance.now() - optimizedStart;

        const improvement = ((originalDuration - optimizedDuration) / originalDuration) * 100;
        
        optimizations.push({
          original: originalDuration,
          optimized: optimizedDuration,
          improvement,
          description: 'Ability Score Calculations (Memoization)'
        });

        // Profile with the combat optimizer
        const profiledResult = await combatOptimizer.profileAbilityCalculations({
          strength: testCharacter.strength,
          dexterity: testCharacter.dexterity,
          constitution: testCharacter.constitution,
          intelligence: testCharacter.intelligence,
          wisdom: testCharacter.wisdom,
          charisma: testCharacter.charisma
        });
        
        testResults.push({
          name: 'Ability Score Calculation',
          duration: profiledResult.duration,
          category: 'calculation'
        });
      }

      // Test 2: Attack calculations
      if (selectedTest === 'all' || selectedTest === 'calculations') {
        console.log('⚔️ Testing attack calculations...');
        
        const attackResult = await combatOptimizer.profileAttackRoll(
          Math.floor((testCharacter.strength - 10) / 2), // STR modifier
          2, // Proficiency bonus for level 3
          1  // Magic weapon bonus
        );
        
        testResults.push({
          name: 'Attack Roll Calculation',
          duration: attackResult.duration,
          category: 'calculation'
        });
      }

      // Test 3: Equipment weight calculations
      if (selectedTest === 'all' || selectedTest === 'calculations') {
        console.log('🎒 Testing equipment calculations...');
        
        const equipment = testCharacter.equipment?.items.map(item => ({
          weight: item.equipment.weight,
          quantity: item.quantity
        })) || [];
        
        const weightResult = await combatOptimizer.profileEquipmentWeight(equipment);
        
        testResults.push({
          name: 'Equipment Weight Calculation',
          duration: weightResult.duration,
          category: 'calculation'
        });
      }

      // Test 4: Initiative calculations for multiple characters
      if (selectedTest === 'all' || selectedTest === 'calculations') {
        console.log('🎲 Testing initiative calculations...');
        
        const characters = Array.from({ length: 8 }, (_, i) => ({
          name: `Character ${i + 1}`,
          dexterity: 10 + Math.floor(Math.random() * 8),
          initiativeBonus: Math.floor(Math.random() * 3)
        }));
        
        const initiativeResult = await combatOptimizer.profileInitiativeCalculation(characters);
        
        testResults.push({
          name: 'Initiative Calculation (8 characters)',
          duration: initiativeResult.duration,
          category: 'calculation'
        });
      }

      // Test 5: Damage calculations
      if (selectedTest === 'all' || selectedTest === 'calculations') {
        console.log('💥 Testing damage calculations...');
        
        const baseDamage = [8, 6, 4]; // 1d8 + 1d6 + 1d4
        const abilityMod = Math.floor((testCharacter.strength - 10) / 2);
        
        const damageResult = await combatOptimizer.profileDamageCalculation(
          baseDamage,
          abilityMod,
          false
        );
        
        testResults.push({
          name: 'Damage Calculation',
          duration: damageResult.duration,
          category: 'calculation'
        });
      }

      // Test 6: Memory usage simulation
      if (selectedTest === 'all' || selectedTest === 'memory') {
        console.log('🧠 Testing memory optimization...');
        
        // Simulate memory-intensive operation
        const memoryStart = performance.now();
        const largeArray = Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          data: `item_${i}`,
          nested: { value: Math.random() }
        }));
        
        // Process with optimization
        const processedData = largeArray
          .filter(item => item.nested.value > 0.5)
          .map(item => ({ id: item.id, processed: true }))
          .slice(0, 100); // Limit results to reduce memory
        
        const memoryDuration = performance.now() - memoryStart;
        
        testResults.push({
          name: 'Large Dataset Processing',
          duration: memoryDuration,
          category: 'memory'
        });
        
        // Cleanup
        largeArray.length = 0;
        processedData.length = 0;
      }

      // Test 7: Rendering optimization simulation
      if (selectedTest === 'all' || selectedTest === 'rendering') {
        console.log('🎨 Testing rendering optimization...');
        
        // Simulate DOM updates
        const renderStart = performance.now();
        
        // Create virtual elements to simulate React rendering
        const elements = Array.from({ length: 100 }, (_, i) => ({
          id: i,
          type: 'div',
          props: {
            key: i,
            className: `item-${i}`,
            children: `Item ${i}`
          }
        }));
        
        // Simulate re-render optimization (process filtered elements)
        const processedElements = elements.filter(el => el.id % 2 === 0);
        
        // Simulate additional processing to justify the filtering
        processedElements.forEach(el => {
          el.props.className = `${el.props.className} optimized`;
        });
        
        const renderDuration = performance.now() - renderStart;
        
        testResults.push({
          name: 'Virtual DOM Rendering',
          duration: renderDuration,
          category: 'rendering'
        });
      }

      // End profiling and get complete report
      const profile = combatOptimizer.endCombatProfiling();
      
      if (profile) {
        const profileMetrics = profile.metrics.map(m => ({
          name: m.name,
          duration: m.duration,
          category: m.category
        }));
        testResults.push(...profileMetrics);
      }

      setMetrics(testResults);
      setOptimizationResults(optimizations);
      
    } catch (error) {
      console.error('Performance test error:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const getPerformanceGrade = (duration: number, category: string): string => {
    const thresholds = {
      calculation: { excellent: 1, good: 5, poor: 20 },
      rendering: { excellent: 5, good: 16.67, poor: 50 },
      memory: { excellent: 10, good: 50, poor: 200 },
      state: { excellent: 1, good: 5, poor: 15 }
    };
    
    const threshold = thresholds[category as keyof typeof thresholds] || thresholds.calculation;
    
    if (duration <= threshold.excellent) return 'excellent';
    if (duration <= threshold.good) return 'good';
    if (duration <= threshold.poor) return 'fair';
    return 'poor';
  };

  const getGradeEmoji = (grade: string): string => {
    switch (grade) {
      case 'excellent': return '🚀';
      case 'good': return '✅';
      case 'fair': return '⚠️';
      case 'poor': return '🐌';
      default: return '❓';
    }
  };

  return (
    <div className="performance-optimization-demo">
      <h2>⚡ Performance Optimization Demo</h2>
      <p>Test and demonstrate performance optimizations for combat calculations.</p>

      {/* Test Controls */}
      <div className="test-controls">
        <div className="test-selection">
          <label>
            <input
              type="radio"
              name="testType"
              value="all"
              checked={selectedTest === 'all'}
              onChange={(e) => setSelectedTest(e.target.value as any)}
            />
            All Tests
          </label>
          <label>
            <input
              type="radio"
              name="testType"
              value="calculations"
              checked={selectedTest === 'calculations'}
              onChange={(e) => setSelectedTest(e.target.value as any)}
            />
            Calculations Only
          </label>
          <label>
            <input
              type="radio"
              name="testType"
              value="rendering"
              checked={selectedTest === 'rendering'}
              onChange={(e) => setSelectedTest(e.target.value as any)}
            />
            Rendering Only
          </label>
          <label>
            <input
              type="radio"
              name="testType"
              value="memory"
              checked={selectedTest === 'memory'}
              onChange={(e) => setSelectedTest(e.target.value as any)}
            />
            Memory Only
          </label>
        </div>
        
        <button
          className="run-tests-button"
          onClick={runPerformanceTests}
          disabled={isRunning}
        >
          {isRunning ? '🔄 Running Tests...' : '▶️ Run Performance Tests'}
        </button>
      </div>

      {/* Optimization Results */}
      {optimizationResults.length > 0 && (
        <div className="optimization-results">
          <h3>🔧 Optimization Results</h3>
          <div className="results-grid">
            {optimizationResults.map((result, index) => (
              <div key={index} className="optimization-card">
                <h4>{result.description}</h4>
                <div className="performance-comparison">
                  <div className="original">
                    <span className="label">Original:</span>
                    <span className="value">{result.original.toFixed(2)}ms</span>
                  </div>
                  <div className="arrow">→</div>
                  <div className="optimized">
                    <span className="label">Optimized:</span>
                    <span className="value">{result.optimized.toFixed(2)}ms</span>
                  </div>
                </div>
                <div className={`improvement ${result.improvement > 0 ? 'positive' : 'negative'}`}>
                  {result.improvement > 0 ? '⬆️' : '⬇️'} {Math.abs(result.improvement).toFixed(1)}% 
                  {result.improvement > 0 ? ' faster' : ' slower'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Metrics */}
      {metrics.length > 0 && (
        <div className="performance-metrics">
          <h3>📊 Performance Metrics</h3>
          <div className="metrics-grid">
            {metrics.map((metric, index) => {
              const grade = getPerformanceGrade(metric.duration, metric.category);
              return (
                <div key={index} className={`metric-card ${grade}`}>
                  <div className="metric-header">
                    <span className="grade-emoji">{getGradeEmoji(grade)}</span>
                    <span className="metric-name">{metric.name}</span>
                  </div>
                  <div className="metric-details">
                    <span className="duration">{metric.duration.toFixed(3)}ms</span>
                    <span className="category">{metric.category}</span>
                  </div>
                  <div className={`grade-badge ${grade}`}>
                    {grade.toUpperCase()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Optimization Tips */}
      <div className="optimization-tips">
        <h3>💡 Performance Optimization Tips</h3>
        <div className="tips-grid">
          <div className="tip-card">
            <h4>🧮 Calculation Optimization</h4>
            <ul>
              <li>Use memoization for repeated calculations</li>
              <li>Cache ability modifiers and attack bonuses</li>
              <li>Batch multiple calculations together</li>
              <li>Avoid recalculating on every render</li>
            </ul>
          </div>
          
          <div className="tip-card">
            <h4>🎨 Rendering Optimization</h4>
            <ul>
              <li>Use React.memo for component memoization</li>
              <li>Implement useMemo for expensive computations</li>
              <li>Use useCallback for stable function references</li>
              <li>Virtualize long lists of items</li>
            </ul>
          </div>
          
          <div className="tip-card">
            <h4>🧠 Memory Optimization</h4>
            <ul>
              <li>Clean up unused objects and arrays</li>
              <li>Use object pooling for frequently created objects</li>
              <li>Implement pagination for large datasets</li>
              <li>Monitor memory usage in dev tools</li>
            </ul>
          </div>
          
          <div className="tip-card">
            <h4>⚡ State Optimization</h4>
            <ul>
              <li>Debounce frequent state updates</li>
              <li>Throttle user input handlers</li>
              <li>Use local state for temporary values</li>
              <li>Batch state updates when possible</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Interactive Demo Controls */}
      <div className="interactive-demo">
        <h3>🎮 Interactive Optimization Demo</h3>
        <div className={styles.demoControls}>
          <div className="demo-section">
            <h4>Debounced Input</h4>
            <input
              type="text"
              placeholder="Type to test debouncing..."
              onChange={(e) => debouncedUpdate(e.target.value)}
              className="demo-input"
            />
            <p className="demo-description">
              Input is debounced with 300ms delay. Check console for logs.
            </p>
          </div>
          
          <div className="demo-section">
            <h4>Throttled Action</h4>
            <button
              onClick={throttledCalculation}
              className="demo-button"
            >
              Click rapidly (throttled)
            </button>
            <p className="demo-description">
              Button clicks are throttled to once per 100ms. Check console for logs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};