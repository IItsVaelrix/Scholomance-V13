import random

def point_in_polygon(x, y, polygon):
    n = len(polygon)
    inside = False
    p1x, p1y = polygon[0]
    for i in range(1, n + 1):
        p2x, p2y = polygon[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

points = [[32, 8], [41, 15], [50, 21], [54, 35], [53, 57], [47, 73], [39, 83], [32, 89], [25, 83], [17, 73], [11, 57], [10, 35], [14, 21], [23, 15]]
ruby_points = [[32, 36], [40, 44], [32, 53], [24, 44]]
sigil_ring_radius = 15
sigil_center = (32, 44)

colors = ["charcoal_steel", "dark_iron", "deep_shadow"]
random.seed("infernal-face-plate-v1")

cells = []
for x in range(10, 55):
    for y in range(8, 90):
        # We also want to avoid the sigil ring which is radius 15
        dx = x - sigil_center[0]
        dy = y - sigil_center[1]
        dist_sq = dx*dx + dy*dy
        
        if point_in_polygon(x, y, points) and not point_in_polygon(x, y, ruby_points):
            # Avoid the central sigil ring (radius 15 + a little padding)
            if dist_sq > 16*16:
                if random.random() < 0.18:
                    c = random.choice(colors)
                    cells.append(f"  cell {x} {y} {c}")

with open("texture_cells.txt", "w") as f:
    f.write("\n".join(cells))
    f.write("\n")
