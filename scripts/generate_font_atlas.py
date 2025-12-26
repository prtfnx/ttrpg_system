"""
Bitmap Font Atlas Generator for WebGL Text Rendering
Generates a production-ready font atlas texture and metadata JSON

Usage:
    python generate_font_atlas.py

Output:
    - clients/web/public/assets/font_atlas.png (512x512 RGBA texture)
    - clients/web/public/assets/font_atlas.json (glyph metadata)
"""

from PIL import Image, ImageDraw, ImageFont
import json
import os

# Configuration
ATLAS_SIZE = 512  # 512x512 texture
CHAR_SIZE = 32    # Each character cell is 32x32 pixels
CHARS_PER_ROW = 16  # 16 characters per row
FONT_SIZE = 28    # Font size (slightly smaller than cell for padding)
PADDING = 2       # Padding around each character

# ASCII printable characters (32-127)
START_CHAR = 32  # Space
END_CHAR = 127   # DEL (we'll include 32-126, which is tilde ~)
CHAR_COUNT = END_CHAR - START_CHAR

# Character set to render
CHARS = ''.join(chr(i) for i in range(START_CHAR, END_CHAR))

def create_font_atlas():
    """Generate the font atlas texture and metadata"""
    
    # Create transparent RGBA image
    atlas = Image.new('RGBA', (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(atlas)
    
    # Load font - try multiple common Windows fonts
    font = None
    font_paths = [
        'C:/Windows/Fonts/consola.ttf',  # Consolas (best for monospace)
        'C:/Windows/Fonts/cour.ttf',     # Courier New
        'C:/Windows/Fonts/arial.ttf',    # Arial (fallback)
    ]
    
    for font_path in font_paths:
        if os.path.exists(font_path):
            try:
                font = ImageFont.truetype(font_path, FONT_SIZE)
                print(f"✅ Loaded font: {os.path.basename(font_path)}")
                break
            except Exception as e:
                print(f"⚠️  Failed to load {font_path}: {e}")
                continue
    
    if font is None:
        print("❌ No TrueType font found, using default bitmap font")
        font = ImageFont.load_default()
    
    # Metadata for each character
    glyph_metadata = {}
    
    # Render each character
    for i, char in enumerate(CHARS):
        # Calculate position in atlas grid
        grid_x = i % CHARS_PER_ROW
        grid_y = i // CHARS_PER_ROW
        
        # Pixel position in atlas
        pixel_x = grid_x * CHAR_SIZE
        pixel_y = grid_y * CHAR_SIZE
        
        # Get text bounding box to center the character
        try:
            bbox = draw.textbbox((0, 0), char, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
        except:
            # Fallback for older Pillow versions
            text_width, text_height = draw.textsize(char, font=font)
        
        # Center character in cell
        char_x = pixel_x + (CHAR_SIZE - text_width) // 2
        char_y = pixel_y + (CHAR_SIZE - text_height) // 2
        
        # Draw character (white color with full opacity)
        draw.text((char_x, char_y), char, font=font, fill=(255, 255, 255, 255))
        
        # Calculate UV coordinates (normalized 0.0-1.0)
        uv_x = grid_x / CHARS_PER_ROW
        uv_y = grid_y / CHARS_PER_ROW  # Same denominator since it's square
        uv_width = 1.0 / CHARS_PER_ROW
        uv_height = 1.0 / CHARS_PER_ROW
        
        # Store metadata
        char_code = ord(char)
        glyph_metadata[char] = {
            'char_code': char_code,
            'atlas_index': i,
            'grid_x': grid_x,
            'grid_y': grid_y,
            'pixel_x': pixel_x,
            'pixel_y': pixel_y,
            'uv_x': uv_x,
            'uv_y': uv_y,
            'uv_width': uv_width,
            'uv_height': uv_height,
            'char_width': CHAR_SIZE,
            'char_height': CHAR_SIZE,
        }
    
    # Create output directory if it doesn't exist
    output_dir = os.path.join('clients', 'web', 'public', 'assets')
    os.makedirs(output_dir, exist_ok=True)
    
    # Save atlas texture
    atlas_path = os.path.join(output_dir, 'font_atlas.png')
    atlas.save(atlas_path, 'PNG')
    print(f"✅ Saved font atlas: {atlas_path}")
    
    # Save metadata JSON
    metadata = {
        'atlas_width': ATLAS_SIZE,
        'atlas_height': ATLAS_SIZE,
        'char_size': CHAR_SIZE,
        'chars_per_row': CHARS_PER_ROW,
        'start_char': START_CHAR,
        'end_char': END_CHAR,
        'char_count': CHAR_COUNT,
        'glyphs': glyph_metadata,
    }
    
    metadata_path = os.path.join(output_dir, 'font_atlas.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"✅ Saved metadata: {metadata_path}")
    
    # Print statistics
    print(f"\n📊 Atlas Statistics:")
    print(f"   Atlas Size: {ATLAS_SIZE}x{ATLAS_SIZE}")
    print(f"   Character Count: {CHAR_COUNT}")
    print(f"   Cell Size: {CHAR_SIZE}x{CHAR_SIZE}")
    print(f"   Grid Layout: {CHARS_PER_ROW}x{(CHAR_COUNT + CHARS_PER_ROW - 1) // CHARS_PER_ROW}")
    print(f"   Memory Usage: ~{(ATLAS_SIZE * ATLAS_SIZE * 4) // 1024} KB")
    
    # Show preview of some characters
    print(f"\n🔤 Sample Characters:")
    sample_chars = ['0', '5', '9', 'A', 'Z', 'a', 'z', '.', 'f', 't']
    for ch in sample_chars:
        if ch in glyph_metadata:
            meta = glyph_metadata[ch]
            print(f"   '{ch}' -> UV({meta['uv_x']:.4f}, {meta['uv_y']:.4f}) Grid({meta['grid_x']}, {meta['grid_y']})")

if __name__ == '__main__':
    print("🎨 Bitmap Font Atlas Generator")
    print("=" * 50)
    create_font_atlas()
    print("\n✨ Font atlas generation complete!")
