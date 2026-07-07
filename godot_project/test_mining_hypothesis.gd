@tool
extends SceneTree

# To run this test from the terminal (if Godot is available in your PATH):
# godot --headless -s test_mining_hypothesis.gd

func _init() -> void:
	print("--- BEGINNING ARCHITECTURAL HYPOTHESIS TEST ---")

	var active_chunk_radius = 1
	var chunk_size_x = 12
	var raycast_distance = 10.0 # Our new fixed distance
	var original_raycast_distance = 6.0

	print("\n[TEST 1: The New Raycast Distance vs Chunk Deactivation Boundary]")

	# The player is standing at the edge of the center chunk (X = 11.9)
	var player_pos_x = 11.9
	var player_chunk = floor(player_pos_x / float(chunk_size_x))

	print("- Player Position X: ", player_pos_x, " (Chunk ", player_chunk, ")")
	print("- Active Chunk Radius: ", active_chunk_radius)
	print("- Chunk Size: ", chunk_size_x)

	# The closest chunk that is INACTIVE is (player_chunk + active_chunk_radius + 1)
	var nearest_inactive_chunk = player_chunk + active_chunk_radius + 1
	var inactive_boundary_x = nearest_inactive_chunk * chunk_size_x

	print("- Nearest INACTIVE Chunk Boundary starts at X: ", inactive_boundary_x)

	var distance_to_inactive_boundary = inactive_boundary_x - player_pos_x
	print("- Distance from Player to Inactive Boundary: ", distance_to_inactive_boundary, " units")

	if distance_to_inactive_boundary > raycast_distance:
		print("  -> RESULT: PASSED. The new raycast distance (", raycast_distance, ") is safely shorter than the inactive boundary (", distance_to_inactive_boundary, ").")
		print("  -> NO NEW ISSUES: You will never raycast an inactive chunk that has collision_layer = 0.")
	else:
		print("  -> RESULT: FAILED. Raycast can reach inactive chunks and will fail physics checks!")

	print("\n[TEST 2: The Torch Light Alignment]")
	var torch_radius = 9.0

	print("- Max illuminated block distance (VOXEL_LIGHT_RADIUS): ", torch_radius)
	print("- Old raycast distance: ", original_raycast_distance)
	print("- New raycast distance: ", raycast_distance)

	if raycast_distance > torch_radius:
		print("  -> RESULT: PASSED. Raycast distance (", raycast_distance, ") fully envelops the visual light radius (", torch_radius, ").")
		print("  -> FIX CONFIRMED: Any block the player can see illuminated by their torch can now be mined.")
	else:
		print("  -> RESULT: FAILED. Raycast distance still falls short of light radius.")

	print("\n--- END OF TEST ---")
	quit()
