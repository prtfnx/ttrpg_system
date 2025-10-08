# Text Sprite System

A comprehensive, production-ready text sprite creation system for the TTRPG game client.

## Features

### ✨ Advanced Text Rendering
- **Typography Control**: Full font family, weight, size, and alignment options
- **High-Quality Rendering**: Canvas-based rendering with device pixel ratio support for crisp text
- **Multi-line Support**: Automatic line breaks and configurable line height
- **Letter Spacing**: Fine control over character spacing

### 🎨 Visual Styling
- **Color System**: Text color, background color, and border color support
- **Effects**: Text shadows with blur, offset, and color control
- **Backgrounds**: Optional solid color backgrounds with opacity
- **Borders**: Configurable border width and color
- **Opacity**: Global opacity control for the entire sprite

### 🔄 Transform Controls
- **Rotation**: 360-degree rotation support
- **Positioning**: Precise X,Y coordinate placement
- **Padding**: Internal padding control for spacing
- **Alignment**: Left, center, right text alignment

### 🛠️ Professional Tools
- **Live Preview**: Real-time preview canvas showing exact output
- **Modal Interface**: Full-screen modal with organized controls
- **Error Handling**: Comprehensive error boundaries and validation
- **Network Sync**: Automatic synchronization with game server
- **Undo/Redo**: Future support for edit history

## Components

### TextSpriteCreator
The main creation/editing modal with all styling options.

```tsx
import { TextSpriteCreator } from './components/TextSprite';

<TextSpriteCreator
  isOpen={true}
  onClose={() => setIsOpen(false)}
  onCreateSprite={(config, position) => {
    console.log('Created text sprite:', config);
  }}
  activeLayer="tokens"
  initialPosition={{ x: 100, y: 100 }}
/>
```

### TextSpriteTool
A compact button component for integration into tool panels.

```tsx
import { TextSpriteTool } from './components/TextSprite';

<TextSpriteTool
  activeLayer="tokens"
  onSpriteCreated={(spriteId) => console.log('Created:', spriteId)}
  onError={(error) => console.error('Error:', error)}
/>
```

### TextSpriteEditor
For editing existing text sprites (extends TextSpriteCreator).

```tsx
import { TextSpriteEditor } from './components/TextSprite';

<TextSpriteEditor
  spriteId="text_123"
  initialConfig={{ text: "Hello World", fontSize: 32 }}
  initialPosition={{ x: 200, y: 100 }}
  layer="tokens"
  isOpen={true}
  onClose={() => setIsOpen(false)}
  onUpdated={(spriteId) => console.log('Updated:', spriteId)}
  onDeleted={(spriteId) => console.log('Deleted:', spriteId)}
/>
```

## Utility Functions

### createTextSprite
Creates a new text sprite and adds it to the game.

```tsx
import { createTextSprite } from './components/TextSprite';

const spriteId = await createTextSprite(
  {
    text: "Hello World",
    fontSize: 24,
    color: "#ff0000",
    hasBackground: true,
    backgroundColor: "#ffffff"
  },
  { x: 100, y: 100 },
  "tokens",
  (id) => console.log('Success:', id),
  (error) => console.error('Error:', error)
);
```

### updateTextSprite
Updates an existing text sprite.

```tsx
import { updateTextSprite } from './components/TextSprite';

await updateTextSprite(
  "sprite_id",
  newConfig,
  { x: 200, y: 200 },
  "tokens"
);
```

### deleteTextSprite
Removes a text sprite from the game.

```tsx
import { deleteTextSprite } from './components/TextSprite';

deleteTextSprite("sprite_id");
```

## Configuration Interface

```tsx
interface TextSpriteConfig {
  // Content
  text: string;
  
  // Typography
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  textAlign: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  
  // Colors
  color: string;
  backgroundColor: string;
  borderColor: string;
  
  // Effects
  hasBackground: boolean;
  hasBorder: boolean;
  borderWidth: number;
  textShadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  
  // Transform
  opacity: number;
  rotation: number;
  padding: number;
}
```

## Integration

The text sprite system is integrated into the main ToolsPanel:

1. **Tool Selection**: Click the "🔤 Text" button to activate text mode
2. **Creation Interface**: Click "📝 Add Text" to open the creation modal  
3. **Live Preview**: See exactly how your text will appear before creating
4. **Network Sync**: Text sprites automatically sync across all connected clients

## Architecture

### Rendering Pipeline
1. **Canvas Generation**: Text is rendered to an HTML5 canvas with proper scaling
2. **Texture Loading**: Canvas is converted to WebGL texture via WASM interface
3. **Sprite Creation**: WASM sprite object is created and added to the render layer
4. **Network Broadcast**: Sprite data is sent to server for multi-client sync

### Performance Optimizations
- **Device Pixel Ratio**: High-DPI display support for crisp text
- **Canvas Caching**: Rendered text textures are cached for reuse
- **Efficient Updates**: Only changed properties trigger re-render
- **Memory Management**: Automatic texture cleanup when sprites are deleted

### Error Handling
- **Validation**: Input validation at every step
- **Fallbacks**: Graceful degradation if WebGL features unavailable
- **Error Boundaries**: React error boundaries prevent crashes
- **Logging**: Comprehensive logging for debugging

## Browser Support

- **Modern Browsers**: Chrome 90+, Firefox 90+, Safari 14+, Edge 90+
- **Canvas 2D**: Required for text rendering
- **WebGL**: Required for game integration
- **ES2020**: Modern JavaScript features used throughout

## Future Enhancements

- **Rich Text**: HTML/Markdown text support
- **Font Loading**: Custom font file support
- **Animation**: Text animation effects
- **Templates**: Predefined text style templates
- **Collaborative Editing**: Real-time collaborative text editing
- **Accessibility**: Screen reader and keyboard navigation support

## Testing

The text sprite system includes:
- **Unit Tests**: Component logic and utility functions
- **Integration Tests**: End-to-end text sprite creation workflow  
- **Visual Tests**: Canvas rendering accuracy
- **Performance Tests**: Memory usage and rendering benchmarks

## Security

- **Input Sanitization**: All text input is properly sanitized
- **Canvas Security**: Safe canvas-to-texture conversion
- **Network Validation**: Server-side validation of sprite data
- **XSS Prevention**: No innerHTML or dynamic script execution