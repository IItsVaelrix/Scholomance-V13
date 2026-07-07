64x64 Aseprite Pixel Placement Blueprint

Sprite: Vaelrix Chibi
Canvas: 64x64 px
Background: Transparent
Origin: Top-left
Rules: No anti-aliasing, no gradients, no semi-transparent pixels, indexed palette only.

1. Palette Table
ID	HEX	Name	Usage
P00	Transparent	Empty	Background only
P01	#15121A	Ink Outline	Main silhouette and hard internal cuts
P02	#2A2430	Soft Inner Rim	Coat highlight, secondary dark detail
P03	#F2C7A5	Skin Base	Face, neck, hands
P04	#D99B78	Skin Shadow	Bottom-right face and hands
P05	#FFE0C2	Skin Highlight	Top-left face highlights
P06	#101018	Hair Base	Near-black hair mass
P07	#28203A	Hair Midtone	Hair depth clusters
P08	#4A316A	Hair Violet Highlight	Top-left hair shine
P09	#FFFFFF	Eye Shine	Eye sparkle pixels
P10	#21163D	Violet Iris	Eye iris
P11	#0B0B0F	Eye Black	Pupils, eyelids, mouth line
P12	#24202A	Coat Base	Main outfit
P13	#0F0D14	Coat Shadow	Right-side coat, boots, underside
P14	#7E1F36	Crimson Accent	Collar, sash, mouth
P15	#7C55D9	Violet Accent	Chest glyph, trim

Palette count: 15 visible colors plus transparent.

2. Aseprite Layer Stack

Bottom to top:

00_Transparent_BG
01_Skin_Base
02_Outfit_Base
03_Hair_Base
04_Accent_Details
05_Shading
06_Face_Eyes
07_Highlights
08_Outline_and_Inner_Lines
3. Construction Guide
Part	Bounding Box
Head	x=14-49, y=04-35
Hair	x=14-49, y=04-23
Face	x=18-45, y=16-35
Eyes	Left: x=23-29, y=20-26. Right: x=34-41, y=20-26
Body	x=21-42, y=35-52
Arms	Left: x=16-25, y=37-50. Right: x=38-47, y=37-50
Legs	Left: x=24-31, y=52-60. Right: x=33-40, y=52-60
Feet	Left: x=21-31, y=58-61. Right: x=33-43, y=58-61
Accessories	Collar: x=28-35, y=36-38. Sash: x=26-37, y=47-48. Chest glyph: x=29-34, y=40-43
4. Pixel Placement Blueprint
Layer: 08_Outline_and_Inner_Lines

Color: P01 / #15121A

y=04: x=28-35
y=05: x=24-27, x=36-39
y=06: x=21-23, x=40-42
y=07: x=19-20, x=43-44
y=08: x=17-18, x=45-46
y=09: x=16-16, x=47-47
y=10: x=15-15, x=48-48
y=11: x=15-15, x=48-48
y=12: x=14-14, x=49-49
y=13: x=14-14, x=49-49
y=14: x=14-14, x=49-49
y=15: x=14-14, x=49-49
y=16: x=14-14, x=24-25, x=34-38, x=49-49
y=17: x=14-14, x=23-26, x=33-40, x=49-49
y=18: x=14-14, x=23-27, x=32-41, x=49-49
y=19: x=15-15, x=22-22, x=42-42, x=48-48
y=20: x=15-15, x=48-48
y=21: x=16-16, x=47-47
y=22: x=16-16, x=47-47
y=23: x=17-17, x=46-46
y=24: x=17-17, x=46-46
y=25: x=18-18, x=45-45
y=26: x=18-18, x=45-45
y=27: x=19-19, x=44-44
y=28: x=19-19, x=44-44
y=29: x=20-20, x=43-43
y=30: x=20-20, x=43-43
y=31: x=21-21, x=42-42
y=32: x=22-22, x=41-41
y=33: x=23-24, x=39-40
y=34: x=25-38
y=35: x=25-25, x=38-38
y=36: x=23-27, x=36-40
y=37: x=18-22, x=24-26, x=37-39, x=41-45
y=38: x=17-17, x=46-46
y=39: x=16-16, x=47-47
y=40: x=16-16, x=47-47
y=41: x=16-16, x=47-47
y=42: x=16-16, x=47-47
y=43: x=16-16, x=47-47
y=44: x=16-16, x=47-47
y=45: x=16-16, x=47-47
y=46: x=16-16, x=47-47
y=47: x=17-17, x=46-46
y=48: x=18-18, x=25-38, x=45-45
y=49: x=19-19, x=44-44
y=50: x=20-23, x=40-43
y=51: x=24-24, x=39-39
y=52: x=24-24, x=30-33, x=40-40
y=53: x=24-24, x=30-34, x=40-40
y=54: x=24-24, x=30-34, x=40-40
y=55: x=24-24, x=30-34, x=40-40
y=56: x=24-24, x=30-34, x=40-40
y=57: x=24-24, x=30-34, x=40-40
y=58: x=22-23, x=31-33, x=41-42
y=59: x=21-21, x=31-33, x=43-43
y=60: x=21-22, x=31-31, x=33-33, x=42-43
y=61: x=23-30, x=34-41
Layer: 01_Skin_Base

Color: P03 / #F2C7A5

y=16: x=24-25, x=34-38
y=17: x=23-26, x=33-40
y=18: x=23-27, x=32-41
y=19: x=22-42
y=20: x=21-43
y=21: x=20-44
y=22: x=19-44
y=23: x=19-44
y=24: x=18-45
y=25: x=19-44
y=26: x=19-44
y=27: x=20-43
y=28: x=20-43
y=29: x=21-42
y=30: x=21-42
y=31: x=22-41
y=32: x=23-40
y=33: x=25-38
y=34: x=26-37
y=35: x=27-36
y=36: x=29-34
y=37: x=30-33
y=38: x=30-33
y=48: x=19-23, x=40-44
y=49: x=20-24, x=39-43
y=50: x=24-24, x=39-39
Layer: 03_Hair_Base

Color: P06 / #101018

y=05: x=28-35
y=06: x=24-39
y=07: x=21-42
y=08: x=19-44
y=09: x=17-46
y=10: x=16-47
y=11: x=16-47
y=12: x=15-48
y=13: x=15-48
y=14: x=15-48
y=15: x=15-48
y=16: x=15-23, x=26-33, x=39-48
y=17: x=15-22, x=27-32, x=41-48
y=18: x=15-22, x=28-31, x=42-48
y=19: x=16-21, x=43-47
y=20: x=16-20, x=44-47
y=21: x=17-19, x=45-46
y=22: x=17-18, x=45-46
y=23: x=18-18, x=45-45
Layer: 02_Outfit_Base

Color: P12 / #24202A

y=35: x=26-28, x=35-37
y=36: x=25-28, x=35-38
y=37: x=23-29, x=34-40
y=38: x=18-29, x=34-45
y=39: x=17-46
y=40: x=17-46
y=41: x=17-46
y=42: x=17-46
y=43: x=17-46
y=44: x=17-46
y=45: x=17-46
y=46: x=17-46
y=47: x=18-45
y=48: x=24-39
y=49: x=25-38
y=50: x=25-38
y=51: x=25-38
y=52: x=25-30, x=34-39
y=53: x=25-29, x=35-39
y=54: x=25-29, x=35-39
y=55: x=25-29, x=35-39
y=56: x=25-29, x=35-39
y=57: x=25-29, x=35-39
y=58: x=24-30, x=34-40
y=59: x=22-30, x=34-42
y=60: x=23-30, x=34-41
Layer: 04_Accent_Details

Color: P14 / #7E1F36

y=36: x=28-35
y=37: x=29-34
y=38: x=30-33
y=47: x=26-37
y=48: x=26-37
Layer: 04_Accent_Details

Color: P15 / #7C55D9

y=39: x=23-23, x=40-40
y=40: x=23-23, x=30-33, x=40-40
y=41: x=23-23, x=29-34, x=40-40
y=42: x=23-23, x=30-33, x=40-40
y=43: x=24-24, x=31-32, x=39-39
y=44: x=24-24, x=39-39
y=45: x=24-24, x=39-39
y=46: x=25-25, x=38-38
Layer: 06_Face_Eyes

Color: P11 / #0B0B0F

y=20: x=23-29, x=35-41
y=21: x=24-28, x=35-39
y=22: x=23-24, x=28-29, x=34-35, x=39-40
y=23: x=23-24, x=27-29, x=34-35, x=38-40
y=24: x=23-24, x=28-29, x=34-35, x=39-40
y=25: x=24-25, x=28-28, x=35-36, x=39-39
y=26: x=25-27, x=36-38
y=30: x=30-33
Layer: 06_Face_Eyes

Color: P10 / #21163D

y=22: x=26-27, x=37-38
y=23: x=25-26, x=36-37
y=24: x=25-27, x=36-38
y=25: x=26-27, x=37-38
Layer: 06_Face_Eyes

Color: P09 / #FFFFFF

y=22: x=25-25, x=36-36
Layer: 06_Face_Eyes

Color: P14 / #7E1F36

y=31: x=31-32
5. Shading Blueprint
Skin Shadow

Layer: 05_Shading
Color: P04 / #D99B78

y=24: x=41-44
y=25: x=39-44
y=26: x=38-43
y=27: x=37-43
y=28: x=35-42
y=29: x=34-41
y=30: x=34-41
y=31: x=33-40
y=32: x=32-39
y=33: x=31-38
y=34: x=31-36
y=49: x=23-24, x=42-43
y=50: x=24-24
Coat Shadow

Layer: 05_Shading
Color: P13 / #0F0D14

y=39: x=40-46
y=40: x=40-46
y=41: x=40-46
y=42: x=40-46
y=43: x=40-46
y=44: x=40-46
y=45: x=39-46
y=46: x=38-45
y=49: x=34-38
y=50: x=34-38
y=51: x=34-38
y=52: x=28-30, x=37-39
y=53: x=28-29, x=37-39
y=54: x=28-29, x=37-39
y=55: x=28-29, x=37-39
y=56: x=28-29, x=37-39
y=57: x=28-29, x=37-39
y=58: x=27-30, x=38-40
y=59: x=26-30, x=38-42
y=60: x=26-30, x=38-41
Hair Midtone

Layer: 05_Shading
Color: P07 / #28203A

y=08: x=21-29
y=09: x=19-30
y=10: x=18-27, x=35-44
y=11: x=17-26, x=34-45
y=12: x=16-24, x=34-46
y=13: x=16-23, x=35-46
y=14: x=16-22, x=36-46
y=15: x=16-21, x=37-46
y=16: x=16-20, x=39-46
y=17: x=16-19, x=42-46
y=18: x=17-20, x=43-46
y=19: x=17-20, x=44-46
Skin Highlights

Layer: 07_Highlights
Color: P05 / #FFE0C2

y=18: x=24-26
y=19: x=23-28
y=20: x=22-30
y=21: x=21-27
y=22: x=20-25
y=23: x=20-24
y=24: x=20-23
y=28: x=24-27
y=29: x=24-25
Hair Highlights

Layer: 07_Highlights
Color: P08 / #4A316A

y=06: x=25-33
y=07: x=22-35
y=08: x=20-31
y=09: x=18-26
y=10: x=17-23
y=11: x=16-21
y=12: x=16-20
y=13: x=17-20
y=16: x=27-31
y=17: x=28-31
Outfit Highlights

Layer: 07_Highlights
Color: P02 / #2A2430

y=37: x=23-28
y=38: x=22-29
y=39: x=22-28
y=40: x=22-27
y=41: x=22-26
y=42: x=22-25
y=43: x=22-25
y=49: x=25-28
y=50: x=25-29
y=53: x=25-26, x=35-36
y=54: x=25-26, x=35-36
6. Cleanup Pass
Remove
Remove any accidental pixels outside x=14-49, y=04-61 unless intentionally added later.
Remove isolated single pixels not touching another pixel by edge or corner.
Remove any color not listed in the palette table.
Add
Add P01 outline reinforcement at:
y=34: x=25-38
y=48: x=25-38
y=61: x=23-30, x=34-41
Adjust
If eyes blur at 32x32, darken both iris clusters by replacing:
P10 at y=25 x=26-27 with P11
P10 at y=25 x=37-38 with P11
If the sash overpowers the body, replace:
y=48 x=26-37 from P14 to P02
If the hair reads too flat, keep P08 only on y=06-10 and delete lower hair highlights at y=16-17.
7. Aseprite Build Instructions
Create a new sprite:
Width: 64 px
Height: 64 px
Color Mode: Indexed
Background: Transparent
Add the palette exactly as listed:
Keep P00 as transparent.
Add P01 through P15 in order.
Create layers bottom to top:
00_Transparent_BG
01_Skin_Base
02_Outfit_Base
03_Hair_Base
04_Accent_Details
05_Shading
06_Face_Eyes
07_Highlights
08_Outline_and_Inner_Lines
Set Pencil Tool:
Size: 1 px
Opacity: 100%
Anti-aliasing: Off
Pixel-perfect: On
Paint the base forms:
Fill 01_Skin_Base.
Fill 02_Outfit_Base.
Fill 03_Hair_Base.
Paint accent details:
Add crimson collar and sash on 04_Accent_Details.
Add violet glyph and trim on 04_Accent_Details.
Paint shadows:
Add skin shadow, coat shadow, and hair midtone on 05_Shading.
Paint face:
Add eyes, irises, eye shine, and mouth on 06_Face_Eyes.
Paint highlights:
Add skin highlights, hair highlights, and outfit highlights on 07_Highlights.
Paint final outline:
Add all P01 silhouette and inner-line pixels on 08_Outline_and_Inner_Lines.
Toggle onion/preview:
View at 100%.
View at 200%.
View at 50% to simulate 32x32 readability.
Export:
File type: PNG
Background: Transparent
Scale: 1x for game-ready source
Optional preview: export 4x nearest-neighbor copy
8. QA Checklist
Check	Pass Criteria
Readable at 64x64	Head, eyes, coat, sash, and feet are clear
Readable at 32x32	Silhouette still reads as chibi humanoid
Palette under 16 colors	15 visible colors plus transparent
No anti-aliasing	Every pixel is hard-edged
No gradients	Shading uses discrete clusters only
No semi-transparent pixels	All visible pixels are 100% opacity
No orphan pixels	Every visible pixel touches another by edge or corner
No coordinates outside canvas	All listed pixels stay within x=0-63 and y=0-63
Top-left light source	Highlights sit on upper-left clusters
Clean outline	P01 forms continuous readable silhouette
