"""
Attribute-first ingest of .pbrain coordinates into Blender.

A coordinate is a 24-field semantic record, not a pixel, so it crosses as a
Blender attribute field — the same shape Geometry Nodes already processes.

Identity lives in ID custom properties because datablock names collide-rename
silently. Lookup is by custom property, never by .name.

Representation: a POINTCLOUD. Its native domain is POINT, so every wire
attribute lands one-to-one with no invented topology — the same property the
previous mesh encoding was chosen for, except a point cloud is geometry the
renderer can actually see. A vertex-only mesh is invisible to Cycles, which
made every pixel receipt independent of the asset it claimed to be about.

Points are sized by a `radius` attribute. Without it the cloud renders empty
and the receipt silently goes back to describing nothing.
"""

import json

import bpy

PACKET_ID_KEY = "pb_packet_id"
CHECKSUM_KEY = "pb_source_checksum"
POLICY_KEY = "pb_color_policy"
SCALES_KEY = "pb_scales"
INTERN_KEY = "pb_intern_tables"

# Positions are int32 at PIXEL scale, so adjacent coordinates sit one unit
# apart. A radius of half a unit makes neighbouring points touch without
# overlapping — the coordinate lattice renders as a contiguous surface.
POINT_RADIUS = 0.5


def ingest_wire(wire):
    """
    Create a point cloud object from wire packet coordinates.
    Each coordinate becomes a point with named attributes.
    Returns the created object.
    """
    count = wire["coordinateCount"]
    positions = wire["positions"]

    pc = bpy.data.pointclouds.new(f"pb_{wire['packetId']}")
    pc.resize(count)

    # Positions are int32 at PIXEL scale (1:1), so they ARE the coordinates.
    flat = []
    for i in range(count):
        flat.extend(
            (
                float(positions["x"][i]),
                float(positions["y"][i]),
                float(positions["z"][i]),
            )
        )
    pc.attributes["position"].data.foreach_set("vector", flat)

    # Radius is what makes the cloud visible. Declared, not inferred.
    if "radius" not in pc.attributes:
        pc.attributes.new(name="radius", type="FLOAT", domain="POINT")
    pc.attributes["radius"].data.foreach_set("value", [POINT_RADIUS] * count)

    # Add named attributes for every wire attribute
    for name, values in wire["attributes"].items():
        attr = pc.attributes.new(name=name, type="INT", domain="POINT")
        attr.data.foreach_set("value", list(values))

    # Add color attributes
    for name, values in wire["colors"].items():
        attr = pc.attributes.new(name=f"pb_color_{name}", type="INT", domain="POINT")
        attr.data.foreach_set("value", list(values))

    # Add energy channel attributes
    for channel, values in wire["energy"].items():
        attr = pc.attributes.new(name=f"pb_energy_{channel}", type="INT", domain="POINT")
        attr.data.foreach_set("value", list(values))

    obj = bpy.data.objects.new(f"pb_{wire['packetId']}", pc)
    bpy.context.scene.collection.objects.link(obj)

    # Custom properties: float64-exact and int32-capped. Carried, never computed.
    obj[PACKET_ID_KEY] = wire["packetId"]
    obj[CHECKSUM_KEY] = wire["sourceChecksum"]
    obj[POLICY_KEY] = wire["colorPolicy"]
    # Store scales and intern tables as JSON strings (custom props can't hold dicts)
    obj[SCALES_KEY] = json.dumps(wire["scales"])
    obj[INTERN_KEY] = json.dumps(wire["intern"])

    return obj


def find_by_packet_id(packet_id):
    """Lookup by custom property. Never by .name — names silently drift."""
    for obj in bpy.data.objects:
        if obj.get(PACKET_ID_KEY) == packet_id:
            return obj
    return None
