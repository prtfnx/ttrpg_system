import {
  advancedMeasurementSystem,
  type GeometricShape,
  type GridConfiguration,
  type MeasurementLine,
  type MeasurementSettings,
  type MeasurementTemplate
} from '@features/measurement/services/advancedMeasurement.service';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabType } from './TabNavigation';
import type { ActiveTool } from './ToolSelection';

type ShapeType = 'circle' | 'rectangle' | 'polygon' | 'arc' | 'ellipse';

interface UseAdvancedMeasurementProps {
  isOpen: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onMeasurementStart?: (point: { x: number; y: number }) => void;
  onMeasurementUpdate?: (measurementId: string, endPoint: { x: number; y: number }) => void;
  onMeasurementComplete?: (measurement: MeasurementLine) => void;
}

export const useAdvancedMeasurement = ({
  isOpen,
  canvasRef,
  onMeasurementStart,
  onMeasurementUpdate,
  onMeasurementComplete
}: UseAdvancedMeasurementProps) => {
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [measurements, setMeasurements] = useState<MeasurementLine[]>([]);
  const [shapes, setShapes] = useState<GeometricShape[]>([]);
  const [grids, setGrids] = useState<GridConfiguration[]>([]);
  const [templates, setTemplates] = useState<MeasurementTemplate[]>([]);
  const [settings, setSettings] = useState<MeasurementSettings | null>(null);
  const [activeGrid, setActiveGrid] = useState<GridConfiguration | null>(null);
  const [selectedTab, setSelectedTab] = useState<TabType>('measure');
  
  const [selectedShapeType, setSelectedShapeType] = useState<ShapeType>('rectangle');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [isCreatingShape, setIsCreatingShape] = useState(false);
  const [shapePoints, setShapePoints] = useState<{ x: number; y: number }[]>([]);
  const [activeMeasurement, setActiveMeasurement] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    try {
      setMeasurements(advancedMeasurementSystem.getMeasurements());
      setShapes(advancedMeasurementSystem.getShapes());
      setGrids(advancedMeasurementSystem.getGrids());
      setTemplates(advancedMeasurementSystem.getTemplates());
      setSettings(advancedMeasurementSystem.getSettings());
      setActiveGrid(advancedMeasurementSystem.getActiveGrid());
    } catch (err) {
      setError('Failed to load measurement system data: ' + (err as Error).message);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleMeasurementEvent = (event: string, data: any) => {
      switch (event) {
        case 'measurementStarted':
          setActiveMeasurement(data.measurement.id);
          onMeasurementStart?.(data.measurement.start);
          break;
        case 'measurementUpdated':
          onMeasurementUpdate?.(data.measurement.id, data.measurement.end);
          break;
        case 'measurementCompleted':
          setActiveMeasurement(null);
          setMeasurements(advancedMeasurementSystem.getMeasurements());
          onMeasurementComplete?.(data.measurement);
          break;
        case 'shapeCreated':
          setShapes(advancedMeasurementSystem.getShapes());
          setIsCreatingShape(false);
          setShapePoints([]);
          break;
        case 'activeGridChanged':
          setActiveGrid(advancedMeasurementSystem.getActiveGrid());
          break;
        case 'settingsUpdated':
          setSettings(data.settings);
          break;
        default:
          break;
      }
    };

    advancedMeasurementSystem.subscribe('ui', handleMeasurementEvent);

    return () => {
      advancedMeasurementSystem.unsubscribe('ui');
    };
  }, [onMeasurementStart, onMeasurementUpdate, onMeasurementComplete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isOpen) return;

    const handleCanvasClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const point = { x, y };

      try {
        switch (activeTool) {
          case 'measure':
            if (activeMeasurement) {
              advancedMeasurementSystem.completeMeasurement(activeMeasurement);
            } else {
              advancedMeasurementSystem.startMeasurement(point);
            }
            break;

          case 'shape':
            if (isCreatingShape) {
              const newPoints = [...shapePoints, point];
              setShapePoints(newPoints);

              if ((selectedShapeType === 'rectangle' || selectedShapeType === 'circle' || selectedShapeType === 'ellipse') && newPoints.length === 2) {
                advancedMeasurementSystem.createShape(selectedShapeType, newPoints);
              } else if (selectedShapeType === 'polygon' && event.detail === 2) {
                advancedMeasurementSystem.createShape(selectedShapeType, newPoints);
              }
            } else {
              setIsCreatingShape(true);
              setShapePoints([point]);
            }
            break;

          case 'template':
            if (selectedTemplate) {
              console.log('Template placement at:', point, 'template:', selectedTemplate);
            }
            break;

          default:
            break;
        }
      } catch (err) {
        setError('Tool operation failed: ' + (err as Error).message);
      }
    };

    const handleCanvasMouseMove = (event: MouseEvent) => {
      if (activeMeasurement) {
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        advancedMeasurementSystem.updateMeasurement(activeMeasurement, { x, y });
      }
    };

    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);

    return () => {
      canvas.removeEventListener('click', handleCanvasClick);
      canvas.removeEventListener('mousemove', handleCanvasMouseMove);
    };
  }, [canvasRef, isOpen, activeTool, activeMeasurement, isCreatingShape, shapePoints, selectedShapeType, selectedTemplate]);

  const handleToolSelect = useCallback((tool: ActiveTool) => {
    setActiveTool(tool);
    
    if (activeMeasurement) {
      advancedMeasurementSystem.cancelMeasurement(activeMeasurement);
    }
    setIsCreatingShape(false);
    setShapePoints([]);
    setError(null);
  }, [activeMeasurement]);

  const handleClearMeasurements = useCallback(() => {
    if (window.confirm('Clear all measurements? This cannot be undone.')) {
      advancedMeasurementSystem.clearMeasurements(true);
      setMeasurements([]);
    }
  }, []);

  const handleGridChange = useCallback((gridId: string) => {
    advancedMeasurementSystem.setActiveGrid(gridId);
  }, []);

  const handleGridUpdate = useCallback((gridId: string, updates: Partial<GridConfiguration>) => {
    advancedMeasurementSystem.updateGrid(gridId, updates);
    setGrids(advancedMeasurementSystem.getGrids());
    if (activeGrid?.id === gridId) {
      setActiveGrid(advancedMeasurementSystem.getActiveGrid());
    }
  }, [activeGrid]);

  const handleSettingsUpdate = useCallback((updates: Partial<MeasurementSettings>) => {
    advancedMeasurementSystem.updateSettings(updates);
  }, []);

  const handleExportData = useCallback(() => {
    try {
      const data = advancedMeasurementSystem.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `measurements_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export data: ' + (err as Error).message);
    }
  }, []);

  const handleImportData = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        advancedMeasurementSystem.importData(content);
        
        setMeasurements(advancedMeasurementSystem.getMeasurements());
        setShapes(advancedMeasurementSystem.getShapes());
        setGrids(advancedMeasurementSystem.getGrids());
        setTemplates(advancedMeasurementSystem.getTemplates());
        setActiveGrid(advancedMeasurementSystem.getActiveGrid());
      } catch (err) {
        setError('Failed to import data: ' + (err as Error).message);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleCreateCustomTemplate = useCallback(() => {
    const name = prompt('Template name:');
    if (!name) return;
    
    const size = parseFloat(prompt('Size (in current units):') || '10');
    if (isNaN(size)) return;

    try {
      advancedMeasurementSystem.createTemplate({
        name,
        type: 'custom',
        size,
        color: '#ff6b35',
        fillColor: '#ff6b3533',
        opacity: 0.7,
        rotatable: true,
        snapToGrid: true,
        showArea: true,
        description: `Custom ${name} template`
      });
      setTemplates(advancedMeasurementSystem.getTemplates());
    } catch (err) {
      setError('Failed to create template: ' + (err as Error).message);
    }
  }, []);

  const filteredMeasurements = measurements.filter(m => 
    !searchQuery || m.label?.toLowerCase().includes(searchQuery.toLowerCase()) || m.id.includes(searchQuery)
  );

  const filteredShapes = shapes.filter(s => 
    !searchQuery || s.label?.toLowerCase().includes(searchQuery.toLowerCase()) || s.type.includes(searchQuery.toLowerCase())
  );

  return {
    activeTool,
    measurements,
    shapes,
    grids,
    templates,
    settings,
    activeGrid,
    selectedTab,
    setSelectedTab,
    selectedShapeType,
    setSelectedShapeType,
    selectedTemplate,
    setSelectedTemplate,
    isCreatingShape,
    shapePoints,
    activeMeasurement,
    searchQuery,
    setSearchQuery,
    showAdvancedSettings,
    setShowAdvancedSettings,
    error,
    setError,
    fileInputRef,
    handleToolSelect,
    handleClearMeasurements,
    handleGridChange,
    handleGridUpdate,
    handleSettingsUpdate,
    handleExportData,
    handleImportData,
    handleFileImport,
    handleCreateCustomTemplate,
    filteredMeasurements,
    filteredShapes
  };
};

export type { ShapeType };

