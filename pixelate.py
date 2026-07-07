from PIL import Image
import sys

def pixelate(input_path, output_path, pixel_size=64):
    img = Image.open(input_path)
    
    # Calculate aspect ratio
    aspect = img.width / img.height
    new_width = pixel_size
    new_height = int(pixel_size / aspect)
    
    # Downsize using nearest neighbor
    small_img = img.resize((new_width, new_height), Image.Resampling.NEAREST)
    
    # Save the raw small version as the actual game icon
    small_img.save(output_path)
    
    print(f"Saved pixelated version to {output_path}")

pixelate("docs/references/voidmetal_fire_chestplate.jpg", "public/assets/items/VoidmetalFireChestplate-icon.png")
