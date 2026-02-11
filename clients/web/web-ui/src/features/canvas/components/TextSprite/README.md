# Text Sprite System

A compact description of the text sprite utilities used by the client.

## What this provides
- Create text rendered to a canvas and exposed to the engine as a sprite/texture.
- Controls for basic typography, color, background, border, opacity, rotation, and positioning.
- Helpers to create, update, and delete text sprites and a UI component for creating sprites.

## Usage (basic)
- To open the creation UI, use the `TextSpriteCreator` component.

### Example (component)

```tsx
import { TextSpriteCreator } from './components/TextSprite';

<TextSpriteCreator
  isOpen={true}
  onClose={() => setIsOpen(false)}
  onCreateSprite={(config, position) => {
    // config: Text sprite options, position: { x, y }
  }}
  activeLayer="tokens"
  initialPosition={{ x: 100, y: 100 }}
/>
```

## Programmatic API (summary)
- `createTextSprite(config, position, layer)`: creates a text sprite in the given layer and returns the sprite id.
- `updateTextSprite(spriteId, config, position, layer)`: updates sprite properties or position.
- `deleteTextSprite(spriteId)`: removes the sprite and cleans up resources.

## TextSpriteConfig (fields you will commonly use)
- `text`: string
- `fontSize`: number
- `fontFamily?`: string
- `color?`: string
- `hasBackground?`: boolean
- `backgroundColor?`: string
- `hasBorder?`: boolean
- `borderWidth?`: number
- `opacity?`: number
- `rotation?`: number
- `padding?`: number

## Integration notes
- The system renders text to a canvas and converts that to a texture consumed by the WASM render engine.
- Network synchronization, caching, and advanced editing flows are implemented where needed in the app; the README focuses only on the local creation API.

## Testing
- There are unit tests for component logic and helpers. Canvas rendering is covered by integration tests where visual output is important.

If you need more detail about a specific function or config option, tell me which one and I will expand the example or add exact argument shapes.