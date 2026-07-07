local spr = app.open("docs/references/bespoke-chest3-aseprite.aseprite")
if spr == nil then
  print("Failed to open sprite")
  return
end
print("Layers:")
for i, layer in ipairs(spr.layers) do
  print(i .. ": " .. layer.name)
end
print("Frames:", #spr.frames)
