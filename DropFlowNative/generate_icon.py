import os
import subprocess
from PIL import Image, ImageDraw

def create_icon():
    size = 1024
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded squircle
    margin = 80
    rect = [margin, margin, size - margin, size - margin]
    radius = 200

    # Gradient background
    base_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    base_draw = ImageDraw.Draw(base_img)
    base_draw.rounded_rectangle(rect, radius=radius, fill=(15, 20, 35, 255))

    # Add gradient overlay
    for y in range(margin, size - margin):
        ratio = (y - margin) / (size - 2 * margin)
        r = int(12 + 40 * ratio)
        g = int(24 + 10 * ratio)
        b = int(50 + 90 * ratio)
        base_draw.line([(margin, y), (size - margin, y)], fill=(r, g, b, 255))

    # Re-mask squircle
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(rect, radius=radius, fill=255)
    img.paste(base_img, (0, 0), mask)

    # Border stroke
    border_draw = ImageDraw.Draw(img)
    border_draw.rounded_rectangle(rect, radius=radius, outline=(0, 242, 254, 120), width=8)

    # Stylized ⚡ lightning icon in center
    cx, cy = size // 2, size // 2
    bolt_points = [
        (cx + 40, cy - 260),
        (cx - 140, cy + 20),
        (cx - 10, cy + 20),
        (cx - 50, cy + 260),
        (cx + 150, cy - 40),
        (cx + 20, cy - 40),
    ]

    # Draw cyan glow
    for offset in range(12, 0, -2):
        border_draw.polygon(bolt_points, fill=(0, 242, 254, int(255 * (1 - offset / 14))))

    # Draw main lightning gradient/fill
    border_draw.polygon(bolt_points, fill=(0, 242, 254, 255))

    # Save to iconset
    iconset_dir = "AppIcon.iconset"
    os.makedirs(iconset_dir, exist_ok=True)

    sizes = [
        (16, "icon_16x16.png"),
        (32, "icon_16x16@2x.png"),
        (32, "icon_32x32.png"),
        (64, "icon_32x32@2x.png"),
        (128, "icon_128x128.png"),
        (256, "icon_128x128@2x.png"),
        (256, "icon_256x256.png"),
        (512, "icon_256x256@2x.png"),
        (512, "icon_512x512.png"),
        (1024, "icon_512x512@2x.png"),
    ]

    for s, name in sizes:
        resized = img.resize((s, s), Image.Resampling.LANCZOS)
        resized.save(os.path.join(iconset_dir, name))

    subprocess.run(["iconutil", "-c", "icns", iconset_dir, "-o", "AppIcon.icns"], check=True)
    print("AppIcon.icns successfully generated!")

if __name__ == "__main__":
    create_icon()
