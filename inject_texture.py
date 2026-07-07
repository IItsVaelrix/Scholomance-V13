with open("texture_cells.txt", "r") as f:
    cells = f.read()

with open("docs/references/infernal_crusader_kiteshield.scdl", "r") as f:
    content = f.read()

target = "polygon 32 8 41 15 50 21 54 35 53 57 47 73 39 83 32 89 25 83 17 73 11 57 10 35 14 21 23 15 obsidian_iron"

replacement = target + "\n\n  # Generated noise texture\n" + cells

new_content = content.replace(target, replacement)

with open("docs/references/infernal_crusader_kiteshield.scdl", "w") as f:
    f.write(new_content)
