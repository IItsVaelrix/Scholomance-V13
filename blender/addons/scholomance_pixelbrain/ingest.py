"""
Attribute-first ingest of .pbrain coordinates into Blender.

A coordinate is a 24-field semantic record, not a pixel, so it crosses as a
Blender attribute field — the same shape Geometry Nodes already processes.

Identity lives in ID custom properties because datablock names collide-rename
silently. Lookup is by custom property, never by .name.

NOTE: Blender 5.2 does not have bpy.data.pointclouds. Coordinates are ingested
as a MESH with only vertices (no faces/edges), carrying named attributes on the
POINT domain. This preserves the attribute-field semantics without inventing
topology the packet does not describe.
"""

import bpy

PACKET_ID_KEY = "pb_packet_id"
CHECKSUM_KEY = "pb_source_checksum"
POLICY_KEY = "pb_color_policy"
SCALES_KEY = "pb_scales"
INTERN_KEY = "pb_intern_tables"


def ingest_wire(wire):
    """
    Create a mesh object from wire packet coordinates.
    Each coordinate becomes a vertex with named attributes.
    Returns the created object.
    """
    count = wire["coordinateCount"]
    positions = wire["positions"]

    # Build vertex list from quantized positions
    # Positions are int32 at PIXEL scale (1:1), so they ARE the coordinates
    verts = []
    for i in range(count):
        x = positions["x"][i]
        y = positions["y"][i]
        z = positions["z"][i]
        verts.append((float(x), float(y), float(z)))

    # Create mesh with vertices only — no faces, no edges
    mesh = bpy.data.meshes.new(f"pb_{wire['packetId']}")
    mesh.from_pydata(verts, [], [])
    mesh.update()

    # Add named attributes for every wire attribute
    for name, values in wire["attributes"].items():
        attr = mesh.attributes.new(name=name, type="INT", domain="POINT")
        attr.data.foreach_set("value", list(values))

    # Add color attributes
    for name, values in wire["colors"].items():
        attr = mesh.attributes.new(name=f"pb_color_{name}", type="INT", domain="POINT")
        attr.data.foreach_set("value", list(values))

    # Add energy channel attributes
    for channel, values in wire["energy"].items():
        attr = mesh.attributes.new(name=f"pb_energy_{channel}", type="INT", domain="POINT")
        attr.data.foreach_set("value", list(values))

    obj = bpy.data.objects.new(f"pb_{wire['packetId']}", mesh)
    bpy.context.scene.collection.objects.link(obj)

    # Custom properties: float64-exact and int32-capped. Carried, never computed.
    obj[PACKET_ID_KEY] = wire["packetId"]
    obj[CHECKSUM_KEY] = wire["sourceChecksum"]
    obj[POLICY_KEY] = wire["colorPolicy"]
    # Store scales and intern tables as JSON strings (custom props can't hold dicts)
    import json
    obj[SCALES_KEY] = json.dumps(wire["scales"])
    obj[INTERN_KEY] = json.dumps(wire["intern"])

    return obj


def find_by_packet_id(packet_id):
    """Lookup by custom property. Never by .name — names silently drift."""
    for obj in bpy.data.objects:
        if obj.get(PACKET_ID_KEY) == packet_id:
            return obj
    return None
